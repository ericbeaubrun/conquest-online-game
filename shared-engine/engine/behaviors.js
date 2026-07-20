// COMPORTEMENTS DE SOLDATS : le « pilote automatique » d'un soldat. Un soldat
// doté d'un comportement (voir `BEHAVIORS` dans `data/soldier.js`) joue seul à
// la fin du tour de son propriétaire — le reducer (`reduceEndTurn`) appelle
// `pickBehaviorAction` pour chacun d'eux, et applique le coup choisi via les
// MÊMES fonctions de réduction que les joueurs : aucune règle n'est contournée.
//
// DÉTERMINISME : ce module est appelé DANS le reducer, il doit donc être une
// fonction pure de l'état — aucun `Math.random`. Les égalités se tranchent par
// l'ordre lexicographique des identifiants de case, identique sur tous les
// clients et le serveur.
//
// Les comportements sont VOLONTAIREMENT simplistes (un gain de temps, pas une
// IA) : chacun cherche UN coup évident, sinon il se déclare bloqué (`null`) et
// le reducer efface alors le comportement du soldat. Cas particulier : une
// escorte déjà au contact de son allié renvoie `IDLE` — rien à faire ce tour,
// mais le comportement reste armé pour suivre l'allié quand il repartira.

import {computeReachable} from './selectors.js';
import {MOVE_SOLDIER, ATTACK_SOLDIER, CHOP_TREE} from './actions.js';
import {hexDistance} from '../data/hex.js';

// Sentinelle « rien à jouer ce tour, mais le comportement reste » (escorte au
// contact). À distinguer de `null` : « bloqué, le comportement s'efface ».
export const IDLE = 'idle';

const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Cibles d'un genre donné parmi les cases atteignables, ordonnées par id.
const targetsOfKind = (moves, kind) =>
    [...moves.entries()]
        .filter(([, info]) => info.kind === kind)
        .map(([id]) => id)
        .sort(byId);

// Escorte : se rapprocher (à vol d'oiseau) de l'allié soldat le plus proche.
function pickFollow(state, board, fromId, soldier, moves) {
    const allies = [];
    for (const [id, placed] of state.placements) {
        if (placed.type === 'soldier' && placed.playerId === soldier.playerId && placed.uid !== soldier.uid) {
            allies.push(board.cellMap.get(id));
        }
    }
    if (!allies.length) return null; // aucun allié à suivre : bloqué

    const distToAlly = (cellId) => {
        const cell = board.cellMap.get(cellId);
        return Math.min(...allies.map((a) => hexDistance(cell, a)));
    };
    const current = distToAlly(fromId);
    if (current <= 1) return IDLE; // déjà au contact : on reste en escorte

    // Meilleure case de repositionnement qui RAPPROCHE strictement de l'allié.
    let best = null;
    let bestDist = current;
    for (const id of targetsOfKind(moves, 'move')) {
        const d = distToAlly(id);
        if (d < bestDist) {
            bestDist = d;
            best = id;
        }
    }
    return best ? {type: MOVE_SOLDIER, fromId, toId: best} : null;
}

// Choisit le coup du comportement du soldat en `fromId`, ou `null` s'il est
// bloqué (le reducer efface alors son comportement), ou `IDLE` (rien à jouer
// ce tour, comportement conservé).
export function pickBehaviorAction(state, board, fromId, soldier) {
    const {moves} = computeReachable(state, board, fromId);
    switch (soldier.behavior) {
        case 'conquest': {
            const [toId] = targetsOfKind(moves, 'conquer');
            return toId ? {type: MOVE_SOLDIER, fromId, toId} : null;
        }
        case 'attack': {
            const [toId] = targetsOfKind(moves, 'combat');
            return toId ? {type: ATTACK_SOLDIER, fromId, toId} : null;
        }
        case 'tree': {
            const [toId] = targetsOfKind(moves, 'chop');
            return toId ? {type: CHOP_TREE, fromId, toId} : null;
        }
        case 'follow':
            return pickFollow(state, board, fromId, soldier, moves);
        default:
            return null;
    }
}
