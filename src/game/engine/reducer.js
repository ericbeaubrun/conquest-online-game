// Reducer du jeu : fonction PURE (state, action) -> state. Toutes les règles
// de mutation vivent ici et nulle part ailleurs. C'est le point unique qui
// pourra être rejoué à l'identique côté serveur en mode « online ».

import {
    MOVE_SOLDIER,
    MERGE_SOLDIER,
    ATTACK_SOLDIER,
    CHOP_TREE,
    PLACE_ITEM,
    BUY_BONUS,
    END_TURN,
    SET_MAP,
} from './actions.js';
import { getLogicalBoard, createInitialState } from './board.js';
import { computeReachable, incomeFor } from './selectors.js';
import {
    SOLDIER_HP_DEFAULT,
    SOLDIER_ATK_DEFAULT,
    BUILDING_STATS,
    canMerge,
    mergedSoldier,
    combatResult,
    TREE_REWARD,
    TREE_MAX_RATIO,
    TREE_TURN_RAMP,
    TREE_SPAWN_CHANCE,
} from './rules.js';
import { ITEM_COST } from '../items.js';
import { CHALLENGE_METRICS, BONUS_OFFERS, isBonusUnlocked } from '../soldier.js';
import { getNeighbors, hexId } from '../hex.js';

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
        // Avancement des défis PROPRE à ce soldat (metric -> compteur). Sert à
        // débloquer les bonus. Voir CHALLENGE_METRICS dans soldier.js.
        progress: {},
    };
}

// Renvoie une COPIE du soldat avec un compteur de défi incrémenté. Pur : ne
// mute pas le soldat d'origine (l'objet `progress` est recréé).
function withProgress(soldier, metric, amount = 1) {
    const progress = { ...soldier.progress, [metric]: (soldier.progress?.[metric] || 0) + amount };
    return { ...soldier, progress };
}

// Déplacement (repositionnement dans le territoire ou conquête d'une case).
function reduceMove(state, { fromId, toId }) {
    const soldier = state.placements.get(fromId);
    if (!soldier || soldier.type !== 'soldier') return state;
    if (soldier.playerId !== state.activePlayerId) return state; // pas ton soldat
    if (state.movedSoldiers.has(soldier.uid)) return state; // déjà joué ce tour

    const board = getLogicalBoard(state.mapId);
    const reachable = computeReachable(state, board, fromId);
    const dest = reachable.moves.get(toId);
    if (!dest || (dest.kind !== 'move' && dest.kind !== 'conquer')) return state;

    // Avancement des défis du soldat : une conquête compte 1 case conquise ; un
    // repositionnement dans son territoire compte le nombre de cases parcourues.
    let moved = soldier;
    if (dest.kind === 'conquer') {
        moved = withProgress(moved, CHALLENGE_METRICS.CASES_CONQUERED, 1);
    } else {
        const steps = reachable.dist.get(toId) || 1;
        moved = withProgress(moved, CHALLENGE_METRICS.CASES_TRAVELED_OWN, steps);
    }

    const placements = new Map(state.placements);
    placements.delete(fromId);
    placements.set(toId, moved);
    let ownership = state.ownership;
    let gold = state.gold;
    if (dest.kind === 'conquer') {
        ownership = new Map(ownership);
        ownership.set(toId, state.activePlayerId);
        // Bonus « Aventurier » : récolte 1 or par case conquise.
        if (soldier.bonus === 'adventurer') {
            const purse = state.gold[state.activePlayerId] || 0;
            gold = { ...state.gold, [state.activePlayerId]: purse + 1 };
        }
    }
    const movedSoldiers = new Set(state.movedSoldiers).add(soldier.uid);
    return { ...state, placements, ownership, gold, movedSoldiers };
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

// Abattage d'un arbre : un soldat actif adjacent détruit l'arbre, le joueur
// gagne aussitôt de l'or, et le tour du soldat est consommé.
function reduceChop(state, { fromId, toId }) {
    const from = state.placements.get(fromId);
    if (!from || from.type !== 'soldier') return state;
    if (from.playerId !== state.activePlayerId) return state;
    if (state.movedSoldiers.has(from.uid)) return state;

    const board = getLogicalBoard(state.mapId);
    const dest = computeReachable(state, board, fromId).moves.get(toId);
    if (!dest || dest.kind !== 'chop') return state;

    const tree = state.placements.get(toId);
    if (!tree || tree.type !== 'tree') return state;

    // Avancement des défis : +1 arbre abattu, et +1 si l'arbre était sur une
    // case possédée par un adversaire (territoire ennemi).
    let chopper = withProgress(from, CHALLENGE_METRICS.TREES_CHOPPED, 1);
    const treeOwner = state.ownership.get(toId);
    if (treeOwner != null && treeOwner !== state.activePlayerId) {
        chopper = withProgress(chopper, CHALLENGE_METRICS.ENEMY_TREES_CHOPPED, 1);
    }

    const placements = new Map(state.placements);
    placements.delete(toId);
    placements.set(fromId, chopper); // le soldat reste sur place, progression à jour
    // Bonus « Bûcheron » : gagne 2× plus d'or en coupant les arbres.
    const reward = from.bonus === 'lumberjack' ? TREE_REWARD * 2 : TREE_REWARD;
    const purse = state.gold[state.activePlayerId] || 0;
    const gold = { ...state.gold, [state.activePlayerId]: purse + reward };
    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return { ...state, placements, gold, movedSoldiers };
}

// Apparition d'arbres en fin de tour. Le nombre tiré croît avec l'avancée de la
// partie (jusqu'à `TREE_TURN_RAMP`) et le nombre de joueurs, mais reste borné
// par le plafond global (`TREE_MAX_RATIO` de la carte). Renvoie la nouvelle
// carte des items (inchangée si rien n'apparaît).
function spawnTrees(state, board) {
    const cap = Math.floor(board.cells.length * TREE_MAX_RATIO);
    let treeCount = 0;
    for (const p of state.placements.values()) if (p.type === 'tree') treeCount += 1;
    const room = cap - treeCount;
    if (room <= 0) return state.placements;

    // Intensité 0→1 selon l'avancée ; une tentative par joueur (les parties à
    // plus de joueurs voient donc davantage d'arbres).
    const progress = Math.min(state.turn / TREE_TURN_RAMP, 1);
    let want = 0;
    for (let i = 0; i < state.players.length; i += 1) {
        if (Math.random() < TREE_SPAWN_CHANCE * progress) want += 1;
    }
    want = Math.min(want, room);
    if (want <= 0) return state.placements;

    // Cases éligibles : libres, non bloquées (eau), hors base.
    const eligible = board.cells.filter(
        (c) => !c.blocked && !board.baseIds.has(c.id) && !state.placements.has(c.id)
    );
    if (!eligible.length) return state.placements;

    const placements = new Map(state.placements);
    for (let i = 0; i < want && eligible.length; i += 1) {
        const idx = Math.floor(Math.random() * eligible.length);
        const [cell] = eligible.splice(idx, 1);
        placements.set(cell.id, { type: 'tree' });
    }
    return placements;
}

// Bonus « Fermier » : chaque soldat-fermier du joueur actif fait apparaître 0 à
// 2 arbres sur des cases collées à SON territoire (frontière), indépendamment du
// système d'apparition normal (n'entre pas dans le plafond / la montée en
// intensité). Prend la carte des items déjà mise à jour par `spawnTrees`.
function spawnFarmerTrees(state, board, placementsIn) {
    const pid = state.activePlayerId;
    // Combien de soldats-fermiers possède le joueur actif ?
    let farmers = 0;
    for (const p of placementsIn.values()) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === 'farmer') farmers += 1;
    }
    if (farmers === 0) return placementsIn;

    // Cases frontalières : hors du territoire du joueur, libres, non bloquées,
    // hors base, mais adjacentes à au moins une case qu'il possède.
    const eligible = board.cells.filter((c) => {
        if (c.blocked || board.baseIds.has(c.id) || placementsIn.has(c.id)) return false;
        if (state.ownership.get(c.id) === pid) return false; // pas sur son propre sol
        return getNeighbors(c.q, c.r).some((n) => state.ownership.get(hexId(n.q, n.r)) === pid);
    });
    if (!eligible.length) return placementsIn;

    const placements = new Map(placementsIn);
    for (let f = 0; f < farmers; f += 1) {
        const want = Math.floor(Math.random() * 3); // 0, 1 ou 2 arbres
        for (let i = 0; i < want && eligible.length; i += 1) {
            const idx = Math.floor(Math.random() * eligible.length);
            const [cell] = eligible.splice(idx, 1); // case consommée (un arbre max)
            placements.set(cell.id, { type: 'tree' });
        }
    }
    return placements;
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

// Achat/équipement d'un bonus pour un soldat. Conditions : c'est bien le soldat
// du joueur actif, le défi du bonus est accompli, le soldat n'a pas déjà un
// bonus (un seul par soldat) et le joueur a de quoi payer. Le prix est débité et
// le soldat prend le bonus (son sprite change côté affichage).
function reduceBuyBonus(state, { cellId, bonusId }) {
    const soldier = state.placements.get(cellId);
    if (!soldier || soldier.type !== 'soldier') return state;
    if (soldier.playerId !== state.activePlayerId) return state;
    if (soldier.bonus) return state; // déjà un bonus

    const bonus = BONUS_OFFERS.find((b) => b.id === bonusId);
    if (!bonus || bonus.requiredLevel !== (soldier.level || 1)) return state;
    if (!isBonusUnlocked(soldier, bonus)) return state; // défi non accompli

    const price = bonus.price || 0;
    const purse = state.gold[state.activePlayerId] || 0;
    if (purse < price) return state; // fonds insuffisants

    const placements = new Map(state.placements);
    placements.set(cellId, { ...soldier, bonus: bonusId });
    const gold = { ...state.gold, [state.activePlayerId]: purse - price };
    return { ...state, placements, gold };
}

// Fin de tour : le joueur actif encaisse son revenu, puis la main passe au
// suivant. Un tour complet écoulé (retour au premier joueur) incrémente le
// compteur, et chaque soldat retrouve son droit de déplacement.
function reduceEndTurn(state) {
    const { players, activePlayerId } = state;
    const idx = players.findIndex((p) => p.id === activePlayerId);
    const nextIdx = (idx + 1) % players.length;
    const income = incomeFor(state, activePlayerId); // net de la pénalité d'arbres
    const board = getLogicalBoard(state.mapId);
    // Apparition normale des arbres, puis apparition « Fermier » (frontière).
    let placements = spawnTrees(state, board);
    placements = spawnFarmerTrees(state, board, placements);
    return {
        ...state,
        placements,
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
        case CHOP_TREE:
            return reduceChop(state, action);
        case PLACE_ITEM:
            return reducePlace(state, action);
        case BUY_BONUS:
            return reduceBuyBonus(state, action);
        case END_TURN:
            return reduceEndTurn(state);
        case SET_MAP:
            return createInitialState(action.mapId);
        default:
            return state;
    }
}
