// Vocabulaire des caractéristiques de soldat (affinité, bonus, comportement).
// Anticipe des fonctionnalités à venir : pour l'instant un soldat naît sans
// aucune de ces caractéristiques (valeur `null`). Chaque liste sert à la fois
// d'affichage (libellés) et de source de vérité pour de futures règles.

export const AFFINITIES = [
    { id: 'fire', label: 'Feu' },
    { id: 'ice', label: 'Glace' },
    { id: 'lightning', label: 'Foudre' },
];

// La liste des bonus (id + libellé) est dérivée des offres détaillées plus bas
// (`BONUS_OFFERS`), unique source de vérité. Voir `bonusLabel`.

// Compteurs de défi suivis PAR SOLDAT (et non par joueur). Chaque soldat porte
// son propre avancement (`soldier.progress[metric]`). Le reducer incrémente ces
// compteurs lors des actions correspondantes ; un bonus dont le défi vise l'une
// de ces métriques se débloque quand l'objectif est atteint.
export const CHALLENGE_METRICS = {
    TREES_CHOPPED: 'treesChopped', // arbres abattus (n'importe où)
ENEMY_TREES_CHOPPED: 'enemyTreesChopped', // arbres abattus en territoire ennemi
    CASES_CONQUERED: 'casesConquered', // cases conquises
    CASES_TRAVELED_OWN: 'casesTraveledOwn', // cases parcourues dans son territoire
};

// Bonus proposés dans le panneau du soldat. Chaque bonus est rattaché à UN seul
// niveau de soldat (`requiredLevel`) : un soldat ne voit que les bonus de son
// niveau.
//
// Chaque offre porte :
//   - id       : identifiant stable (source de vérité pour les futures règles)
//   - label    : libellé affiché
//   - src       : visuel pixel (null tant que l'asset n'existe pas encore)
//   - requiredLevel : niveau de soldat requis (et unique) pour ce bonus
//   - price    : coût en or (`null` => « Gratuit »)
//   - challenge : défi à accomplir pour débloquer. Soit une chaîne (défi pas
//                 encore branché), soit un objet suivi { metric, goal, describe }
//                 où `describe(courant, objectif)` produit le texte d'avancement.
//   - effect   : effet accordé une fois débloqué (placeholder pour l'instant)
export const BONUS_OFFERS = [
    // ---- Niveau 1 ----
    {
        id: 'lumberjack',
        label: 'Bûcheron',
        src: '/characters/lumberJack.png',
        requiredLevel: 1,
        price: 10,
        challenge: {
            metric: CHALLENGE_METRICS.TREES_CHOPPED,
            goal: 5,
            describe: (c, g) => `Détruire ${c}/${g} arbres.`,
        },
        effect: 'Gagne 2× plus d’or en coupant les arbres.',
    },
    {
        id: 'adventurer',
        label: 'Aventurier',
        src: '/characters/aventurer.png',
        requiredLevel: 1,
        price: 10,
        challenge: {
            metric: CHALLENGE_METRICS.CASES_CONQUERED,
            goal: 10,
            describe: (c, g) => `Conquérir ${c}/${g} cases.`,
        },
        effect: 'Récolte 1 or par case conquise.',
    },
    {
        id: 'runner',
        label: 'Coureur',
        src: '/characters/runner.png',
        requiredLevel: 1,
        price: null,
        challenge: {
            metric: CHALLENGE_METRICS.CASES_TRAVELED_OWN,
            goal: 20,
            describe: (c, g) => `Parcourir ${c}/${g} cases dans son territoire.`,
        },
        effect: 'Se déplace 2× plus loin à l’intérieur du territoire.',
    },
    {
        id: 'farmer',
        label: 'Fermier',
        src: '/characters/farmer.png',
        requiredLevel: 1,
        price: 20,
        challenge: {
            metric: CHALLENGE_METRICS.ENEMY_TREES_CHOPPED,
            goal: 1,
            describe: (c, g) => `Détruire ${c}/${g} arbre sur le territoire ennemi.`,
        },
        effect: 'Augmente l’apparition d’arbres autour de la frontière.',
    },

    // ---- Niveau 2 ----
    {
        id: 'thief',
        label: 'Voleur',
        src: null,
        requiredLevel: 2,
        price: 200,
        challenge: 'Piller 3 cases ennemies.',
        effect: 'Vole de l’or à l’ennemi vaincu.',
    },
    {
        id: 'undead',
        label: 'Mort-vivant',
        src: null,
        requiredLevel: 2,
        price: 250,
        challenge: 'Survivre à 4 combats de suite.',
        effect: 'Revient une fois après la mort.',
    },
    {
        id: 'alchemist',
        label: 'Alchimiste',
        src: null,
        requiredLevel: 2,
        price: null,
        challenge: 'Rester 5 tours sans bouger.',
        effect: 'Transforme le bois en or.',
    },
    {
        id: 'warrior',
        label: 'Guerrier',
        src: null,
        requiredLevel: 2,
        price: 220,
        challenge: 'Remporter 5 combats offensifs.',
        effect: '+2 attaque en attaquant.',
    },

    // ---- Niveau 3 ----
    {
        id: 'priest',
        label: 'Prêtre',
        src: null,
        requiredLevel: 3,
        price: 300,
        challenge: 'Soigner 50 points de vie alliés.',
        effect: 'Soigne les alliés adjacents.',
    },
    {
        id: 'druid',
        label: 'Druide',
        src: null,
        requiredLevel: 3,
        price: null,
        challenge: 'Faire pousser 3 arbres.',
        effect: 'Régénère ses PV sur l’herbe.',
    },
    {
        id: 'viking',
        label: 'Viking',
        src: null,
        requiredLevel: 3,
        price: 350,
        challenge: 'Conquérir 6 cases ennemies.',
        effect: '+3 attaque sur la côte.',
    },
    {
        id: 'blackKnight',
        label: 'Chevalier noir',
        src: null,
        requiredLevel: 3,
        price: 400,
        challenge: 'Éliminer 10 unités.',
        effect: 'Ignore la première riposte.',
    },

    // ---- Niveau 4 ----
    {
        id: 'sorcerer',
        label: 'Sorcier',
        src: null,
        requiredLevel: 4,
        price: 500,
        challenge: 'Lancer 5 sorts en une partie.',
        effect: 'Attaque à distance de 2 cases.',
    },
    {
        id: 'paladin',
        label: 'Paladin',
        src: null,
        requiredLevel: 4,
        price: null,
        challenge: 'Protéger la base 10 tours.',
        effect: 'Aura de défense aux alliés.',
    },
    {
        id: 'warlock',
        label: 'Démoniste',
        src: null,
        requiredLevel: 4,
        price: 550,
        challenge: 'Sacrifier 3 alliés.',
        effect: 'Invoque un démon au combat.',
    },
    {
        id: 'king',
        label: 'Roi',
        src: null,
        requiredLevel: 4,
        price: 800,
        challenge: 'Contrôler la moitié de la carte.',
        effect: 'Booste tous les alliés du royaume.',
    },
];

// Bonus disponibles pour un niveau de soldat donné (un bonus = un seul niveau).
export const bonusOffersForLevel = (level) =>
    BONUS_OFFERS.filter((b) => b.requiredLevel === (level || 1));

// Un défi « suivi » est un objet { metric, goal, describe } ; sinon c'est une
// simple chaîne (défi pas encore branché à la logique de jeu).
const isTrackedChallenge = (challenge) => challenge != null && typeof challenge === 'object';

// Avancement d'un soldat sur le défi d'un bonus, ou `null` si le défi n'est pas
// encore suivi. Renvoie { current, goal, done } (courant plafonné à l'objectif).
export const bonusProgress = (soldier, bonus) => {
    const { challenge } = bonus;
    if (!isTrackedChallenge(challenge)) return null;
    const raw = soldier?.progress?.[challenge.metric] ?? 0;
    const current = Math.min(raw, challenge.goal);
    return { current, goal: challenge.goal, done: current >= challenge.goal };
};

// Texte du défi à afficher pour ce soldat : avec l'avancement inséré (« 2/5 »)
// pour les défis suivis, sinon la chaîne brute.
export const challengeText = (soldier, bonus) => {
    const { challenge } = bonus;
    if (!isTrackedChallenge(challenge)) return challenge;
    const { current, goal } = bonusProgress(soldier, bonus);
    return challenge.describe(current, goal);
};

// Un bonus est débloqué pour un soldat quand son défi (suivi) est terminé.
export const isBonusUnlocked = (soldier, bonus) => bonusProgress(soldier, bonus)?.done ?? false;

export const BEHAVIORS = [
    { id: 'conquest', label: 'Conquête' },
    { id: 'attack', label: 'Attaque' },
    { id: 'defense', label: 'Défense' },
    { id: 'tree', label: 'Arbre' },
    { id: 'reinforcement', label: 'Renfort' },
];

// Apparence (skin) d'un soldat selon son niveau : chaque niveau a son propre
// sprite, ce qui remplace le badge numérique affiché auparavant.
export const SOLDIER_SKINS = {
    1: '/characters/SoldierLVL1.png',
    2: '/characters/SoldierLVL2.png',
    3: '/characters/SoldierLVL3.png',
    4: '/SoldierLVL4.png',
};
export const soldierSkin = (level) => SOLDIER_SKINS[level] || SOLDIER_SKINS[1];

// Visuel (src) d'un bonus donné, ou `null` si l'asset n'existe pas encore.
export const bonusSrc = (id) => BONUS_OFFERS.find((b) => b.id === id)?.src ?? null;

// Sprite affiché pour un soldat : quand il porte un bonus (et que ce bonus a un
// visuel), il prend l'apparence du bonus ; sinon son skin de niveau.
export const soldierSprite = (soldier) =>
    (soldier?.bonus && bonusSrc(soldier.bonus)) || soldierSkin(soldier?.level || 1);

// Un bonus est achetable par CE soldat quand : son défi est accompli, le soldat
// n'a pas déjà un bonus, et le porte-monnaie couvre le prix (un soldat = un seul
// bonus). `gold` est l'or du propriétaire du soldat.
export const canBuyBonus = (soldier, bonus, gold) =>
    isBonusUnlocked(soldier, bonus) && !soldier?.bonus && gold >= (bonus.price || 0);

// Libellé affiché pour une valeur donnée (`null`/inconnu -> « Aucun(e) »).
export const affinityLabel = (id) => AFFINITIES.find((a) => a.id === id)?.label ?? 'Aucune';
export const bonusLabel = (id) => BONUS_OFFERS.find((b) => b.id === id)?.label ?? 'Aucun';
export const behaviorLabel = (id) => BEHAVIORS.find((b) => b.id === id)?.label ?? 'Aucun';
