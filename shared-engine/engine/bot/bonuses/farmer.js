// Bonus « Fermier » (fait pousser un arbre à la frontière chaque tour, contre
// −5 or/tour d'entretien) — ouverture économique, seulement rentable jouée tôt
// (voir le commentaire sur `BONUS_OFFERS` dans data/soldier.js) : l'arbre
// pousse tout seul, sur une case frontière tirée au hasard par
// `spawnFarmerTrees` — le bot n'a donc RIEN à décider sur le où, seulement le
// qui et le combien.

import {getNeighbors, hexId} from '../../../data/hex.js';
import {getLogicalBoard} from '../../board.js';
import {BONUS_OFFERS, bonusPriceOf, isBonusUnlocked} from '../../../data/soldier.js';
import {buyBonus} from '../../actions.js';
import {inEnemyRange} from '../threat.js';

// Passé ce tour, on n'ouvre plus de nouveau Fermier : le flux d'arbres n'a
// plus le temps de s'amortir (entretien payé jusqu'à la fin de la partie
// contre une poignée d'arbres en moins).
const FARMER_MAX_TURN = 6;

// Une case à soi est « frontière » quand elle borde au moins une case de terre
// (existante et non bloquée) qui n'est pas à elle — même définition que
// `spawnFarmerTrees`, pour dimensionner l'investissement sur la même notion
// de capacité de plantation.
function isFrontierCell(state, board, playerId, cell) {
    return getNeighbors(cell.q, cell.r).some((n) => {
        const ncell = board.cellMap.get(hexId(n.q, n.r));
        if (!ncell || ncell.blocked) return false;
        return state.ownership.get(ncell.id) !== playerId;
    });
}

// Cases frontalières intérieures libres, hors base — mêmes critères que
// l'éligibilité de plantation en fin de tour, sert à juger si le territoire a
// encore la place d'accueillir un Fermier de plus.
function frontierPlantingCapacity(state, board, playerId) {
    let n = 0;
    for (const c of board.cells) {
        if (c.blocked || board.baseIds.has(c.id) || state.placements.has(c.id)) continue;
        if (state.ownership.get(c.id) !== playerId) continue;
        if (isFrontierCell(state, board, playerId, c)) n += 1;
    }
    return n;
}

// En dessous, pas la place d'accueillir un premier Fermier ; au-delà, un
// second devient rentable — plafonné à 2, l'entretien cumulé (−10 or/tour)
// n'a plus de sens au-delà pour un seul territoire.
const MIN_FRONTIER_FOR_FARMER = 4;
const FRONTIER_PER_FARMER = 8;
const MAX_FARMERS = 2;

function desiredFarmerCount(capacity) {
    if (capacity < MIN_FRONTIER_FOR_FARMER) return 0;
    return Math.min(MAX_FARMERS, Math.max(1, Math.floor(capacity / FRONTIER_PER_FARMER)));
}

// Équipe le Fermier sur des soldats de niveau 1 déjà débloqués (1 arbre
// ennemi détruit par CE soldat, voir `isBonusUnlocked`), en territoire sûr
// (jamais à portée ennemie — un soldat qui meurt perd l'investissement fait
// sur ses tours à venir), tant que la fenêtre d'ouverture (`FARMER_MAX_TURN`)
// et la capacité de plantation du territoire le justifient.
export function equipFarmers(state, playerId, apply) {
    if (state.turn > FARMER_MAX_TURN) return state;
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.farmer === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'farmer');
    if (!bonus) return state;
    const board = getLogicalBoard(state.mapId);

    let current = 0;
    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'farmer') current += 1;
    }
    const desired = desiredFarmerCount(frontierPlantingCapacity(state, board, playerId));
    let need = desired - current;
    if (need <= 0) return state;

    const price = bonusPriceOf(bonus, state.settings);
    const candidates = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || (u.level || 1) !== 1) continue;
        if (!isBonusUnlocked(u, bonus, state.settings, state)) continue; // défi pas encore rempli
        if (inEnemyRange(state, id, playerId)) continue; // pas d'investissement long terme en zone exposée
        candidates.push(id);
    }
    candidates.sort((a, b) => (a < b ? -1 : 1)); // déterminisme

    let cur = state;
    for (const id of candidates) {
        if (need <= 0) break;
        if ((cur.gold?.[playerId] || 0) < price) break;
        const next = apply(buyBonus(id, 'farmer'));
        if (!next) continue;
        cur = next;
        need -= 1;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${id} équipé Fermier (${desired - need}/${desired})`);
    }
    return cur;
}
