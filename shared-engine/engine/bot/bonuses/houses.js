// Maisons — investissement toujours rentable (50 or, +5 or/tour, jamais de
// plafond), donc ce qui compte n'est pas SI on en construit mais OÙ (en
// sécurité) et APRÈS quelles dépenses (jamais avant l'expansion/la chasse)

import {hexDistance} from '../../../data/hex.js';
import {getLogicalBoard} from '../../board.js';
import {placeItem} from '../../actions.js';
import {ITEM_COST} from '../../../data/items.js';
import {cellQR} from '../helpers.js';
import {frontierDistanceField} from '../movement.js';

// Case de notre BASE (parmi toutes celles du plateau), ou `null` (base rasée).
function ourBaseCell(state, board, playerId) {
    for (const id of board.baseIds) {
        if (state.ownership.get(id) === playerId) return id;
    }
    return null;
}

// Distance minimale à la frontière pour qu'une case soit jugée sûre pour une
// maison : 2 PV, aucune attaque — elle meurt au premier coup et sa case
// bascule aussitôt chez l'attaquant (voir `reduceAttack`). Un bâtiment n'a de
// sens qu'en plein territoire, jamais en bordure.
const HOUSE_SAFETY_MARGIN = 3;

// Une maison sur `HOUSE_ISOLATED_RATIO` part en avant-poste isolé (la case
// sûre la plus ÉLOIGNÉE de la frontière) plutôt qu'autour de la base (la case
// sûre la plus PROCHE de la base) — majorité près de la base, comme demandé,
// mais pas exclusivement. Variation sur le nombre de maisons déjà possédées :
// déterministe (jamais de hasard, le bot doit rester reproductible en ligne).
const HOUSE_ISOLATED_RATIO = 4;

export function buildHouses(state, playerId, apply) {
    const board = getLogicalBoard(state.mapId);
    const cost = state.settings?.itemCost?.house ?? ITEM_COST.house;
    if (cost <= 0) return state;
    const frontierDist = frontierDistanceField(state, board, playerId);
    const base = ourBaseCell(state, board, playerId);
    const baseQR = base ? cellQR(base) : null;

    let cur = state;
    let guard = 0;
    while ((cur.gold?.[playerId] || 0) >= cost && guard < 20) {
        guard += 1;
        const candidates = [];
        for (const cell of board.cells) {
            if (cell.blocked || board.baseIds.has(cell.id)) continue;
            if (cur.ownership.get(cell.id) !== playerId) continue;
            if (cur.placements.has(cell.id)) continue;
            const d = frontierDist.get(cell.id);
            if (d == null || d < HOUSE_SAFETY_MARGIN) continue;
            candidates.push(cell);
        }
        if (!candidates.length) break;

        let houseCount = 0;
        for (const u of cur.placements.values()) {
            if (u.type === 'house' && u.playerId === playerId) houseCount += 1;
        }
        const isolated = baseQR && (houseCount % HOUSE_ISOLATED_RATIO) === HOUSE_ISOLATED_RATIO - 1;
        if (isolated) {
            candidates.sort((a, b) => frontierDist.get(b.id) - frontierDist.get(a.id) || (a.id < b.id ? -1 : 1));
        } else if (baseQR) {
            candidates.sort((a, b) => hexDistance(a, baseQR) - hexDistance(b, baseQR) || (a.id < b.id ? -1 : 1));
        } else {
            candidates.sort((a, b) => (a.id < b.id ? -1 : 1));
        }
        const spot = candidates[0];
        const next = apply(placeItem(spot.id, 'house'));
        if (!next) break;
        cur = next;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   maison posée en ${spot.id}${isolated ? ' (avant-poste isolé)' : ' (près de la base)'}`);
    }
    return cur;
}
