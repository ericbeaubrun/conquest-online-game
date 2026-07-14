// Vocabulaire des caractéristiques de soldat (affinité, bonus, comportement).
// Anticipe des fonctionnalités à venir : pour l'instant un soldat naît sans
// aucune de ces caractéristiques (valeur `null`). Chaque liste sert à la fois
// d'affichage (libellés) et de source de vérité pour de futures règles.

import {
    SOLDIER_UPKEEP,
    SKELETON_UPKEEP,
    BUILDING_UPKEEP,
    SOLDIER_HP_DEFAULT,
    SOLDIER_ATK_DEFAULT,
    SOLDIER_HP_MAX,
    SOLDIER_ATK_MAX,
    MERGE_MAX,
} from '../engine/rules.js';
import { ITEM_COST } from './items.js';

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
    ENEMY_CASES_CONQUERED: 'enemyCasesConquered', // cases volées à un adversaire
    CASES_TRAVELED_OWN: 'casesTraveledOwn', // cases parcourues dans son territoire
    ENEMIES_KILLED_L2: 'enemiesKilledL2', // soldats ennemis de niveau ≥ 2 tués
    COMBATS_SURVIVED: 'combatsSurvived', // combats terminés en vie
    ALCHEMIST_MERGE: 'alchemistMerge', // fusion de 2 soldats affaiblis en niveau 2
    SKELETONS_KILLED: 'skeletonsKilled', // squelettes tués au combat
};

// Les squelettes invoqués (Mort-vivant, Démoniste) sont un SOUS-TYPE d'unité :
// mécaniquement ils occupent le plateau comme des soldats (déplacement, combat,
// territoire) mais portent le marqueur `unit: 'skeleton'`. Ils ne fusionnent pas
// et ne peuvent pas recevoir de bonus. `isSkeleton` est l'unique test partagé.
export const isSkeleton = (u) => !!u && u.unit === 'skeleton';

// Bonus « Alchimiste » : à chaque fin de tour de son propriétaire, il renforce
// l'allié adjacent le mieux portant et sans affinité. Le défi se débloque quand
// le soldat naît de la fusion de deux soldats affaiblis (PV < ce seuil).
export const ALCHEMIST_WEAK_HP = 20; // seuil de « soldat affaibli » pour la fusion
export const ALCHEMIST_ATK_BUFF = 1; // +attaque procurée à l'allié ciblé
export const ALCHEMIST_HP_BUFF = 2; // +PV procurés à l'allié ciblé

// Bonus « Guerrier » : en l'équipant, le soldat voit ses statistiques portées à
// ces valeurs, et chaque ennemi qu'il tue rapporte cette prime d'or.
export const WARRIOR_HP = 50;
export const WARRIOR_ATK = 50;
export const WARRIOR_KILL_REWARD = 20;

// Squelette invoqué par le bonus « Mort-vivant » : unité alliée qui remplace le
// soldat sur sa case au moment de sa mort. Sprite et statistiques dédiés.
export const SKELETON_SRC = '/characters/lvl2/skeleton1.png';
export const SKELETON_HP = 5;
export const SKELETON_ATK = 5;

// Bonus « Démoniste » : en l'équipant, le soldat prend ces statistiques, et à
// chaque fin de tour il invoque un squelette allié fragile (skeleton2) sur une
// case voisine libre.
export const WARLOCK_HP = 100;
export const WARLOCK_ATK = 10;
export const SKELETON2_SRC = '/characters/lvl5/skeleton2.png';
export const SKELETON2_HP = 1;
export const SKELETON2_ATK = 5;
export const WARLOCK_SUMMON_CHANCE = 0.5; // proba d'invocation par tour et par démoniste

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
    // Bonus de TEST (provisoire) : sert à valider le déplacement « fantôme ».
    // Disponible d'emblée et gratuit, il garde l'apparence du soldat de base.
    // Effet : traverse tout (soldats, structures, bases, arbres) — voir
    // `computeReachable`. À conserver ou retirer selon le ressenti en jeu.
    {
        id: 'testNinja',
        label: 'Test ninja',
        src: '/characters/lvl1/SoldierLVL1.png',
        requiredLevel: 1,
        price: null,
        challenge: null,
        effect: 'Se déplace à travers tout (soldats, structures, arbres). — TEST',
    },
    {
        id: 'lumberjack',
        label: 'Bûcheron',
        src: '/characters/lvl1/lumberJack.png',
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
        src: '/characters/lvl1/aventurer.png',
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
        src: '/characters/lvl1/runner.png',
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
        src: '/characters/lvl2/farmer.png',
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
        src: '/characters/lvl2/thief.png',
        requiredLevel: 2,
        price: 10,
        challenge: {
            metric: CHALLENGE_METRICS.ENEMY_CASES_CONQUERED,
            goal: 10,
            describe: (c, g) => `Conquérir ${c}/${g} cases ennemies.`,
        },
        effect: 'Gagne 1 or supplémentaire par case volée à l’ennemi.',
    },
    {
        id: 'undead',
        label: 'Mort-vivant',
        src: '/characters/lvl2/undead.png',
        requiredLevel: 2,
        price: null,
        challenge: {
            metric: CHALLENGE_METRICS.ENEMIES_KILLED_L2,
            goal: 1,
            describe: (c, g) => `Tuer ${c}/${g} ennemi de niveau 2 ou plus.`,
        },
        effect: 'À sa mort, invoque un squelette allié (5/10) sur sa case.',
    },
    {
        id: 'alchemist',
        label: 'Alchimiste',
        src: '/characters/lvl3/alchemist.png',
        requiredLevel: 2,
        price: 76,
        upkeep: 5,
        challenge: {
            metric: CHALLENGE_METRICS.ALCHEMIST_MERGE,
            goal: 1,
            describe: (c, g) =>
                c >= g
                    ? 'Fusion de 2 soldats affaiblis accomplie.'
                    : 'Fusionner 2 soldats de moins de 20 PV en niveau 2.',
        },
        effect: '+1 atk / +2 PV à l’allié adjacent sans affinité ayant le plus de PV.',
    },
    {
        id: 'warrior',
        label: 'Guerrier',
        src: '/characters/lvl2/GoldWarrior.png',
        requiredLevel: 2,
        price: 50,
        challenge: {
            metric: CHALLENGE_METRICS.COMBATS_SURVIVED,
            goal: 3,
            describe: (c, g) => `Survivre à ${c}/${g} combats sans mourir.`,
        },
        effect: 'Passe à 50/50 et gagne 20 or par ennemi tué.',
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
        src: '/characters/lvl4/darkWarrior.png',
        requiredLevel: 3,
        price: 40,
        upkeep: 10,
        challenge: {
            metric: CHALLENGE_METRICS.SKELETONS_KILLED,
            goal: 1,
            describe: (c, g) => `Tuer ${c}/${g} squelette.`,
        },
        effect: 'Absorbe les stats des squelettes qu’il tue (comme une fusion).',
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
        src: '/characters/lvl4/paladin.png',
        requiredLevel: 4,
        price: 100,
        upkeep: 20,
        challenge: null,
        effect: 'Récupère 2 PV à chaque tour.',
    },
    {
        id: 'warlock',
        label: 'Démoniste',
        src: '/characters/lvl5/demonist.png',
        requiredLevel: 4,
        price: 100,
        upkeep: 40,
        challenge: null,
        effect: 'Passe à 10/100 et invoque un squelette allié (10/1) chaque tour.',
    },
    {
        id: 'king',
        label: 'Roi',
        src: '/characters/lvl5/king.png',
        requiredLevel: 4,
        price: 100,
        challenge: null,
        effect: 'Tant qu’il est en vie, +50% d’or gagné par tour.',
    },
];

// Bonus « Roi » : multiplicateur appliqué au revenu de fin de tour du joueur
// tant qu'un de ses soldats porte ce bonus (est en vie).
export const KING_INCOME_MULT = 1.5;

// Bonus « Paladin » : PV régénérés à chaque fin de tour de son propriétaire
// (plafonnés au maximum d'un soldat).
export const PALADIN_HP_REGEN = 2;

// Bonus disponibles pour un niveau de soldat donné (un bonus = un seul niveau).
export const bonusOffersForLevel = (level) =>
    BONUS_OFFERS.filter((b) => b.requiredLevel === (level || 1));

// Identifiants des bonus DÉBLOQUÉS (défi accompli) et réclamables par CE soldat,
// à son niveau : bonus activés en configuration, soldat sans bonus et non
// squelette. Sert à la fois aux notifications et à leur acquittement.
export const unlockedBonusIds = (soldier, settings, enabled = true) => {
    if (!enabled || isSkeleton(soldier) || soldier?.bonus) return [];
    return bonusOffersForLevel(soldier?.level || 1)
        .filter((b) => settings?.bonusEnabled?.[b.id] !== false)
        .filter((b) => isBonusUnlocked(soldier, b))
        .map((b) => b.id);
};

// Le soldat a-t-il une notification de bonus à afficher ? Vrai quand un bonus
// débloqué et réclamable n'a pas encore été « vu » (acquitté en fin de tour via
// `bonusSeen`). Une fois le tour passé, ces bonus rejoignent `bonusSeen` et la
// notification disparaît définitivement (voir reduceEndTurn).
export const hasUnlockedBonus = (soldier, settings, enabled = true) => {
    const seen = soldier?.bonusSeen;
    return unlockedBonusIds(soldier, settings, enabled).some(
        (id) => !seen || !seen.includes(id)
    );
};

// Ce bonus précis est-il débloqué mais pas encore acquitté pour ce soldat ?
export const isBonusNotified = (soldier, bonus, settings, enabled = true) =>
    unlockedBonusIds(soldier, settings, enabled).includes(bonus.id) &&
    !(soldier?.bonusSeen?.includes(bonus.id));

// Plage des niveaux de bonus existants (pour naviguer d'un niveau à l'autre).
export const MIN_BONUS_LEVEL = Math.min(...BONUS_OFFERS.map((b) => b.requiredLevel));
export const MAX_BONUS_LEVEL = Math.max(...BONUS_OFFERS.map((b) => b.requiredLevel));

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
    if (challenge == null) return 'Aucun défi — disponible aussitôt.';
    if (!isTrackedChallenge(challenge)) return challenge;
    const { current, goal } = bonusProgress(soldier, bonus);
    return challenge.describe(current, goal);
};

// Un bonus est débloqué pour un soldat quand son défi (suivi) est terminé. Un
// bonus SANS défi (`challenge` nul) est débloqué d'emblée.
export const isBonusUnlocked = (soldier, bonus) =>
    bonus.challenge == null || (bonusProgress(soldier, bonus)?.done ?? false);

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
    1: '/characters/lvl1/SoldierLVL1.png',
    2: '/characters/lvl2/SoldierLVL2.png',
    3: '/characters/lvl3/SoldierLVL3.png',
    4: '/characters/lvl4/SoldierLVL4.png',
    5: '/characters/lvl5/SoldierLVL5.png',
};
export const soldierSkin = (level) => SOLDIER_SKINS[level] || SOLDIER_SKINS[1];

// ---- Achat direct d'un soldat de niveau supérieur (boutique) ----
// Un soldat s'obtient normalement par fusions successives : deux soldats de
// niveau N donnent un soldat de niveau N+1 (PV/attaque additionnés). La boutique
// permet d'acheter directement ce résultat. Prix et statistiques suivent donc la
// même progression que la fusion (doublement à chaque niveau), pour rester
// équivalents en or au chemin par fusion. Plafond = niveau maximum de fusion.
export const MAX_SOLDIER_PURCHASE_LEVEL = MERGE_MAX;

const clampPurchaseLevel = (level) =>
    Math.max(1, Math.min(MAX_SOLDIER_PURCHASE_LEVEL, Math.floor(level || 1)));

// Statistiques d'un soldat acheté au niveau donné : PV et attaque de base
// (configurables par partie) doublés à chaque niveau, plafonnés comme une fusion.
export function purchasedSoldierStats(level, settings) {
    const lvl = clampPurchaseLevel(level);
    const baseHp = settings?.soldierHp ?? SOLDIER_HP_DEFAULT;
    const baseAtk = settings?.soldierAtk ?? SOLDIER_ATK_DEFAULT;
    const factor = 2 ** (lvl - 1);
    return {
        level: lvl,
        hp: Math.min(baseHp * factor, SOLDIER_HP_MAX),
        atk: Math.min(baseAtk * factor, SOLDIER_ATK_MAX),
    };
}

// Prix d'un soldat au niveau donné : le prix de base de la boutique (configurable)
// doublé à chaque niveau (lvl 2 = 2× lvl 1, lvl 3 = 2× lvl 2...).
export function soldierCostForLevel(level, settings) {
    const lvl = clampPurchaseLevel(level);
    const base = settings?.itemCost?.soldier ?? ITEM_COST.soldier ?? 0;
    return base * 2 ** (lvl - 1);
}

// Visuel (src) d'un bonus donné, ou `null` si l'asset n'existe pas encore.
export const bonusSrc = (id) => BONUS_OFFERS.find((b) => b.id === id)?.src ?? null;

// Sprite affiché pour un soldat : une unité au skin dédié (ex. squelette invoqué)
// prime ; sinon, quand il porte un bonus (et que ce bonus a un visuel), il prend
// l'apparence du bonus ; à défaut son skin de niveau.
export const soldierSprite = (soldier) =>
    soldier?.skin || (soldier?.bonus && bonusSrc(soldier.bonus)) || soldierSkin(soldier?.level || 1);

// Un bonus est achetable par CE soldat quand : son défi est accompli, le soldat
// n'a pas déjà un bonus, et le porte-monnaie couvre le prix (un soldat = un seul
// bonus). `gold` est l'or du propriétaire du soldat.
export const canBuyBonus = (soldier, bonus, gold, settings) =>
    isBonusUnlocked(soldier, bonus) && !soldier?.bonus && gold >= bonusPriceOf(bonus, settings);

// Entretien (or/tour) propre à un bonus (0 par défaut). Configurable par partie
// (`settings.bonusUpkeep`) ; retombe sur le barème du bonus sinon.
export const bonusUpkeep = (id, settings) =>
    settings?.bonusUpkeep?.[id] ?? BONUS_OFFERS.find((b) => b.id === id)?.upkeep ?? 0;

// Prix d'achat d'un bonus, configurable par partie (`settings.bonusPrice`) ;
// retombe sur le prix du bonus (0 = gratuit) sinon.
export const bonusPriceOf = (bonus, settings) =>
    settings?.bonusPrice?.[bonus.id] ?? bonus.price ?? 0;

// Entretien (or/tour) d'une unité possédée, source de vérité unique du barème.
// Tous les postes sont configurables via `settings` (retombent sur les barèmes
// par défaut sinon) :
//   - squelette invoqué : `upkeep.skeleton` ;
//   - soldat : `upkeep.soldier{niveau}` + entretien de son bonus éventuel ;
//   - tour : `upkeep.tower` ; maison : rendement `houseIncome` (négatif = gain) ;
//   - autres bâtiments / arbre : barème `BUILDING_UPKEEP`.
// Valeur POSITIVE = coût prélevé sur le revenu ; NÉGATIVE = gain. Défaut 0.
export const upkeepFor = (unit, settings) => {
    if (!unit) return 0;
    if (unit.type === 'soldier') {
        if (isSkeleton(unit)) return settings?.upkeep?.skeleton ?? SKELETON_UPKEEP;
        const lvl = unit.level || 1;
        const base = settings?.upkeep?.[`soldier${lvl}`] ?? SOLDIER_UPKEEP[lvl] ?? 0;
        return base + (unit.bonus ? bonusUpkeep(unit.bonus, settings) : 0);
    }
    if (unit.type === 'house') {
        // Maison : entretien négatif = revenu (rendement configurable).
        return settings?.houseIncome != null ? -settings.houseIncome : BUILDING_UPKEEP.house;
    }
    if (unit.type === 'attackTower' || unit.type === 'defenseTower') {
        return settings?.upkeep?.tower ?? BUILDING_UPKEEP[unit.type];
    }
    return BUILDING_UPKEEP[unit.type] ?? 0;
};

// Libellé affiché pour une valeur donnée (`null`/inconnu -> « Aucun(e) »).
export const affinityLabel = (id) => AFFINITIES.find((a) => a.id === id)?.label ?? 'Aucune';
export const bonusLabel = (id) => BONUS_OFFERS.find((b) => b.id === id)?.label ?? 'Aucun';
export const behaviorLabel = (id) => BEHAVIORS.find((b) => b.id === id)?.label ?? 'Aucun';

// Rangs d'attaque (RPG) : chaque tranche de 10 % de l'attaque maximale d'un
// soldat lui attribue un titre, du plus faible (« Novice ») au plus fort
// (« Légendaire »). Le seuil est le plafond EXCLU de la tranche, en pourcentage
// (ex. < 10 % -> Novice, < 20 % -> Adepte, … ≥ 100 % -> Légendaire).
export const ATK_RANKS = [
    {maxPct: 10, label: 'Novice'},
    {maxPct: 20, label: 'Adepte'},
    {maxPct: 30, label: 'Vétéran'},
    {maxPct: 40, label: 'Élite'},
    {maxPct: 50, label: 'Maître'},
    {maxPct: 60, label: 'Prodige'},
    {maxPct: 70, label: 'Virtuose'},
    {maxPct: 80, label: 'Souverain'},
    {maxPct: 90, label: 'Seigneur'},
    {maxPct: 100, label: 'Mythique'},
];

// Titre du rang d'attaque pour une valeur d'attaque donnée rapportée à son max.
export const atkRankLabel = (atk, max) => {
    const pct = max > 0 ? (atk / max) * 100 : 0;
    return (ATK_RANKS.find((r) => pct < r.maxPct) ?? {label: 'Légendaire'}).label;
};

// Nombre de DEMI-ÉTOILES (0 à 10) correspondant au rang d'attaque : chaque rang
// vaut une demi-étoile de plus que le précédent (Novice = 0, Adepte = 1, …
// Mythique = 9, Légendaire = 10 = 5 étoiles pleines à 100 % d'attaque).
export const atkHalfStars = (atk, max) => {
    const pct = max > 0 ? (atk / max) * 100 : 0;
    const idx = ATK_RANKS.findIndex((r) => pct < r.maxPct);
    return idx === -1 ? ATK_RANKS.length : idx;
};

// Nombre de DEMI-ÉPÉES (0 à 10) pour une valeur d'attaque donnée : même
// principe que `hpHalfHearts` (une tranche de 10 points d'attaque vaut une
// demi-épée), indépendant du maximum réel de l'unité — évite que les
// structures à faible attaque relative (ex. tour de défense) n'affichent
// que des épées vides malgré une attaque significative en points bruts.
export const atkHalfStarsFlat = (atk) => Math.max(0, Math.min(10, Math.ceil((atk ?? 0) / 10)));

// Nombre de DEMI-CŒURS (0 à 10) pour un total de PV : une tranche de 10 PV vaut
// un demi-cœur (≤ 10 PV = 1 demi-cœur, ≤ 20 = 1 cœur, … ≤ 100 = 5 cœurs pleins).
export const hpHalfHearts = (hp) => Math.max(0, Math.min(10, Math.ceil((hp ?? 0) / 10)));

// Titres liés au NIVEAU du soldat (indexés à 1) : remplace le générique
// « Humain » par un titre qui progresse avec le niveau du soldat.
export const LEVEL_RANKS = ['Ignorant', 'Initié', 'Érudit', 'Stratège', 'Éveillé'];

// Titre de niveau pour un soldat donné (borné aux niveaux définis).
export const levelRankLabel = (level) =>
    LEVEL_RANKS[Math.max(1, Math.min(LEVEL_RANKS.length, level || 1)) - 1];
