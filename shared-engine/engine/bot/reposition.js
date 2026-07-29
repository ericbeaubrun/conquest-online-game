// Repositionnement des soldats ORDINAIRES sans occupation locale
//
// Un soldat qui n'a plus rien à conquérir ou récolter tout près ne doit pas
// rester planté en plein territoire — mais on ne veut pas non plus vider tout
// le territoire d'un coup vers le front. Ordre de préférence :
//   1. ESCORTE : une poignée de soldats gravitent autour des unités PRÉCIEUSES
//      (roi, guerrier, prêtre, alchimiste, druide...) qui n'en ont pas encore.
//   2. FRONTIÈRE : se rapprocher de la case non possédée (ennemie ou neutre)
//      la plus proche — jamais la bordure de la carte ni une poche fermée,
//      inatteignable par construction (voir `frontierDistanceField`).
//   3. FUSION : ni escorte ni rapprochement possibles (place et déplacements
//      réellement limités) mais l'or ne manque pas pour entretenir une grande
//      armée — consolider avec un allié plutôt que deux soldats immobiles.

import {getLogicalBoard} from '../board.js';
import {computeReachable} from '../selectors.js';
import {hexDistance} from '../../data/hex.js';
import {moveSoldier, mergeSoldier} from '../actions.js';
import {cellQR, isProtectedUnit} from './helpers.js';
import {stepCells, stepTowards} from './movement.js';

// Rayon dans lequel un soldat compte comme escorte d'une unité précieuse (déjà
// là, pas la peine d'en envoyer un autre). Rayon au-delà duquel un soldat n'est
// plus un candidat raisonnable pour ALLER en escorter une (sinon on viderait
// le front entier au premier roi sans garde).
const ESCORT_RADIUS = 2;
const ESCORT_CANDIDATE_RADIUS = 6;

// Une unité précieuse (`preciousCellId`) a-t-elle déjà un allié ORDINAIRE tout
// près ?
function hasEscort(state, ownerId, preciousCellId) {
    const center = cellQR(preciousCellId);
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== ownerId || id === preciousCellId) continue;
        if (isProtectedUnit(u)) continue; // une autre précieuse ne compte pas comme escorte
        if (hexDistance(cellQR(id), center) <= ESCORT_RADIUS) return true;
    }
    return false;
}

// L'unité précieuse à nous la plus proche de `fromId` qui n'a PAS encore
// d'escorte, si elle est à une distance raisonnable — `null` sinon.
function nearestUnescortedPrecious(state, ownerId, fromId) {
    const from = cellQR(fromId);
    let best = null;
    let bestDist = Infinity;
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== ownerId || !isProtectedUnit(u)) continue;
        const d = hexDistance(from, cellQR(id));
        if (d > ESCORT_CANDIDATE_RADIUS) continue;
        if (hasEscort(state, ownerId, id)) continue;
        if (d < bestDist || (d === bestDist && best && id < best)) {
            bestDist = d;
            best = id;
        }
    }
    return best;
}

// Allié fusionnable le plus proche que `S` (case `fromId`) peut rejoindre ce
// tour — repli quand ni escorte ni rapprochement de la frontière ne sont
// possibles (place/déplacements réellement limités), pour consolider plutôt
// que de laisser des soldats épars sans rien à faire.
function nearestMergeTarget(state, S, fromId) {
    const board = getLogicalBoard(state.mapId);
    const reach = computeReachable({...state, activePlayerId: S.playerId}, board, fromId);
    const targets = [...reach.moves].filter(([, info]) => info.kind === 'merge').map(([id]) => id);
    targets.sort((a, b) => (a < b ? -1 : 1));
    return targets[0] ?? null;
}

// Décision d'un soldat ORDINAIRE sans occupation locale, voir l'ordre de
// préférence ci-dessus.
export function repositionIdleSoldier(state, S, fromId, apply, frontierDist) {
    const owner = S.playerId;

    const escortTarget = nearestUnescortedPrecious(state, owner, fromId);
    if (escortTarget) {
        const toward = stepTowards(state, S, fromId, {id: escortTarget});
        if (toward) return apply(moveSoldier(fromId, toward)) || state;
    }

    const current = frontierDist.get(fromId);
    if (current != null && current > 0) {
        let best = null;
        let bestDist = current;
        for (const {toId} of stepCells(state, S, fromId)) {
            const d = frontierDist.get(toId);
            if (d == null) continue;
            if (d < bestDist || (d === bestDist && best && toId < best)) {
                bestDist = d;
                best = toId;
            }
        }
        if (best) return apply(moveSoldier(fromId, best)) || state;
    }

    const mergeTarget = nearestMergeTarget(state, S, fromId);
    if (mergeTarget) return apply(mergeSoldier(fromId, mergeTarget)) || state;

    return state;
}
