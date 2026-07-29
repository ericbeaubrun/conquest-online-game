// Bonus « Voleur » (10 or/case ENNEMIE volée) — raid en territoire adverse

import {getNeighbors, hexId} from '../../../data/hex.js';
import {getLogicalBoard} from '../../board.js';
import {BONUS_OFFERS, bonusPriceOf, isBonusUnlocked} from '../../../data/soldier.js';
import {buyBonus} from '../../actions.js';
import {inEnemyRange} from '../threat.js';

// Nombre de cases ENNEMIES atteignables depuis `fromId` en restant dans un
// couloir SÛR et LIBRE : cases praticables, jamais occupées (soldat,
// structure, base, arbre, coffre — le Voleur évite tout combat, une seule
// riposte le tue) et jamais à portée d'un ennemi. Contrairement à
// `safeExpansionPotential`, la région n'est PAS bornée au territoire à nous :
// le Voleur opère en terrain adverse, seules les cases OWNED PAR L'ENNEMI
// comptent pour le gain (les neutres traversées ne rapportent rien à CE bonus).
function safeRaidPotential(state, board, ownerId, fromId) {
    const seen = new Set([fromId]);
    let front = [fromId];
    let count = 0;
    while (front.length) {
        const next = [];
        for (const id of front) {
            const cell = board.cellMap.get(id);
            if (!cell) continue;
            for (const nb of getNeighbors(cell.q, cell.r)) {
                const nid = hexId(nb.q, nb.r);
                if (seen.has(nid)) continue;
                const ncell = board.cellMap.get(nid);
                if (!ncell || ncell.blocked) continue;
                if (state.placements.has(nid)) continue; // occupée : pas de passage sans combat
                if (board.baseIds.has(nid) && !state.destroyedBases?.has(nid)) continue; // base : siège requis
                seen.add(nid);
                if (inEnemyRange(state, nid, ownerId)) continue; // à portée d'un ennemi : ni sûr, ni un relais
                next.push(nid);
                const owner = state.ownership.get(nid);
                if (owner && owner !== ownerId) count += 1; // case ennemie = un vol potentiel (10 or)
            }
        }
        front = next;
    }
    return count;
}

// Marge au-dessus du seuil de rentabilité (prix 20 or ÷ 10 or/case = 2 cases) :
// contrairement à l'Aventurier, le défi de déblocage (2 cases DÉJÀ volées) a
// déjà prouvé que le couloir est praticable — pas besoin d'une marge en plus.
const THIEF_MIN_POTENTIAL = 2;

// Équipe le Voleur sur les soldats de niveau 1 sans bonus qui ont déjà rempli
// son défi (2 cases ennemies volées PAR CE soldat, voir `isBonusUnlocked`) ET
// qui ont encore un couloir de territoire ennemi vide et sûr devant eux.
export function equipThieves(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.thief === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'thief');
    if (!bonus) return state;
    const board = getLogicalBoard(state.mapId);
    const price = bonusPriceOf(bonus, state.settings);

    let cur = state;
    const candidates = [];
    for (const [id, u] of cur.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || (u.level || 1) !== 1) continue;
        if (!isBonusUnlocked(u, bonus, cur.settings, cur)) continue; // défi pas encore rempli
        candidates.push(id);
    }
    candidates.sort((a, b) => (a < b ? -1 : 1)); // déterminisme

    for (const id of candidates) {
        if ((cur.gold?.[playerId] || 0) < price) break;
        const potential = safeRaidPotential(cur, board, playerId, id);
        if (potential < THIEF_MIN_POTENTIAL) continue;
        const next = apply(buyBonus(id, 'thief'));
        if (!next) continue;
        cur = next;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${id} équipé Voleur (couloir sûr : ${potential} cases ennemies)`);
    }
    return cur;
}
