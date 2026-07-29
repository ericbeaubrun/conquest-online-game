// Bonus « Bûcheron » (2× l'or d'abattage) — dimensionné à la forêt disponible

import {hexDistance} from '../../../data/hex.js';
import {getLogicalBoard} from '../../board.js';
import {BONUS_OFFERS, bonusPriceOf, isBonusUnlocked} from '../../../data/soldier.js';
import {buyBonus} from '../../actions.js';
import {inEnemyRange} from '../threat.js';
import {cellQR} from '../helpers.js';

// Arbres actuellement récoltables SANS DANGER (hors de portée ennemie), toute
// la carte confondue — sert à dimensionner l'investissement en bûcherons :
// abattre un arbre est INSTANTANÉ (une seule action, pas de « PV » d'arbre à
// entamer sur plusieurs tours), donc quelques bûcherons suffisent à vider une
// forêt au fil des tours — pas besoin d'un par arbre.
function safeTreeCount(state, board, playerId) {
    let n = 0;
    for (const [id, u] of state.placements) {
        if (u.type !== 'tree') continue;
        if (inEnemyRange(state, id, playerId)) continue;
        n += 1;
    }
    return n;
}

// Un bûcheron pour ~6 arbres sûrs (au-delà, un deuxième bûcheron réduit le
// temps de trajet plutôt que d'attendre que le premier ait tout coupé),
// plafonné à 3 : « ça ne sert à rien d'avoir que des bûcherons » (décision du
// joueur — pas d'armée de bûcherons, seulement l'appoint économique). En
// dessous de 2 arbres, même un seul bûcheron ne rentabilise pas son prix (20
// or contre +10 or/arbre ordinaire une fois le bonus équipé).
const TREES_PER_LUMBERJACK = 6;
const MAX_LUMBERJACKS = 3;
const MIN_TREES_FOR_LUMBERJACK = 2;

function desiredLumberjackCount(treeCount) {
    if (treeCount < MIN_TREES_FOR_LUMBERJACK) return 0;
    return Math.min(MAX_LUMBERJACKS, Math.max(1, Math.floor(treeCount / TREES_PER_LUMBERJACK)));
}

// Équipe le Bûcheron sur autant de soldats de niveau 1 déjà débloqués (1 arbre
// abattu par CE soldat, voir `isBonusUnlocked`) qu'il en manque pour atteindre
// `desiredLumberjackCount` — jamais plus, jamais moins que la forêt ne
// justifie. Chaque nouveau bûcheron prend ensuite sa ZONE via
// `nearestLumberjack`/`bestConquestAction`, sans repasser par ici.
export function equipLumberjacks(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.lumberjack === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'lumberjack');
    if (!bonus) return state;
    const board = getLogicalBoard(state.mapId);

    let current = 0;
    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'lumberjack') current += 1;
    }
    const desired = desiredLumberjackCount(safeTreeCount(state, board, playerId));
    let need = desired - current;
    if (need <= 0) return state;

    const price = bonusPriceOf(bonus, state.settings);
    const candidates = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || (u.level || 1) !== 1) continue;
        if (!isBonusUnlocked(u, bonus, state.settings, state)) continue; // défi pas encore rempli
        candidates.push(id);
    }
    candidates.sort((a, b) => (a < b ? -1 : 1)); // déterminisme

    let cur = state;
    for (const id of candidates) {
        if (need <= 0) break;
        if ((cur.gold?.[playerId] || 0) < price) break;
        const next = apply(buyBonus(id, 'lumberjack'));
        if (!next) continue;
        cur = next;
        need -= 1;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${id} équipé Bûcheron (${desired - need}/${desired})`);
    }
    return cur;
}

// Rayon au-delà duquel un bûcheron n'est plus « raisonnablement » affecté à un
// arbre — au-delà, personne ne réclame l'arbre, il reste libre pour tous.
const LUMBERJACK_ZONE_RADIUS = 8;

// Case du soldat BÛCHERON le plus proche d'un arbre donné (`treeCell`), dans un
// rayon raisonnable — la « ZONE » de ce bûcheron. `null` si aucun bûcheron n'est
// assez proche (ou qu'il n'y en a aucun) : l'arbre reste alors disponible pour
// n'importe quel soldat, comme avant l'introduction du bonus. Sert à ce
// qu'aucun allié n'aille couper un arbre à la place du bûcheron qui s'en
// occupe (et qui, lui, touche le double en or) — voir `bestConquestAction`.
export function nearestLumberjack(state, treeCell) {
    let best = null;
    let bestDist = Infinity;
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.bonus !== 'lumberjack') continue;
        const d = hexDistance(cellQR(id), treeCell);
        if (d < bestDist || (d === bestDist && best && id < best)) {
            bestDist = d;
            best = id;
        }
    }
    return best && bestDist <= LUMBERJACK_ZONE_RADIUS ? best : null;
}
