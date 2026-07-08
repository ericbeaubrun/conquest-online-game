// Reducer du jeu : fonction PURE (state, action) -> state. Toutes les règles
// de mutation vivent ici et nulle part ailleurs. C'est le point unique qui
// pourra être rejoué à l'identique côté serveur en mode « online ».

import {
    MOVE_SOLDIER,
    MERGE_SOLDIER,
    ATTACK_SOLDIER,
    PLACE_ITEM,
    END_TURN,
    SET_MAP,
} from './actions.js';
import { getLogicalBoard, createInitialState } from './board.js';
import { computeReachable, ownedCount } from './selectors.js';
import {
    BASE_INCOME,
    SOLDIER_HP_DEFAULT,
    SOLDIER_ATK_DEFAULT,
    BUILDING_STATS,
    canMerge,
    mergedSoldier,
    combatResult,
} from './rules.js';
import { ITEM_COST } from '../items.js';

// Fabrique un soldat neuf avec ses caractéristiques par défaut. Centralisé ici
// pour que toute création de soldat parte du même modèle (stats + specs).
function makeSoldier(playerId, uid) {
    return {
        type: 'soldier',
        playerId,
        uid,
        level: 1,
        hp: SOLDIER_HP_DEFAULT,
        atk: SOLDIER_ATK_DEFAULT,
        affinity: null, // feu | glace | foudre | null
        bonus: null, // cupide | rapide | assaillant | protecteur | soigneur | bucheron | null
        behavior: null, // conquete | attaque | defense | arbre | renfort | null
    };
}

// Déplacement (repositionnement dans le territoire ou conquête d'une case).
function reduceMove(state, { fromId, toId }) {
    const soldier = state.placements.get(fromId);
    if (!soldier || soldier.type !== 'soldier') return state;
    if (soldier.playerId !== state.activePlayerId) return state; // pas ton soldat
    if (state.movedSoldiers.has(soldier.uid)) return state; // déjà joué ce tour

    const board = getLogicalBoard(state.mapId);
    const dest = computeReachable(state, board, fromId).moves.get(toId);
    if (!dest || (dest.kind !== 'move' && dest.kind !== 'conquer')) return state;

    const placements = new Map(state.placements);
    placements.delete(fromId);
    placements.set(toId, soldier);
    let ownership = state.ownership;
    if (dest.kind === 'conquer') {
        ownership = new Map(ownership);
        ownership.set(toId, state.activePlayerId);
    }
    const movedSoldiers = new Set(state.movedSoldiers).add(soldier.uid);
    return { ...state, placements, ownership, movedSoldiers };
}

// Fusion d'un soldat dans un soldat allié (niveau cumulé, plafonné).
function reduceMerge(state, { fromId, toId }) {
    const from = state.placements.get(fromId);
    if (!from || from.type !== 'soldier') return state;
    if (from.playerId !== state.activePlayerId) return state;
    if (state.movedSoldiers.has(from.uid)) return state;

    const board = getLogicalBoard(state.mapId);
    const dest = computeReachable(state, board, fromId).moves.get(toId);
    if (!dest || dest.kind !== 'merge') return state;

    const to = state.placements.get(toId);
    if (!to || to.playerId !== state.activePlayerId) return state;
    if (!canMerge(from, to)) return state; // niveaux différents ou cible au max

    const placements = new Map(state.placements);
    placements.delete(fromId);
    placements.set(toId, mergedSoldier(from, to));
    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return { ...state, placements, movedSoldiers };
}

// Combat : le soldat actif attaque un soldat ennemi adjacent. Les deux unités
// se retirent mutuellement des PV (égaux à l'attaque adverse) ; celles tombées
// à 0 meurent (retirées du plateau). L'attaquant reste sur sa case et son tour
// est consommé.
function reduceAttack(state, { fromId, toId }) {
    const from = state.placements.get(fromId);
    if (!from || from.type !== 'soldier') return state;
    if (from.playerId !== state.activePlayerId) return state;
    if (state.movedSoldiers.has(from.uid)) return state;

    const board = getLogicalBoard(state.mapId);
    const dest = computeReachable(state, board, fromId).moves.get(toId);
    if (!dest || dest.kind !== 'combat') return state;

    // La cible peut être un soldat OU une tour ennemie (déjà validée `combat`).
    const to = state.placements.get(toId);
    if (!to || to.playerId === state.activePlayerId) return state;

    const { attacker, defender } = combatResult(from, to);
    const placements = new Map(state.placements);
    if (attacker.dead) placements.delete(fromId);
    else placements.set(fromId, { ...from, hp: attacker.hp });
    if (defender.dead) placements.delete(toId);
    else placements.set(toId, { ...to, hp: defender.hp });

    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return { ...state, placements, movedSoldiers };
}

// Pose d'un item (soldat, maison, tour) sur une case du territoire actif.
function reducePlace(state, { cellId, itemType }) {
    const board = getLogicalBoard(state.mapId);
    const cell = board.cellMap.get(cellId);
    if (!cell || cell.blocked || board.baseIds.has(cellId)) return state;
    if (state.ownership.get(cellId) !== state.activePlayerId) return state;
    if (state.placements.has(cellId)) return state; // case déjà occupée

    // Achat : le joueur actif doit avoir assez d'or ; le coût est débité.
    const cost = ITEM_COST[itemType] || 0;
    const purse = state.gold[state.activePlayerId] || 0;
    if (purse < cost) return state; // fonds insuffisants

    const placements = new Map(state.placements);
    let uidSeq = state.uidSeq;
    let item;
    if (itemType === 'soldier') {
        uidSeq += 1;
        item = makeSoldier(state.activePlayerId, `s${uidSeq}`);
    } else {
        const stats = BUILDING_STATS[itemType];
        item = { type: itemType, playerId: state.activePlayerId, hp: stats?.hp ?? 0 };
        if (stats?.atk != null) item.atk = stats.atk; // tours : attaque de riposte
    }
    placements.set(cellId, item);
    const gold = { ...state.gold, [state.activePlayerId]: purse - cost };
    return { ...state, placements, gold, uidSeq };
}

// Fin de tour : le joueur actif encaisse son revenu, puis la main passe au
// suivant. Un tour complet écoulé (retour au premier joueur) incrémente le
// compteur, et chaque soldat retrouve son droit de déplacement.
function reduceEndTurn(state) {
    const { players, activePlayerId } = state;
    const idx = players.findIndex((p) => p.id === activePlayerId);
    const nextIdx = (idx + 1) % players.length;
    const income = BASE_INCOME + ownedCount(state, activePlayerId);
    return {
        ...state,
        gold: { ...state.gold, [activePlayerId]: (state.gold[activePlayerId] || 0) + income },
        turn: nextIdx === 0 ? state.turn + 1 : state.turn,
        activePlayerId: players[nextIdx].id,
        movedSoldiers: new Set(),
    };
}

export function gameReducer(state, action) {
    switch (action.type) {
        case MOVE_SOLDIER:
            return reduceMove(state, action);
        case MERGE_SOLDIER:
            return reduceMerge(state, action);
        case ATTACK_SOLDIER:
            return reduceAttack(state, action);
        case PLACE_ITEM:
            return reducePlace(state, action);
        case END_TURN:
            return reduceEndTurn(state);
        case SET_MAP:
            return createInitialState(action.mapId);
        default:
            return state;
    }
}
