// Choix de déplacement génériques (pas de combat/récolte) : cases atteignables,
// distances, cheminement vers une cible, et le champ de distance à la frontière
// partagé par le repositionnement et la protection des unités précieuses.

import {getNeighbors, hexId, hexDistance} from '../../data/hex.js';
import {getLogicalBoard} from '../board.js';
import {computeReachable} from '../selectors.js';
import {cellQR} from './helpers.js';
import {inEnemyRange} from './threat.js';

// Cases où `S` (case `fromId`) peut se déplacer/conquérir ce tour, hors combats.
export function stepCells(state, S, fromId) {
    const board = getLogicalBoard(state.mapId);
    const reach = computeReachable({...state, activePlayerId: S.playerId}, board, fromId);
    const cells = [];
    for (const [toId, info] of reach.moves) {
        if (info.kind === 'move' || info.kind === 'conquer') cells.push({toId, kind: info.kind});
    }
    cells.sort((a, b) => (a.toId < b.toId ? -1 : 1));
    return cells;
}

// Distance à l'ennemi le plus proche depuis une case.
export function distToNearestEnemy(state, cellId, ownerId) {
    const from = cellQR(cellId);
    let best = Infinity;
    for (const [eid, e] of state.placements) {
        if (e.type !== 'soldier' || e.playerId === ownerId) continue;
        best = Math.min(best, hexDistance(from, cellQR(eid)));
    }
    return best;
}

// Allié (autre soldat de notre camp) le plus proche d'une case, ou null.
export function nearestAlly(state, fromId, owner, {onlyContact = false} = {}) {
    const from = cellQR(fromId);
    let best = null;
    let bestD = Infinity;
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== owner || id === fromId) continue;
        if (onlyContact && !inEnemyRange(state, id, owner)) continue;
        const d = hexDistance(from, cellQR(id));
        if (d < bestD || (d === bestD && best && id < best)) {
            bestD = d;
            best = id;
        }
    }
    return best ? {id: best, dist: bestD} : null;
}

// Case atteignable qui rapproche le plus `S` d'une cible `targetId`. Null si
// aucun pas ne rapproche.
export function stepTowards(state, S, fromId, target) {
    const goal = cellQR(target.id);
    let best = null;
    let bestD = hexDistance(cellQR(fromId), goal);
    for (const {toId} of stepCells(state, S, fromId)) {
        const d = hexDistance(cellQR(toId), goal);
        if (d < bestD || (d === bestD && best && toId < best)) {
            bestD = d;
            best = toId;
        }
    }
    return best;
}

// Distance de CHAQUE case praticable à la case NON POSSÉDÉE (ennemie ou
// neutre) la plus proche — un seul BFS multi-source par tour, partagé par tous
// les soldats (plutôt qu'un BFS par soldat et par case candidate). 0 = déjà
// hors de notre territoire ; absente de la table = poche fermée, inatteignable.
export function frontierDistanceField(state, board, ownerId) {
    const dist = new Map();
    let front = [];
    for (const cell of board.cells) {
        if (cell.blocked) continue;
        if (state.ownership.get(cell.id) !== ownerId) {
            dist.set(cell.id, 0);
            front.push(cell.id);
        }
    }
    let d = 0;
    while (front.length) {
        d += 1;
        const next = [];
        for (const id of front) {
            const cell = board.cellMap.get(id);
            if (!cell) continue;
            for (const nb of getNeighbors(cell.q, cell.r)) {
                const nid = hexId(nb.q, nb.r);
                if (dist.has(nid)) continue;
                const ncell = board.cellMap.get(nid);
                if (!ncell || ncell.blocked) continue;
                dist.set(nid, d);
                next.push(nid);
            }
        }
        front = next;
    }
    return dist;
}
