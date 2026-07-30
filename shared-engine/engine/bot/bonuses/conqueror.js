// Bonus « Conquérant » (niveau 5, 200 or, entretien PLEIN — 32 or/tour) — le
// SEUL bonus qui EXPANSE tout seul, chaque tour, sans rien devoir à son
// porteur.
//
// Ce qu'il change :
//   - ses statistiques (16/16, voir `BONUS_OFFERS`) sont EXACTEMENT celles du
//     niveau 5 nu (`SOLDIER_LEVEL_STATS[5]`) — comme le Chevalier noir,
//     l'équiper ne coûte RIEN en combat, seulement son prix ;
//   - il reçoit en plus le Bouclier divin (`SHIELD_AFFINITY`, voir
//     `reduceBuyBonus`), la même immunité que le Paladin : intouchable par
//     tout soldat SANS affinité, dans les deux sens ;
//   - à CHAQUE fin de tour, il annexe TOUTES les cases VIDES adjacentes,
//     neutres ou déjà à un adversaire (voir `applyConquerors`,
//     endturn/territory.js) — que le soldat ait joué ou non ce tour-ci
//     (contrairement au Démoniste, agir ne lui coûte rien ici). Aucune
//     logique de repositionnement ou de protection n'est donc nécessaire :
//     il joue comme un soldat ordinaire, le reste du bot le traite déjà
//     comme tel, et sa seule particularité — l'annexion — est lue par le
//     pipeline de fin de tour, jamais par lui.
//
// Son défi (`NO_CONQUEROR_ON_BOARD`) est un défi d'ÉTAT trivialement rempli
// tant qu'AUCUN conquérant n'existe encore sur le plateau, TOUS JOUEURS
// CONFONDUS (voir `bonusOnBoard`, data/soldier.js) — comme Roi/Sorcier/
// Démoniste, les trois autres bonus « uniques » de niveau 5. Une fois PRIS
// par n'importe quel joueur, il se referme pour TOUT LE MONDE : c'est une
// course, pas une fenêtre personnelle comme celle du Prêtre.
//
// Seule décision ici : QUI équiper (`equipConquerors`).

import {BONUS_OFFERS, bonusPriceOf, isBonusUnlocked} from '../../../data/soldier.js';
import {buyBonus} from '../../actions.js';

// Un seul conquérant : son propre défi en interdit de toute façon un second
// (à nous comme à l'adversaire) dès qu'un premier existe sur le plateau.
const MAX_CONQUERORS = 1;

function conquerorCount(state, playerId) {
    let n = 0;
    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'conqueror') n += 1;
    }
    return n;
}

// Équipe le Conquérant sur un niveau 5 sans bonus, dès qu'aucun exemplaire
// n'existe encore sur le plateau (`isBonusUnlocked`) et que la bourse suit.
// Aucune vérification de sûreté de case : ni ses statistiques ni son
// exposition au combat ne se dégradent en s'équipant (bouclier compris).
export function equipConquerors(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.conqueror === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'conqueror');
    if (!bonus) return state;
    if (conquerorCount(state, playerId) >= MAX_CONQUERORS) return state;

    const price = bonusPriceOf(bonus, state.settings);
    if ((state.gold?.[playerId] || 0) < price) return state;

    const candidates = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || u.unit) continue;
        if ((u.level || 1) !== bonus.requiredLevel) continue;
        if (!isBonusUnlocked(u, bonus, state.settings, state)) continue; // un conquérant existe déjà, où que ce soit
        candidates.push(id);
    }
    candidates.sort((a, b) => (a < b ? -1 : 1)); // déterminisme

    for (const id of candidates) {
        const next = apply(buyBonus(id, 'conqueror'));
        if (!next) continue;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${id} équipé Conquérant`);
        return next;
    }
    return state;
}
