// Bonus « Moine » (5 or/tour d'inaction, prix nul) — poste des soldats niveau
// 2 « purs » (jamais tué/abattu/conquis) dans les groupes de maisons : ils y
// camperont, récoltant en prime les arbres/coffres non couverts par un
// bûcheron/ninja (déjà géré par `bestConquestAction`, aucune logique en plus).

import {hexDistance} from '../../../data/hex.js';
import {getLogicalBoard} from '../../board.js';
import {soldierCostForLevel, BONUS_OFFERS, isBonusUnlocked} from '../../../data/soldier.js';
import {placeItem, buyBonus} from '../../actions.js';
import {cellQR} from '../helpers.js';

// Rayon dans lequel un moine « couvre » les maisons voisines (camp établi) —
// sert à ne pas empiler plusieurs moines sur le même groupe de maisons.
const MONK_ZONE_RADIUS = 4;
// Maisons NON couvertes minimum pour justifier un nouveau moine (le niveau 2
// coûte 50 or, comme une maison ; le bonus lui-même est gratuit, mais pas la
// peine d'en poster un pour une seule maison isolée).
const MONK_MIN_HOUSES = 2;
const MAX_MONKS = 4;

// Maisons à nous non encore « couvertes » par un moine existant (aucun moine
// dans `MONK_ZONE_RADIUS`) — sert à juger si un nouveau moine se justifie, et
// où le poster (près du plus grand groupe non couvert).
function uncoveredHouses(state, playerId) {
    const monks = [];
    const houses = [];
    for (const [id, u] of state.placements) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'monk') monks.push(cellQR(id));
        if (u.type === 'house' && u.playerId === playerId) houses.push(cellQR(id));
    }
    return houses.filter((h) => !monks.some((m) => hexDistance(h, m) <= MONK_ZONE_RADIUS));
}

export function equipMonks(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.monk === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'monk');
    if (!bonus) return state;
    const board = getLogicalBoard(state.mapId);

    let current = 0;
    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'monk') current += 1;
    }
    if (current >= MAX_MONKS) return state;
    let cur = state;

    // Occasion gratuite : un soldat niveau 2 sans bonus, resté pur par hasard
    // (fusions successives sans jamais avoir agi) — équipé directement, sans
    // achat.
    const freeCandidates = [];
    for (const [id, u] of cur.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || (u.level || 1) !== 2) continue;
        if (!isBonusUnlocked(u, bonus, cur.settings, cur)) continue;
        freeCandidates.push(id);
    }
    freeCandidates.sort((a, b) => (a < b ? -1 : 1));
    for (const id of freeCandidates) {
        if (current >= MAX_MONKS || uncoveredHouses(cur, playerId).length < MONK_MIN_HOUSES) break;
        const next = apply(buyBonus(id, 'monk'));
        if (!next) continue;
        cur = next;
        current += 1;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${id} (niveau 2 resté pur) équipé Moine`);
    }

    // Sinon : acheter un niveau 2 tout neuf et l'équiper aussitôt — sa
    // progression est vierge, donc toujours pur à cet instant précis (l'achat
    // et la pose du bonus ne consomment pas son tour). Posé sur la case libre
    // sûre qui couvre le plus de maisons non couvertes.
    const buyCost = soldierCostForLevel(2, cur.settings);
    let guard = 0;
    while (current < MAX_MONKS && (cur.gold?.[playerId] || 0) >= buyCost && guard < MAX_MONKS) {
        guard += 1;
        const uncovered = uncoveredHouses(cur, playerId);
        if (uncovered.length < MONK_MIN_HOUSES) break;

        let bestSpot = null;
        let bestScore = -1;
        for (const cell of board.cells) {
            if (cell.blocked || board.baseIds.has(cell.id)) continue;
            if (cur.ownership.get(cell.id) !== playerId) continue;
            if (cur.placements.has(cell.id)) continue;
            const score = uncovered.filter((h) => hexDistance(h, cell) <= MONK_ZONE_RADIUS).length;
            if (score < MONK_MIN_HOUSES) continue;
            if (score > bestScore || (score === bestScore && bestSpot && cell.id < bestSpot.id)) {
                bestScore = score;
                bestSpot = cell;
            }
        }
        if (!bestSpot) break;

        const bought = apply(placeItem(bestSpot.id, 'soldier', 2));
        if (!bought) break;
        cur = bought;
        const equipped = apply(buyBonus(bestSpot.id, 'monk'));
        if (!equipped) break; // achat annulé (imprévu) : le soldat niveau 2 reste, sans bonus
        cur = equipped;
        current += 1;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${bestSpot.id} acheté niveau 2 et équipé Moine (couvre ${bestScore} maison(s))`);
    }

    return cur;
}
