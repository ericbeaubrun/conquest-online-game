// Bonus « Ninja » (mobilité : portée doublée, traverse tout) — dimensionné aux
// coffres disponibles, bien plus rares que les arbres

import {hexDistance} from '../../../data/hex.js';
import {BONUS_OFFERS, bonusPriceOf, isBonusUnlocked} from '../../../data/soldier.js';
import {buyBonus} from '../../actions.js';
import {cellQR} from '../helpers.js';
import {inEnemyRange} from '../threat.js';

// Coffres FERMÉS et récoltables SANS DANGER (hors de portée ennemie), toute la
// carte confondue. Contrairement aux arbres, le Ninja ne rapporte rien
// directement (son effet est la mobilité, avec un entretien réel en plus) —
// mais un coffre manqué par lenteur ne se rattrape pas (`chestMax` plafonne
// leur nombre total), d'où l'intérêt d'un déplacement doublé pour les atteindre
// avant qu'ils ne se périment ou qu'un adversaire les prenne.
function safeChestCount(state, playerId) {
    let n = 0;
    for (const [id, u] of state.placements) {
        if (u.type !== 'chest') continue;
        if (inEnemyRange(state, id, playerId)) continue;
        n += 1;
    }
    return n;
}

// Les coffres se font rares (`chestMax`) : 1 ninja pour ~3 coffres sûrs
// suffit, plafonné à 2 (contrairement au bûcheron/aventurier/voleur, le ninja
// n'a pas de gain d'or direct et coûte un entretien réel — pas la peine d'en
// maintenir plus que la rareté ne le justifie). En dessous de 2 coffres, la
// mobilité ne vaut pas son entretien.
const CHESTS_PER_NINJA = 3;
const MAX_NINJAS = 2;
const MIN_CHESTS_FOR_NINJA = 2;

function desiredNinjaCount(chestCount) {
    if (chestCount < MIN_CHESTS_FOR_NINJA) return 0;
    return Math.min(MAX_NINJAS, Math.max(1, Math.floor(chestCount / CHESTS_PER_NINJA)));
}

// Équipe le Ninja sur autant de soldats de niveau 2 déjà débloqués (1 coffre
// ouvert par CE soldat, voir `isBonusUnlocked` — la même condition qu'ouvrir un
// coffre avec un niveau 2 dès que l'occasion se présente, déjà couverte par le
// score `HARVEST_SCORE` de `bestConquestAction`, aucune logique dédiée
// nécessaire ici) qu'il en manque pour atteindre `desiredNinjaCount`.
export function equipNinjas(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.ninja === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'ninja');
    if (!bonus) return state;

    let current = 0;
    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'ninja') current += 1;
    }
    const desired = desiredNinjaCount(safeChestCount(state, playerId));
    let need = desired - current;
    if (need <= 0) return state;

    const price = bonusPriceOf(bonus, state.settings);
    const candidates = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || (u.level || 1) !== 2) continue;
        if (!isBonusUnlocked(u, bonus, state.settings, state)) continue; // défi pas encore rempli
        candidates.push(id);
    }
    candidates.sort((a, b) => (a < b ? -1 : 1)); // déterminisme

    let cur = state;
    for (const id of candidates) {
        if (need <= 0) break;
        if ((cur.gold?.[playerId] || 0) < price) break;
        const next = apply(buyBonus(id, 'ninja'));
        if (!next) continue;
        cur = next;
        need -= 1;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${id} équipé Ninja (${desired - need}/${desired})`);
    }
    return cur;
}

// Rayon de zone du Ninja, BEAUCOUP plus large que celle du bûcheron : sa
// portée de déplacement est doublée (`NINJA_MOVE_MULT`) ET les coffres sont
// bien plus rares que les arbres (`chestMax` plafonne leur nombre total sur la
// carte) — un seul ninja doit pouvoir raisonnablement se réclamer une bien
// plus grande étendue sans quoi la zone ne « prend » jamais.
const NINJA_ZONE_RADIUS = 24;

// Case du soldat NINJA le plus proche d'un coffre donné (`chestCell`), dans la
// zone ci-dessus — même principe que `nearestLumberjack`, pour les coffres.
export function nearestNinja(state, chestCell) {
    let best = null;
    let bestDist = Infinity;
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.bonus !== 'ninja') continue;
        const d = hexDistance(cellQR(id), chestCell);
        if (d < bestDist || (d === bestDist && best && id < best)) {
            bestDist = d;
            best = id;
        }
    }
    return best && bestDist <= NINJA_ZONE_RADIUS ? best : null;
}
