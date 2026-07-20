// IA de bot, PARTAGÉE front/back. VOLONTAIREMENT SIMPLE : le bot n'a aucune
// stratégie, il se contente d'acheter des soldats de niveau 1 et d'étendre son
// territoire. Toutes ses décisions passent par les MÊMES actions que les
// joueurs humains (donc les mêmes règles, validées par le reducer).
//
// Le tour d'un bot se déroule en deux phases :
//   1. ACHATS — poser un (ou plusieurs, selon la difficulté) soldat niveau 1
//      sur une case libre de son territoire, tant qu'il a de quoi payer.
//   2. CONQUÊTES — déplacer chacun de ses soldats disponibles sur une case
//      qu'il ne possède pas encore (une conquête par soldat et par tour).
//
// Profils de difficulté :
//   easy   (débutant)  : achète 1 soldat, ne bouge personne.
//   normal (équilibré) : achète 1 soldat, puis conquiert avec ses soldats.
//   hard   (difficile) : achète un MAX de soldats, puis conquiert avec tous.
//
// NB : les cibles sont tirées avec `Math.random` (pas le PRNG de la partie) —
// sans conséquence : en online seul le serveur fait jouer les bots et diffuse
// l'état résultant ; en local il n'y a qu'un seul client.

import {getLogicalBoard} from './board.js';
import {computeReachable} from './selectors.js';
import {moveSoldier, placeItem} from './actions.js';
import {soldierCostForLevel} from '../data/soldier.js';
import {getNeighbors, hexId} from '../data/hex.js';

const DIFFICULTY = {
    easy: {maxBuys: 1, conquers: false},
    normal: {maxBuys: 1, conquers: true},
    hard: {maxBuys: Infinity, conquers: true},
};

// Le joueur actif est-il un bot ?
export function isBotTurn(state) {
    const active = state.players?.find((p) => p.id === state.activePlayerId);
    return active?.kind === 'bot';
}

// Voisines d'une case présentes sur la carte (le plateau logique n'expose pas
// d'index d'adjacence : on le recalcule à la volée, c'est très peu coûteux).
function boardNeighbors(board, id) {
    const cell = board.cellMap.get(id);
    if (!cell) return [];
    return getNeighbors(cell.q, cell.r)
        .map((nb) => hexId(nb.q, nb.r))
        .filter((nid) => board.cellMap.has(nid));
}

// Case où poser un nouveau soldat : une case libre du territoire du bot (ni
// bloquée, ni base, ni occupée), de préférence en frontière (au moins une
// voisine non possédée) pour que le soldat puisse conquérir dans la foulée.
function pickPlacementCell(state, board, pid) {
    const {cellMap, baseIds} = board;
    let fallback = null;
    for (const [id, owner] of state.ownership) {
        if (owner !== pid) continue;
        const cell = cellMap.get(id);
        if (!cell || cell.blocked || baseIds.has(id)) continue;
        if (state.placements.has(id)) continue;
        if (!fallback) fallback = id;
        const frontier = boardNeighbors(board, id)
            .some((nid) => state.ownership.get(nid) !== pid && !cellMap.get(nid)?.blocked);
        if (frontier) return id;
    }
    return fallback;
}

// Prochain coup de conquête : le premier soldat du bot encore disponible qui
// peut atteindre une case non possédée. La cible est tirée au hasard parmi ses
// conquêtes possibles — le bot ne « réfléchit » pas, il s'étale.
function pickConquest(state, board, pid) {
    for (const [id, placed] of state.placements) {
        if (placed.type !== 'soldier' || placed.playerId !== pid) continue;
        if (state.movedSoldiers?.has(placed.uid)) continue;
        const {moves} = computeReachable(state, board, id);
        const targets = [];
        for (const [toId, info] of moves) {
            if (info.kind === 'conquer') targets.push(toId);
        }
        if (targets.length) {
            const toId = targets[Math.floor(Math.random() * targets.length)];
            return moveSoldier(id, toId);
        }
    }
    return null;
}

// Déroule le TOUR COMPLET du bot actif. `apply(action)` doit appliquer l'action
// et renvoyer le nouvel état (ou une valeur falsy si elle est rejetée) — le
// bot rejoue toujours sur l'état le plus frais. Ne termine PAS le tour :
// c'est à l'appelant d'envoyer `endTurn` ensuite.
export function runBotTurn(state, apply) {
    const pid = state.activePlayerId;
    const active = state.players?.find((p) => p.id === pid);
    const profile = DIFFICULTY[active?.botDifficulty] || DIFFICULTY.normal;
    const board = getLogicalBoard(state.mapId);
    const cost = soldierCostForLevel(1, state.settings);

    // Phase 1 : achats de soldats niveau 1.
    let buys = 0;
    while (buys < profile.maxBuys && state.status !== 'over') {
        if ((state.gold[pid] || 0) < cost) break;
        const cellId = pickPlacementCell(state, board, pid);
        if (!cellId) break; // plus de place dans le territoire
        const next = apply(placeItem(cellId, 'soldier', 1));
        if (!next) break; // achat rejeté : on n'insiste pas
        state = next;
        buys += 1;
    }

    // Phase 2 : conquêtes (une par soldat disponible).
    if (profile.conquers) {
        let guard = 0;
        while (state.status !== 'over' && guard < 200) {
            guard += 1;
            const action = pickConquest(state, board, pid);
            if (!action) break;
            const next = apply(action);
            if (!next) break;
            state = next;
        }
    }
    return state;
}
