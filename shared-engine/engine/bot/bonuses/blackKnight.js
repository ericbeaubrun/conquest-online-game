// Bonus « Chevalier noir » (niveau 4, 60 or) — la SEULE équipée de niveau 4
// SANS AUCUN sacrifice de statistiques : son profil (8/16, voir
// `BONUS_OFFERS`) est EXACTEMENT celui du niveau 4 nu (`SOLDIER_LEVEL_STATS[4]`)
// — contrairement au Prêtre (1/16), à l'Alchimiste ou au Magicien, l'équiper
// ne coûte RIEN en combat, seulement son prix.
//
// Ce qu'il change (`combatResult`, rules.js) : IMMUNITÉ totale face aux
// SQUELETTES, dans les deux sens (aucun dégât reçu, qu'il attaque ou soit
// attaqué), et gagne `BLACK_KNIGHT_SKELETON_REWARD` or à chaque squelette
// TUÉ EN ATTAQUANT (voir `reduceAttack`, reducer.js). Aucune décision de
// positionnement ou de ciblage à prendre ici : l'immunité est déjà lue par
// `combatResult`, donc par TOUT le reste du bot (offense.js, threat.js) — un
// chevalier noir qui affronte un squelette est déjà vu comme un engagement
// sûr et gratuit par le code de combat existant.
//
// Son défi (tuer OU POSSÉDER un squelette) se débloque tout seul dès qu'un
// squelette apparaît dans la partie (mort-vivant à sa mort, démoniste), et ne
// se REFERME jamais une fois rempli (voir `SKELETONS_KILLED` dans
// `data/soldier.js`) — contrairement au Prêtre, aucune fenêtre à saisir vite.
// C'est justement CE qui posait problème : un chevalier noir qui meurt (rien
// ne le protège des combats ordinaires, seuls les squelettes lui sont
// inoffensifs) laisse le défi acquis pour de bon, et le bot en rachetait un
// autre aussitôt — jusqu'à 3-4 par partie sur les grandes cartes, asséchant
// le bassin de niveaux 4 au détriment de Prêtre/Paladin/Druide. Un compteur
// « en vie » ne suffit donc pas : `state.blackKnightBoughtBy` (voir board.js,
// posé par `reduceBuyBonus`) retient l'achat MÊME après la mort du porteur,
// pour un vrai plafond D'UN SEUL par partie.
//
// Seule décision ici : QUI équiper (`equipBlackKnights`).

import {BONUS_OFFERS, bonusPriceOf, isBonusUnlocked} from '../../../data/soldier.js';
import {buyBonus} from '../../actions.js';

// Équipe le Chevalier noir sur un niveau 4 sans bonus dont le défi est rempli
// (un squelette allié ou ennemi tué ou possédé, voir `isBonusUnlocked`), au
// plus UNE FOIS par partie (voir `blackKnightBoughtBy` ci-dessus). Aucune
// vérification de sûreté de case n'est nécessaire : contrairement au
// Prêtre/Alchimiste/Magicien, ses statistiques ne changent pas en s'équipant.
export function equipBlackKnights(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.blackKnight === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'blackKnight');
    if (!bonus) return state;
    if (state.blackKnightBoughtBy?.[playerId]) return state; // déjà utilisé son unique achat

    const price = bonusPriceOf(bonus, state.settings);
    if ((state.gold?.[playerId] || 0) < price) return state;

    const candidates = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || u.unit) continue;
        if ((u.level || 1) !== bonus.requiredLevel) continue;
        if (!isBonusUnlocked(u, bonus, state.settings, state)) continue; // pas encore de squelette tué/possédé
        candidates.push(id);
    }
    candidates.sort((a, b) => (a < b ? -1 : 1)); // déterminisme

    for (const id of candidates) {
        const next = apply(buyBonus(id, 'blackKnight'));
        if (!next) continue;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${id} équipé Chevalier noir`);
        return next;
    }
    return state;
}
