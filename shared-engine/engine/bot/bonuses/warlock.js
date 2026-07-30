// Bonus « Démoniste » (niveau 5, 100 or, entretien PLEIN — 32 or/tour, plus
// celui de chaque squelette invoqué) — l'INVOCATEUR passif.
//
// Contrairement aux trois autres bonus « uniques » de niveau 5 (Roi, Sorcier,
// Conquérant — verrouillés par NO_X_ON_BOARD, un défi trivialement rempli
// tant qu'aucun exemplaire n'existe encore, et c'est son cas aussi via
// `NO_WARLOCK_ON_BOARD`), le Démoniste échange l'essentiel de son attaque (1
// au lieu de 16, voir `WARLOCK_STATS`) contre un pari récurrent : une chance
// sur deux, CHAQUE TOUR qu'il termine SANS AVOIR AGI (ni déplacé, ni attaqué,
// ni fusionné — voir `spawnWarlockSkeletons`, endturn/summons.js), d'invoquer
// un squelette allié fragile. Il ne rapporte donc RIEN le tour où il bouge,
// même pour conquérir une case vide : bouger EST le coût.
//
// D'où la seule règle qui compte ici : un démoniste équipé ne doit JAMAIS
// jouer de lui-même. Il est donc traité comme une unité PRÉCIEUSE
// (`PROTECTED_BONUSES`, helpers.js — protection déjà bonus-agnostique), et
// `precious.js` le laisse simplement IMMOBILE dès qu'il est en sécurité :
// contrairement au magicien/alchimiste/prêtre, qui gagnent à se rapprocher
// d'alliés, il n'y a ici NI case à rejoindre NI récolte à faire qui vaille
// mieux que l'inaction — voir le court-circuit dans `playPreciousUnit`.
//
// Seule décision ici : QUI équiper (`equipWarlocks`) — sur un niveau 5 sans
// bonus, en sécurité (il tombe à 1 d'attaque, incapable de riposter), et sans
// trop entamer le revenu (son entretien plein s'ajoute à celui, futur, de
// chaque squelette).

import {BONUS_OFFERS, bonusPriceOf, bonusTotalUpkeep, isBonusUnlocked} from '../../../data/soldier.js';
import {buyBonus} from '../../actions.js';
import {incomeFor} from '../../selectors.js';
import {preciousCellUnsafe} from '../threat.js';

// Un seul démoniste : son entretien grimpe vite (32 or/tour, plus celui de
// chaque squelette invoqué au fil des tours), un second n'ajoute qu'une
// chance d'invocation de plus contre un doublement de la facture.
const MAX_WARLOCKS = 1;
// Revenu (or/tour) qui doit RESTER une fois son entretien payé — même garde-
// fou que le Paladin, l'autre gros poste du bot.
const WARLOCK_INCOME_FLOOR = 20;

function warlockCount(state, playerId) {
    let n = 0;
    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'warlock') n += 1;
    }
    return n;
}

export function equipWarlocks(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.warlock === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'warlock');
    if (!bonus) return state;
    if (warlockCount(state, playerId) >= MAX_WARLOCKS) return state;

    const price = bonusPriceOf(bonus, state.settings);
    if ((state.gold?.[playerId] || 0) < price) return state;
    const upkeep = bonusTotalUpkeep(bonus, state.settings);
    if (incomeFor(state, playerId) - upkeep < WARLOCK_INCOME_FLOOR) return state;

    const candidates = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || u.unit) continue;
        if ((u.level || 1) !== bonus.requiredLevel) continue;
        if (!isBonusUnlocked(u, bonus, state.settings, state)) continue; // un démoniste allié existe déjà
        if (preciousCellUnsafe(state, id, playerId)) continue; // il tombe à 1 d'attaque en s'équipant
        candidates.push(id);
    }
    candidates.sort((a, b) => (a < b ? -1 : 1)); // déterminisme

    for (const id of candidates) {
        const next = apply(buyBonus(id, 'warlock'));
        if (!next) continue;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${id} équipé Démoniste`);
        return next;
    }
    return state;
}
