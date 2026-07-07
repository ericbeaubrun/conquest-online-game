// Reducer du jeu : fonction PURE (state, action) -> state. Toutes les règles
// de mutation vivent ici et nulle part ailleurs. C'est le point unique qui
// pourra être rejoué à l'identique côté serveur en mode « online ».

import { MOVE_SOLDIER, MERGE_SOLDIER, PLACE_ITEM, END_TURN, SET_MAP } from './actions.js';
import { getLogicalBoard, createInitialState } from './board.js';
import { computeReachable, ownedCount } from './selectors.js';
import { MERGE_MAX, BASE_INCOME } from './rules.js';
import { ITEM_COST } from '../items.js';

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
    if (!to || to.type !== 'soldier' || to.playerId !== state.activePlayerId) return state;
    const level = Math.min((to.level || 1) + (from.level || 1), MERGE_MAX);
    if (level <= (to.level || 1)) return state; // cible déjà au maximum

    const placements = new Map(state.placements);
    placements.delete(fromId);
    placements.set(toId, { ...to, level });
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
        item = { type: 'soldier', playerId: state.activePlayerId, level: 1, uid: `s${uidSeq}` };
    } else {
        item = { type: itemType, playerId: state.activePlayerId };
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
