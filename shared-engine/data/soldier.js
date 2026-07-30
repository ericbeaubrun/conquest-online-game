// Vocabulaire des caractéristiques de soldat (affinité, bonus, comportement).
// Anticipe des fonctionnalités à venir : pour l'instant un soldat naît sans
// aucune de ces caractéristiques (valeur `null`). Chaque liste sert à la fois
// d'affichage (libellés) et de source de vérité pour de futures règles.

import {
    SOLDIER_UPKEEP,
    BUILDING_UPKEEP,
    SOLDIER_HP_DEFAULT,
    SOLDIER_ATK_DEFAULT,
    SOLDIER_HP_MAX,
    SOLDIER_ATK_MAX,
    MERGE_MAX,
    SHIELD_AFFINITY,
    SOLDIER_LEVEL_STATS,
} from '../engine/rules.js';
import { ITEM_COST } from './items.js';
import { isSkeleton, isSummonedUnit, unitUpkeep, unitLabel, unitKind, unitKindById } from './units.js';

// Un couple de statistiques au format « ATK/PV » — la convention d'affichage du
// jeu (le Prêtre est un 1/16, le Vampire un 10/2).
//
// Les textes d'effet des bonus CALCULENT ces valeurs au lieu de les recopier :
// elles avaient divergé du moteur (un squelette annoncé 5/10 en valait 1/1, un
// dragon annoncé 100/100 en valait 16/16, un guerrier annoncé 50/50 en valait
// 4/6), parce que rien ne reliait la phrase aux chiffres. C'est désormais lié.
const statsText = (s) => (s ? `${s.atk}/${s.hp}` : '?/?');

// Statistiques d'une espèce invoquée, lues au catalogue `units.js`.
const unitStatsText = (kindId) => statsText(unitKindById(kindId));

// Entretien d'une espèce invoquée, lu au même catalogue. Même raison d'être que
// `statsText` : un texte d'effet qui ANNONCE une facture doit la lire là où elle
// est appliquée, sinon les deux divergent au premier réglage.
const unitUpkeepText = (kindId) => `${unitKindById(kindId)?.upkeep ?? 0} or/tour`;

// Profils que certains bonus IMPOSENT à leur porteur quand on les équipe (ils
// remplacent les statistiques de niveau — voir `reduceBuyBonus`). Nommés ici
// pour que `stats:` et le texte d'effet ne puissent pas se contredire.
const WARRIOR_STATS = {atk: 2, hp: 2};
const WARLOCK_STATS = {atk: 1, hp: 16};
const SORCERER_STATS = {atk: 12, hp: 12};

// Affinités affichables. Les quatre s'achètent et se trouvent (le BOUCLIER
// s'obtient en plus en équipant le bonus « Paladin ») ; il ne figure pas dans
// `AFFINITY_IDS` (réservée aux éléments qui s'annulent entre eux et sortent
// des tirages d'arbres — voir `rules.js`), seulement ici pour être nommé et
// illustré dans les panneaux.
export const AFFINITIES = [
    { id: 'fire', label: 'Feu' },
    { id: 'ice', label: 'Glace' },
    { id: 'lightning', label: 'Foudre' },
    { id: SHIELD_AFFINITY, label: 'Bouclier' },
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
    ENEMIES_KILLED: 'enemiesKilled', // unités ennemies tuées, quel que soit leur niveau
    ENEMIES_KILLED_L2: 'enemiesKilledL2', // soldats ennemis de niveau ≥ 2 tués
    COMBATS_SURVIVED: 'combatsSurvived', // combats terminés en vie
    SKELETONS_KILLED: 'skeletonsKilled', // squelettes tués au combat
    CHESTS_OPENED: 'chestsOpened', // coffres ouverts par le soldat
    PALADIN_IDLE_TURNS: 'paladinIdleTurns', // tours consécutifs terminés sans agir
    // Défi « Moine » : une PURETÉ, c'est-à-dire l'ABSENCE des trois compteurs
    // ci-dessus (aucun mort, aucun arbre abattu, aucune case conquise). Dérivé
    // de `progress`, jamais stocké — voir son évaluateur dans `SOLDIER_CHALLENGES`.
    MONK_PURITY: 'monkPurity',
    // --- Défis d'ÉTAT : recalculés EN DIRECT, jamais stockés dans `progress`
    // (voir `STATE_CHALLENGES` plus bas). Ils s'ouvrent et se referment aussitôt
    // que la situation du plateau change, sans attendre la fin du tour.
    DRUID_TREES_KEPT: 'druidTreesKept', // arbres sur son territoire
    NO_TREES_ON_TERRITORY: 'noTreesOnTerritory', // aucun arbre sur son territoire
    HAS_AFFINITY: 'hasAffinity', // le soldat porte une affinité (lu sur `soldier.affinity`)
    HOUSES_OWNED: 'housesOwned', // maisons possédées par le joueur
    TOWER_KINDS_OWNED: 'towerKindsOwned', // types de tours possédés (attaque et/ou défense) : 0, 1 ou 2
    // Défi « Alchimiste » : être l'UNIQUE allié de SON PROPRE niveau — s'ouvre
    // et se referme aussitôt qu'un autre allié du MÊME niveau apparaît ou
    // disparaît (fusion, achat, mort), jamais figé une fois rempli. Générique
    // (lu sur `soldier.level`, pas figé à un niveau précis) : n'importe quel
    // bonus peut s'en servir pour son propre palier.
    NO_OTHER_SAME_LEVEL_ALLY: 'noOtherSameLevelAlly', // aucun AUTRE allié du même niveau
    NO_CONQUEROR_ON_BOARD: 'noConquerorOnBoard', // aucun soldat « Conquérant » sur le plateau, tous joueurs confondus
    NO_KING_ON_BOARD: 'noKingOnBoard', // aucun soldat « Roi » sur le plateau, tous joueurs confondus
    NO_WARLOCK_ON_BOARD: 'noWarlockOnBoard', // aucun soldat « Démoniste » sur le plateau, tous joueurs confondus
    NO_SORCERER_ON_BOARD: 'noSorcererOnBoard', // aucun soldat « Sorcier » sur le plateau, tous joueurs confondus
};

// Les sous-types d'unités (squelette, arbre-druide, dragon, créatures du
// sorcier) vivent dans leur propre catalogue : `data/units.js` décrit leurs
// sprites, statistiques, libellés et tailles de rendu. On réexporte ici les
// tests les plus utilisés pour ne pas éclater les imports des appelants.
export {isSkeleton, isSummonedUnit};

// Un soldat peut-il RECEVOIR une affinité (feu / glace / foudre) achetée en
// boutique ? Toute unité posée sur le plateau le peut — invocations et créatures
// d'envoûtement comprises — à la seule condition de ne pas en avoir déjà une :
// une affinité ne se remplace jamais. Celles qui en portent déjà l'ont héritée
// de leur origine (voir `makeUnit` / `makeCursed`). Test PUR partagé par le
// reducer (validation) et l'interface (cases ciblables).
export const canReceiveAffinity = (u) =>
    !!u && u.type === 'soldier' && u.affinity == null;

// Un soldat peut-il RECEVOIR la potion de sacrifice (boutique) ? Tout soldat
// du joueur actif — ordinaire, avec bonus, ou unité invoquée/envoûtée — sa
// valeur en tas d'or dépend de son attaque et de ses PV (voir
// `SACRIFICE_GOLD_PER_POINT`), jamais nulle pour un soldat réellement en jeu.
// Les STRUCTURES (maison, tours) en sont délibérément exclues : leur ratio
// attaque+PV / prix est bien plus favorable que celui de n'importe quel
// soldat ou bonus (une tour d'attaque, 25 or, rendrait un tas de 60 or — 240 %
// de son prix), ce qui en ferait une fabrique à or plutôt qu'une défense.
// Test PUR partagé par le reducer et l'interface.
export const canReceiveSacrifice = (u) => !!u && u.type === 'soldier';

// Bonus « Bûcheron » : multiplicateur appliqué à l'or d'abattage d'un arbre,
// APRÈS le multiplicateur d'essence (voir `treeReward` dans `trees.js`).
export const LUMBERJACK_REWARD_MULT = 2;

// Bonus « Aventurier » : or récolté à chaque case conquise, quelle qu'elle soit.
export const ADVENTURER_CASE_REWARD = 5;

// Bonus « Voleur » : or récolté par case prise à un ADVERSAIRE (une case neutre
// ne rapporte rien). Un soldat ne portant qu'un seul bonus, cette prime et celle
// de l'Aventurier ne se rencontrent jamais sur la même unité.
export const THIEF_ENEMY_CASE_REWARD = 10;

// Bonus « Ninja » : multiplicateur de la portée de déplacement à l'intérieur du
// territoire (la conquête reste limitée à 1 case hors territoire). Hérité du
// « Coureur », retiré du catalogue et dont le ninja reprend l'effet.
export const NINJA_MOVE_MULT = 2;

// Bonus « Alchimiste » : à chaque fin de tour de son propriétaire, il transmute
// sa propre chair en armes — il arme TOUS ses voisins alliés à la fois, et paie
// de ses PV pour CHACUN. Même logique d'échange que le « Prêtre », dans l'autre
// sens : plus il est entouré, plus il se vide vite.
export const ALCHEMIST_ATK_BUFF = 1; // +attaque procurée à chaque allié adjacent
export const ALCHEMIST_HP_COST = 1; // PV que l'alchimiste se retire PAR allié armé

// Bonus « Prêtre » : à chaque fin de tour de son propriétaire, il donne de sa
// propre vie pour soigner TOUS ses voisins alliés. L'échange lui est FAVORABLE —
// il rend deux PV pour un — ce qui est tout son intérêt : un prêtre entouré
// transforme sa réserve de PV en une réserve deux fois plus grande, répartie.
export const PRIEST_HP_GIFT = 2; // PV rendus à chaque allié adjacent
export const PRIEST_HP_COST = 1; // PV que le prêtre se retire PAR allié soigné

// Bonus « Moine » : or gagné à chaque tour qu'il termine SANS avoir agi. Sa
// contemplation est sa production — le pendant économique du « Paladin », qui
// convertit la même inaction en PV.
export const MONK_IDLE_REWARD = 5;

// Bonus « Magicien » : à chaque fin de tour de son propriétaire, il transmet SA
// PROPRE affinité à UN allié adjacent sans affinité, et rapporte cette prime
// d'or à chaque don.
export const MAGICIAN_GOLD_REWARD = 10;

// Bonus « Guerrier » : chaque ennemi qu'il tue rapporte cette prime d'or. Calée
// sur le prix d'un soldat de base : trois victimes financent un remplaçant.
export const WARRIOR_KILL_REWARD = 100;

// Bonus « Chevalier noir » : or récolté à chaque squelette qu'il abat — le
// pendant offensif de son immunité aux squelettes.
export const BLACK_KNIGHT_SKELETON_REWARD = 30;

// Bonus « Démoniste » : à chaque fin de tour il invoque un squelette allié
// (l'espèce « skeleton2 » du catalogue `units.js`) sur une case voisine libre.
export const WARLOCK_SUMMON_CHANCE = 0.5; // proba d'invocation par tour et par démoniste

// Bonus « Vampire » : à chaque fin de tour de son propriétaire, il draine ce
// nombre de PV à UN SEUL soldat allié adjacent — le mieux portant, celui qui le
// supportera le mieux — sans jamais le descendre sous 1 PV (il n'achève pas ses
// propres alliés), et récupère pour lui les PV volés.
export const VAMPIRE_DRAIN = 1;

// Bonus « Druide » : au lieu de récolter un arbre, le druide le TRANSFORME en
// une unité alliée « arbre-druide » (espèce `druidTree` du catalogue
// `units.js`), qui occupe la case de l'arbre. Le défi se débloque en ayant
// DRUID_TREES_REQUIRED arbres sur son territoire.
export const DRUID_TREES_REQUIRED = 4; // arbres à avoir sur son territoire

// Défi « Paladin » : nombre de tours CONSÉCUTIFS que le soldat doit terminer sans
// avoir agi (ni déplacement, ni fusion, ni attaque, ni abattage) pour débloquer
// le bonus.
export const PALADIN_IDLE_TURNS = 2;

// Bonus « Roi » : multiplicateur appliqué aux DEUX rentrées que le joueur tire
// de ce qu'il POSSÈDE — le rendement de ses maisons et l'or de son territoire
// (1 or par case) — tant qu'un de ses soldats porte ce bonus et est en vie. Le
// revenu de base et les entretiens ne sont pas touchés : le roi récompense
// l'expansion, il n'efface pas les factures.
export const KING_INCOME_MULT = 2;

// Bonus « Paladin » : PV régénérés à la fin d'un tour qu'il a terminé SANS agir
// — la contrepartie de son immobilité, dans la continuité de son défi.
export const PALADIN_IDLE_HEAL = 1;

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
//   - stats    : { atk, hp } que le soldat PREND en équipant le bonus. Chaque
//                bonus a son propre profil — le Prêtre encaisse (1/32), le
//                Vampire frappe et meurt vite (10/2) — et ces valeurs REMPLACENT
//                celles du niveau (voir `reduceBuyBonus`). C'est le cœur de
//                l'équilibrage : un bonus se choisit autant pour sa silhouette
//                de statistiques que pour son effet.
//   - upkeep   : SURCOÛT d'entretien par tour, ajouté à celui du NIVEAU du
//                porteur (`SOLDIER_UPKEEP`) — ce n'est pas l'or/tour final.
//                Positif = coût, négatif = revenu, absent = 0 (le bonus ne
//                change rien à l'entretien du niveau). L'or/tour réellement
//                payé est donné par `bonusTotalUpkeep`, et c'est LUI qui
//                s'affiche dans le panneau : un bonus lu « −4 or/tour » coûte
//                bien 4 or au total, entretien de niveau compris.
//   - challenge : défi à accomplir pour débloquer. Soit une chaîne (défi pas
//                 encore branché), soit un objet suivi { metric, goal, describe }
//                 où `describe(courant, objectif)` produit le texte d'avancement.
//   - effect   : effet accordé une fois débloqué (placeholder pour l'instant)
export const BONUS_OFFERS = [
    // ---- Niveau 1 ----
    {
        id: 'lumberjack',
        label: 'Bûcheron',
        src: '/characters/lvl1/lumberJack.png',
        requiredLevel: 1,
        stats: {atk: 1, hp: 2},
        price: 20,
        challenge: {
            metric: CHALLENGE_METRICS.TREES_CHOPPED,
            goal: 1,
            describe: (c, g) => `Détruire ${c}/${g} arbre.`,
        },
        effect: 'Gagne 2× plus d’or en coupant les arbres.',
    },
    {
        id: 'adventurer',
        label: 'Aventurier',
        src: '/characters/lvl1/aventurer.png',
        requiredLevel: 1,
        stats: {atk: 1, hp: 2},
        price: 20,
        challenge: {
            metric: CHALLENGE_METRICS.CASES_CONQUERED,
            goal: 3,
            describe: (c, g) => `Conquérir ${c}/${g} cases.`,
        },
        effect: `Récolte ${ADVENTURER_CASE_REWARD} or par case conquise.`,
    },
    {
        id: 'thief',
        label: 'Voleur',
        src: '/characters/lvl2/thief.png',
        requiredLevel: 1,
        // Lame de verre du premier palier : il frappe deux fois plus fort qu'un
        // soldat de son niveau, mais un seul coup le tue. C'est le prix de sa
        // prime — la plus grosse rentrée d'or du niveau 1.
        stats: {atk: 2, hp: 1},
        price: 20,
        challenge: {
            metric: CHALLENGE_METRICS.ENEMY_CASES_CONQUERED,
            goal: 2,
            describe: (c, g) => `Conquérir ${c}/${g} cases ennemies.`,
        },
        effect: `Gagne ${THIEF_ENEMY_CASE_REWARD} or supplémentaires par case volée à l’ennemi.`,
    },
    // Le « Fermier » est un bonus de niveau 1 : sa production d'arbres est une
    // ouverture économique, elle n'a d'intérêt que jouée tôt. Il garde le profil
    // nu de son niveau (1/1) — un planteur, pas un combattant — et RAPPORTE
    // 5 or/tour (voir `upkeep`, entretien du niveau 1 compris).
    {
        id: 'farmer',
        label: 'Fermier',
        src: '/characters/lvl2/farmer.png',
        requiredLevel: 1,
        stats: {atk: 1, hp: 1},
        price: 20,
        upkeep: 3, // 2 (niveau 1) + 3 = 5 or/tour prélevés
        challenge: {
            metric: CHALLENGE_METRICS.ENEMY_TREES_CHOPPED,
            goal: 1,
            describe: (c, g) => `Détruire ${c}/${g} arbre sur le territoire ennemi.`,
        },
        effect: 'Fait pousser un arbre à la frontière (chaque tour).',
    },

    // ---- Niveau 2 ----
    {
        id: 'undead',
        label: 'Mort-vivant',
        src: '/characters/lvl2/undead.png',
        requiredLevel: 2,
        stats: {atk: 2, hp: 4},
        price: 30,
        challenge: {
            metric: CHALLENGE_METRICS.ENEMIES_KILLED_L2,
            goal: 1,
            describe: (c, g) => `Tuer ${c}/${g} ennemi de niveau 2 ou plus.`,
        },
        effect: `À sa mort, invoque un squelette allié (${unitStatsText('skeleton')}) sur sa case.`,
    },
    // Bonus « Ninja » : déplacement « fantôme » — traverse TOUT (soldats,
    // structures, bases, arbres) pour se repositionner, MAIS ne peut pas
    // attaquer à travers un obstacle (voir `computeReachable` : les cibles de
    // combat/abattage ne sont validées que depuis une case où il peut se tenir).
    // Il hérite en plus de la portée doublée de l'ancien « Coureur » : c'est le
    // bonus de la MOBILITÉ, et rien d'autre ne s'en occupe plus.
    {
        id: 'ninja',
        label: 'Ninja',
        src: '/characters/lvl3/ninja.png',
        requiredLevel: 2,
        stats: {atk: 2, hp: 4},
        price: 30,
        upkeep: 6, // 4 (niveau 2) + 6 = 10 or/tour prélevés
        challenge: {
            metric: CHALLENGE_METRICS.CHESTS_OPENED,
            goal: 1,
            describe: (c, g) => `Ouvrir ${c}/${g} coffre.`,
        },
        effect: `Se déplace à travers tout et ${NINJA_MOVE_MULT}× plus loin en territoire allié.`,
    },
    {
        id: 'warrior',
        label: 'Guerrier',
        src: '/characters/lvl2/GoldWarrior.png',
        requiredLevel: 2,
        stats: WARRIOR_STATS,
        price: 100,
        upkeep: -14, // couvre l'entretien du niveau 2 (4) et RAPPORTE 8 or par tour
        challenge: {
            metric: CHALLENGE_METRICS.COMBATS_SURVIVED,
            goal: 2,
            describe: (c, g) => `Survivre à ${c}/${g} combats sans mourir.`,
        },
        effect: `Gagne ${WARRIOR_KILL_REWARD} or pour chaque ennemi qu'il tue.`,
    },
    // Bonus « Moine » : le pacifiste. Son défi n'est pas un exploit à accomplir
    // mais une innocence à PRÉSERVER — il s'ouvre d'emblée et se referme au
    // premier meurtre, au premier arbre abattu, à la première case conquise.
    // Seul défi du jeu qui se PERD, d'où sa lecture en direct dans `progress`.
    {
        id: 'monk',
        label: 'Moine',
        src: '/characters/lvl2/monk.png',
        requiredLevel: 2,
        stats: {atk: 2, hp: 2},
        price: 10,
        upkeep: -4, // annule l'entretien du niveau 2 : le moine ne coûte rien par tour
        challenge: {
            metric: CHALLENGE_METRICS.MONK_PURITY,
            goal: 1,
            describe: (c, g) =>
                c >= g
                    ? `Ne pas tuer, abattre d'arbre ou conquérir de case.`
                    : `Ne pas tuer, abattre d'arbre ou conquérir de case.`,
        },
        effect: `Gagne ${MONK_IDLE_REWARD} or à chaque tour qu’il termine sans avoir agi.`,
    },

    // ---- Niveau 3 ----
    {
        id: 'viking',
        label: 'Viking',
        src: '/characters/lvl2/viking.png',
        requiredLevel: 3,
        stats: {atk: 2, hp: 12},
        price: 40,
        upkeep: 4, // 8 (niveau 3) + 4 = 12 or/tour prélevés
        challenge: {
            metric: CHALLENGE_METRICS.TOWER_KINDS_OWNED,
            goal: 2,
            describe: (c, g) =>
                c >= g
                    ? 'Posséder une tour d’attaque et de défense.'
                    : `Posséder une tour d’attaque et de défense (${c}/${g}).`,
        },
        effect: 'Ne subit aucun dégât des tours.',
    },
    {
        id: 'vampire',
        label: 'Vampire',
        src: '/characters/lvl3/vampire.png',
        requiredLevel: 3,
        stats: {atk: 10, hp: 2},
        price: 40,
        upkeep: 4, // 8 (niveau 3) + 4 = 12 or/tour prélevés
        challenge: {
            metric: CHALLENGE_METRICS.NO_TREES_ON_TERRITORY,
            goal: 1,
            describe: (c, g) =>
                c >= g ? 'Aucun arbre sur son territoire.' : 'Aucun arbre sur son territoire.',
        },
        effect: 'Chaque tour, vole 1 PV à l’allié adjacent ayant le plus de PV.',
    },
    {
        id: 'magician',
        label: 'Magicien',
        src: '/characters/lvl3/magicien.png',
        requiredLevel: 3,
        stats: {atk: 1, hp: 4},
        price: 40,
        upkeep: -8, // annule l'entretien du niveau 3 : le magicien ne coûte rien par tour
        challenge: {
            metric: CHALLENGE_METRICS.HAS_AFFINITY,
            goal: 1,
            describe: (c, g) => (c >= g ? 'Affinité acquise.' : 'Porter une affinité.'),
        },
        effect: `Transmet son affinité à un allié adjacent et gagne ${MAGICIAN_GOLD_REWARD} or.`,
    },
    {
        id: 'alchemist',
        label: 'Alchimiste',
        src: '/characters/lvl3/alchemist.png',
        requiredLevel: 3,
        stats: {atk: 1, hp: 16},
        price: 40,
        upkeep: -8, // annule l'entretien du niveau 3 : l'alchimiste paie en PV, pas en or
        challenge: {
            metric: CHALLENGE_METRICS.NO_OTHER_SAME_LEVEL_ALLY,
            goal: 1,
            describe: (c, g) => (c >= g ? 'Unique niveau 3 allié.' : 'N’avoir aucun autre niveau 3 allié.'),
        },
        effect: `Chaque tour, donne +${ALCHEMIST_ATK_BUFF} atk à TOUS les alliés adjacents, au prix de ${ALCHEMIST_HP_COST} PV par allié.`,
    },

    // ---- Niveau 4 ----
    {
        id: 'priest',
        label: 'Prêtre',
        src: '/characters/lvl4/pretre.png',
        requiredLevel: 4,
        stats: {atk: 1, hp: 16},
        price: 60,
        upkeep: -16, // annule l'entretien du niveau 4 : le prêtre paie en PV, pas en or
        challenge: {
            metric: CHALLENGE_METRICS.HOUSES_OWNED,
            goal: 6,
            describe: (c, g) => (c >= g ? `${g} maisons possédées.` : `Posséder ${c}/${g} maisons.`),
        },
        effect: `Chaque tour, rend ${PRIEST_HP_GIFT} PV à TOUS les alliés adjacents, au prix de ${PRIEST_HP_COST} PV par allié.`,
    },
    {
        id: 'blackKnight',
        label: 'Chevalier noir',
        src: '/characters/lvl4/darkWarrior.png',
        requiredLevel: 4,
        stats: {atk: 8, hp: 16},
        price: 60,
        challenge: {
            metric: CHALLENGE_METRICS.SKELETONS_KILLED,
            goal: 1,
            describe: (c, g) => (c >= g ? 'Squelette tué ou possédé.' : 'Tuer ou posséder un squelette.'),
        },
        effect: `Ne prend aucun dégât face aux squelettes, et gagne ${BLACK_KNIGHT_SKELETON_REWARD} or par squelette tué.`,
    },
    {
        id: 'paladin',
        label: 'Paladin',
        src: '/characters/lvl4/paladin.png',
        requiredLevel: 4,
        stats: {atk: 8, hp: 12},
        price: 150,
        upkeep: 16, // 16 (niveau 4) + 16 = 32 or/tour prélevés
        challenge: {
            metric: CHALLENGE_METRICS.PALADIN_IDLE_TURNS,
            goal: PALADIN_IDLE_TURNS,
            describe: (c, g) =>
                c >= g
                    ? `${PALADIN_IDLE_TURNS} tours sans agir accomplis.`
                    : `Terminer son tour sans agir (${c}/${g} tours consécutifs).`,
        },
        effect:
            `Porte l’affinité Bouclier divin et regagne ${PALADIN_IDLE_HEAL} PV à chaque tour terminé sans agir.`,
    },
    {
        id: 'druid',
        label: 'Druide',
        src: '/characters/lvl4/druid.png',
        requiredLevel: 4,
        stats: {atk: 2, hp: 6},
        price: null,
        upkeep: -16, // annule l'entretien du niveau 4 : le druide ne coûte rien par tour
        challenge: {
            metric: CHALLENGE_METRICS.DRUID_TREES_KEPT,
            goal: DRUID_TREES_REQUIRED,
            describe: (c, g) =>
                c >= g ? `${g} arbres sur son territoire.` : `Avoir ${c}/${g} arbres sur son territoire.`,
        },
        // Le druide est GRATUIT et sans entretien : sa facture, c'est son armée.
        // Chaque arbre transformé coûte cher par tour — d'où l'annonce du prix
        // ici, lue au catalogue des unités.
        effect: `Transforme l’arbre ciblé en allié (${unitStatsText('druidTree')}, entretien ${unitUpkeepText('druidTree')}).`,
    },

    // ---- Niveau 5 ----
    {
        id: 'sorcerer',
        label: 'Sorcier',
        src: '/characters/lvl5/sorceler.png',
        requiredLevel: 5,
        stats: SORCERER_STATS,
        price: 500,
        // Aucun surcoût : il paie l'entretien plein de son niveau (32 or/tour).
        challenge: {
            metric: CHALLENGE_METRICS.NO_SORCERER_ON_BOARD,
            goal: 1,
            describe: (c, g) => (c >= g ? 'Aucun sorcier sur le terrain.' : 'Qu’aucun sorcier ne soit sur le terrain.'),
        },
        effect: `Transforme rois, démonistes et conquérants en animaux insignifiants, sans cible, il invoque un puissant dragon.`,
    },
    {
        id: 'warlock',
        label: 'Démoniste',
        src: '/characters/lvl5/demonist.png',
        requiredLevel: 5,
        stats: WARLOCK_STATS,
        price: 100,
        // Aucun surcoût : il paie l'entretien plein de son niveau (32 or/tour),
        // et chacun de ses squelettes le sien par-dessus.
        challenge: {
            metric: CHALLENGE_METRICS.NO_WARLOCK_ON_BOARD,
            goal: 1,
            describe: (c, g) => (c >= g ? 'Aucun démoniste sur le terrain.' : 'Qu’aucun démoniste ne soit sur le terrain.'),
        },
        effect: `Une fois sur deux où il n’a pas agi pendant son tour, invoque un squelette allié (${unitStatsText('skeleton2')}, ${unitUpkeepText('skeleton2')}).`,
    },
    {
        id: 'king',
        label: 'Roi',
        src: '/characters/lvl5/king.png',
        requiredLevel: 5,
        stats: {atk: 1, hp: 2},
        price: 2000,
        upkeep: -32, // annule l'entretien du niveau 5 : le roi ne coûte rien par tour
        challenge: {
            metric: CHALLENGE_METRICS.NO_KING_ON_BOARD,
            goal: 1,
            describe: (c, g) => (c >= g ? 'Aucun roi sur le terrain.' : 'Qu’aucun roi ne soit sur le terrain.'),
        },
        effect: `Tant qu’il est en vie, les maisons ET le territoire rapportent ${KING_INCOME_MULT}× plus d’or par tour.`,
    },
    {
        id: 'conqueror',
        label: 'Conquérant',
        src: '/characters/lvl5/conquerant.png',
        requiredLevel: 5,
        stats: {atk: 16, hp: 16},
        price: 200,
        challenge: {
            metric: CHALLENGE_METRICS.NO_CONQUEROR_ON_BOARD,
            goal: 1,
            describe: (c, g) => (c >= g ? 'Aucun conquérant sur le terrain.' : 'Qu’aucun conquérant ne soit sur le terrain.'),
        },
        effect: 'Porte l’affinité Bouclier divin et à chaque tour conquiert les cases vides autour de lui.',
    },
];

// Bonus « Sorcier » : à L'INSTANT DE SON ACHAT (une seule fois, jamais rejoué
// aux tours suivants), il ENVOÛTE les
// soldats ENNEMIS portant l'un des trois autres bonus de niveau 5. Le soldat
// touché est remplacé par une créature dérisoire (1/1) qui reste au service de
// son propriétaire mais perd son bonus et son effet ; seule son AFFINITÉ
// survit au sort. Chaque bonus a sa créature.
// Les créatures elles-mêmes (cochon, corbeau, grenouille) et le dragon sont des
// espèces du catalogue `units.js` : c'est leur champ `curseOf` qui désigne le
// bonus qu'elles remplacent (voir `curseFor` / `isCursable`).
//
// Faute de cible à envoûter (aucun roi, démoniste ni conquérant sur le
// plateau), le sorcier invoque à la place UN dragon — une seule fois, sans quoi
// il en produirait un par tour.

// Bonus disponibles pour un niveau de soldat donné (un bonus = un seul niveau).
export const bonusOffersForLevel = (level) =>
    BONUS_OFFERS.filter((b) => b.requiredLevel === (level || 1));

// Identifiants des bonus DÉBLOQUÉS (défi accompli) et réclamables par CE soldat,
// à son niveau : bonus activés en configuration, soldat sans bonus et non
// squelette. Sert à la fois aux notifications et à leur acquittement.
export const unlockedBonusIds = (soldier, settings, enabled = true, world) => {
    if (!enabled || isSummonedUnit(soldier) || soldier?.bonus) return [];
    return bonusOffersForLevel(soldier?.level || 1)
        .filter((b) => settings?.bonusEnabled?.[b.id] !== false)
        .filter((b) => isBonusUnlocked(soldier, b, settings, world))
        .map((b) => b.id);
};

// Le soldat a-t-il une notification de bonus à afficher ? Vrai quand un bonus
// débloqué et réclamable n'a pas encore été « vu » (acquitté en fin de tour via
// `bonusSeen`). Une fois le tour passé, ces bonus rejoignent `bonusSeen` et la
// notification disparaît définitivement (voir reduceEndTurn).
export const hasUnlockedBonus = (soldier, settings, enabled = true, world) => {
    const seen = soldier?.bonusSeen;
    return unlockedBonusIds(soldier, settings, enabled, world).some(
        (id) => !seen || !seen.includes(id)
    );
};

// Ce bonus précis est-il débloqué mais pas encore acquitté pour ce soldat ?
export const isBonusNotified = (soldier, bonus, settings, enabled = true, world) =>
    unlockedBonusIds(soldier, settings, enabled, world).includes(bonus.id) &&
    !(soldier?.bonusSeen?.includes(bonus.id));

// Plage des niveaux de bonus existants (pour naviguer d'un niveau à l'autre).
export const MIN_BONUS_LEVEL = Math.min(...BONUS_OFFERS.map((b) => b.requiredLevel));
export const MAX_BONUS_LEVEL = Math.max(...BONUS_OFFERS.map((b) => b.requiredLevel));

// Un défi « suivi » est un objet { metric, goal, describe } ; sinon c'est une
// simple chaîne (défi pas encore branché à la logique de jeu).
const isTrackedChallenge = (challenge) => challenge != null && typeof challenge === 'object';

// --- Défis d'ÉTAT (évalués en direct) ------------------------------------
//
// Deux familles de défis coexistent :
//   - les défis d'ACTION (arbres abattus, cases conquises, combats survécus…)
//     sont de l'HISTORIQUE : le reducer incrémente `soldier.progress[metric]`
//     au moment de l'action, et le compteur ne redescend jamais.
//   - les défis d'ÉTAT (ci-dessous) ne sont PAS stockés : ils décrivent une
//     situation du plateau (« 5 arbres sur mon territoire », « aucun roi en
//     jeu ») et sont RECALCULÉS à chaque lecture, à partir du `world` passé en
//     argument. Ils s'ouvrent et se referment donc en direct, en plein tour.
//
// Ce choix vient de ce qu'un défi n'est qu'un PORTAIL À L'ACHAT : une fois le
// bonus acheté, il est écrit sur le soldat et lui reste acquis quoi qu'il
// advienne (voir `reduceBuyBonus`). Échantillonner ce portail en fin de tour
// alors qu'il se franchit en plein tour laissait acheter contre une condition
// périmée d'un tour entier.
//
// `world` est l'état de jeu (ou tout objet portant `placements` + `ownership`).
// Sans lui, ces défis sont considérés non remplis plutôt que débloqués : mieux
// vaut un bonus injustement verrouillé qu'un achat qui divergerait entre le
// client et le serveur.

// Nombre de placements d'un type donné appartenant au joueur (via `ownership`).
const countOwned = (world, playerId, type) => {
    let n = 0;
    for (const [id, p] of world.placements) {
        if (p.type === type && world.ownership.get(id) === playerId) n += 1;
    }
    return n;
};

// Un soldat portant ce bonus est-il présent sur le plateau, TOUS JOUEURS
// CONFONDUS ? Sert aux défis « qu'aucun X ne soit sur le terrain ».
const bonusOnBoard = (world, bonusId) => {
    for (const p of world.placements.values()) {
        if (p.type === 'soldier' && p.bonus === bonusId) return true;
    }
    return false;
};

// Le joueur possède-t-il au moins un squelette ?
const ownsSkeleton = (world, playerId) => {
    for (const p of world.placements.values()) {
        if (p.type === 'soldier' && p.playerId === playerId && isSkeleton(p)) return true;
    }
    return false;
};

// Défis d'état lisibles sur le SOLDAT SEUL, sans consulter le plateau : ils
// n'ont pas besoin de `world` et restent donc évaluables partout.
const SOLDIER_CHALLENGES = {
    [CHALLENGE_METRICS.HAS_AFFINITY]: (soldier) => (soldier?.affinity ? 1 : 0),

    // Défi « Moine » : le seul défi du jeu qui se PERD. Il est rempli tant que
    // les trois compteurs de violence du soldat sont à zéro — un seul meurtre,
    // un seul arbre, une seule conquête le referment pour de bon (les compteurs
    // de `progress` ne redescendent jamais).
    [CHALLENGE_METRICS.MONK_PURITY]: (soldier) => {
        const p = soldier?.progress ?? {};
        const guilty =
            (p[CHALLENGE_METRICS.ENEMIES_KILLED] ?? 0) > 0 ||
            (p[CHALLENGE_METRICS.TREES_CHOPPED] ?? 0) > 0 ||
            (p[CHALLENGE_METRICS.CASES_CONQUERED] ?? 0) > 0;
        return guilty ? 0 : 1;
    },
};

// Évaluateurs des défis d'état qui INSPECTENT LE PLATEAU : (soldier, world,
// goal) -> valeur courante. Une métrique absente des deux tables est un défi
// d'action, lu dans `progress`.
const STATE_CHALLENGES = {
    [CHALLENGE_METRICS.DRUID_TREES_KEPT]: (soldier, world) =>
        countOwned(world, soldier.playerId, 'tree'),
    [CHALLENGE_METRICS.NO_TREES_ON_TERRITORY]: (soldier, world) =>
        countOwned(world, soldier.playerId, 'tree') === 0 ? 1 : 0,
    [CHALLENGE_METRICS.HOUSES_OWNED]: (soldier, world) =>
        countOwned(world, soldier.playerId, 'house'),

    // Défi « Alchimiste » : aucun AUTRE allié du MÊME niveau que le porteur sur
    // le plateau. Le soldat qui porte le défi s'exclut lui-même par IDENTITÉ
    // (`p === soldier`, et non par case) — `bonusProgress` reçoit toujours
    // l'objet tiré tel quel de `world.placements`, donc la comparaison est
    // fiable partout où le défi est évalué (reducer comme bot). Générique sur
    // le niveau (`soldier.level`, pas une valeur figée) : réutilisable par
    // n'importe quel palier, pas seulement celui de l'Alchimiste.
    [CHALLENGE_METRICS.NO_OTHER_SAME_LEVEL_ALLY]: (soldier, world) => {
        const level = soldier.level || 1;
        for (const p of world.placements.values()) {
            if (p === soldier) continue;
            if (p.type === 'soldier' && p.playerId === soldier.playerId && (p.level || 1) === level) return 0;
        }
        return 1;
    },

    // Défi « Viking » : posséder UNE tour d'attaque ET UNE tour de défense. On
    // compte les TYPES détenus (0, 1 ou 2), pas les tours : dix tours d'attaque
    // valent toujours 1/2. Les tours portent leur propriétaire sur elles
    // (`playerId`), sans passer par `ownership` — voir `reducePlaceItem`.
    [CHALLENGE_METRICS.TOWER_KINDS_OWNED]: (soldier, world) => {
        let attack = false;
        let defense = false;
        for (const p of world.placements.values()) {
            if (p.playerId !== soldier.playerId) continue;
            if (p.type === 'attackTower') attack = true;
            else if (p.type === 'defenseTower') defense = true;
            if (attack && defense) break;
        }
        return (attack ? 1 : 0) + (defense ? 1 : 0);
    },

    [CHALLENGE_METRICS.NO_SORCERER_ON_BOARD]: (_s, world) => (bonusOnBoard(world, 'sorcerer') ? 0 : 1),
    [CHALLENGE_METRICS.NO_WARLOCK_ON_BOARD]: (_s, world) => (bonusOnBoard(world, 'warlock') ? 0 : 1),
    [CHALLENGE_METRICS.NO_KING_ON_BOARD]: (_s, world) => (bonusOnBoard(world, 'king') ? 0 : 1),
    [CHALLENGE_METRICS.NO_CONQUEROR_ON_BOARD]: (_s, world) => (bonusOnBoard(world, 'conqueror') ? 0 : 1),

    // Défi « Chevalier noir » : HYBRIDE — « tuer OU posséder un squelette ». Les
    // kills restent de l'historique (crédités par `reduceAttack` dans
    // `progress`), la possession est une lecture d'état. Le défi est l'union des
    // deux : un kill passé reste acquis même sans squelette en jeu.
    [CHALLENGE_METRICS.SKELETONS_KILLED]: (soldier, world, goal) => {
        const killed = soldier?.progress?.[CHALLENGE_METRICS.SKELETONS_KILLED] ?? 0;
        return ownsSkeleton(world, soldier.playerId) ? goal : killed;
    },
};

// Avancement d'un soldat sur le défi d'un bonus, ou `null` si le défi n'est pas
// encore suivi. Renvoie { current, goal, done } (courant plafonné à l'objectif).
// `world` (l'état de jeu) n'est requis que par les défis d'ÉTAT ; sans lui, ces
// derniers renvoient 0 (voir le commentaire de `STATE_CHALLENGES`).
export const bonusProgress = (soldier, bonus, world) => {
    const { challenge } = bonus;
    if (!isTrackedChallenge(challenge)) return null;
    const { metric, goal } = challenge;
    const fromSoldier = SOLDIER_CHALLENGES[metric];
    const fromWorld = STATE_CHALLENGES[metric];
    let raw;
    if (fromSoldier) {
        raw = fromSoldier(soldier, world, goal);
    } else if (fromWorld) {
        raw = world?.placements && world?.ownership ? fromWorld(soldier, world, goal) : 0;
    } else {
        raw = soldier?.progress?.[metric] ?? 0;
    }
    const current = Math.min(raw, goal);
    return { current, goal, done: current >= goal };
};

// Texte du défi à afficher pour ce soldat : avec l'avancement inséré (« 2/5 »)
// pour les défis suivis, sinon la chaîne brute.
export const challengeText = (soldier, bonus, settings, world) => {
    if (!isBonusChallengeEnabled(bonus.id, settings)) return 'Défi désactivé — disponible d’emblée.';
    const { challenge } = bonus;
    if (challenge == null) return 'Aucun défi — disponible aussitôt.';
    if (!isTrackedChallenge(challenge)) return challenge;
    const { current, goal } = bonusProgress(soldier, bonus, world);
    return challenge.describe(current, goal);
};

// Le défi d'un bonus est-il ACTIF ? Désactivé en configuration
// (`settings.bonusChallengeEnabled`), le bonus se débloque directement, sans
// avoir à l'accomplir. Actif par défaut.
export const isBonusChallengeEnabled = (bonusId, settings) =>
    settings?.bonusChallengeEnabled?.[bonusId] !== false;

// Un bonus est débloqué pour un soldat quand son défi (suivi) est terminé. Un
// bonus SANS défi (`challenge` nul), ou dont le défi est DÉSACTIVÉ en
// configuration, est débloqué d'emblée.
export const isBonusUnlocked = (soldier, bonus, settings, world) =>
    !isBonusChallengeEnabled(bonus.id, settings) ||
    bonus.challenge == null ||
    (bonusProgress(soldier, bonus, world)?.done ?? false);

// Comportements assignables à un soldat : il joue alors AUTOMATIQUEMENT à la
// fin du tour (voir `engine/behaviors.js`), n'est plus compté dans les actions
// restantes, et perd son comportement dès qu'il joue manuellement ou que le
// comportement ne trouve plus aucun coup (bloqué). Volontairement simplistes :
// un gain de temps pour le joueur, pas une IA qui optimise à sa place.
export const BEHAVIORS = [
    { id: 'conquest', label: 'Conquête' }, // conquiert une case voisine non possédée
    { id: 'attack', label: 'Attaque' }, // attaque dès qu'une cible est à portée
    { id: 'tree', label: 'Bûcheron' }, // abat l'arbre à portée
    { id: 'follow', label: 'Escorte' }, // se rapproche de l'allié le plus proche
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

// Statistiques d'un soldat au niveau donné, d'après le barème `SOLDIER_LEVEL_STATS`
// (voir rules.js). Les réglages de partie `soldierAtk` / `soldierHp` redéfinissent
// le NIVEAU 1 ; les niveaux suivants gardent alors les mêmes proportions que le
// barème — un niveau 4 vaut 8× l'attaque et 8× les PV d'un niveau 1, quels que
// soient les réglages.
export function purchasedSoldierStats(level, settings) {
    const lvl = clampPurchaseLevel(level);
    const ref = SOLDIER_LEVEL_STATS[lvl] ?? SOLDIER_LEVEL_STATS[1];
    const base = SOLDIER_LEVEL_STATS[1];
    const baseHp = settings?.soldierHp ?? SOLDIER_HP_DEFAULT;
    const baseAtk = settings?.soldierAtk ?? SOLDIER_ATK_DEFAULT;
    return {
        level: lvl,
        hp: Math.min(Math.round((baseHp * ref.hp) / base.hp), SOLDIER_HP_MAX),
        atk: Math.min(Math.round((baseAtk * ref.atk) / base.atk), SOLDIER_ATK_MAX),
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
export const canBuyBonus = (soldier, bonus, gold, settings, world) =>
    isBonusUnlocked(soldier, bonus, settings, world) && !soldier?.bonus && gold >= bonusPriceOf(bonus, settings);

// Entretien (or/tour) propre à un bonus (0 par défaut). Configurable par partie
// (`settings.bonusUpkeep`) ; retombe sur le barème du bonus sinon.
export const bonusUpkeep = (id, settings) =>
    settings?.bonusUpkeep?.[id] ?? BONUS_OFFERS.find((b) => b.id === id)?.upkeep ?? 0;

// Entretien (or/tour) d'un soldat ORDINAIRE de ce niveau, bonus non compris.
export const soldierLevelUpkeep = (level, settings) => {
    const lvl = level || 1;
    return settings?.upkeep?.[`soldier${lvl}`] ?? SOLDIER_UPKEEP[lvl] ?? 0;
};

// Entretien TOTAL d'un soldat portant ce bonus : celui de son niveau PLUS le
// surcoût du bonus. C'est le seul chiffre qui compte pour le joueur — le coût
// du bonus seul (« 2/tour » sur un niveau 1 qui en paie déjà 2) se lisait comme
// la facture entière alors qu'elle valait le double. Le panneau des bonus
// affiche donc ceci, et rien d'autre.
// Convention inchangée : POSITIF = coût prélevé, NÉGATIF = gain.
export const bonusTotalUpkeep = (bonus, settings) =>
    soldierLevelUpkeep(bonus?.requiredLevel, settings) + bonusUpkeep(bonus?.id, settings);

// Prix d'achat d'un bonus, configurable par partie (`settings.bonusPrice`) ;
// retombe sur le prix du bonus (0 = gratuit) sinon.
export const bonusPriceOf = (bonus, settings) =>
    settings?.bonusPrice?.[bonus.id] ?? bonus.price ?? 0;

// Entretien (or/tour) d'une unité possédée, source de vérité unique du barème.
// Tous les postes sont configurables via `settings` (retombent sur les barèmes
// par défaut sinon) :
//   - squelette invoqué : `upkeep.skeleton` (celui du Démoniste : `upkeep.skeleton2`) ;
//   - soldat : `upkeep.soldier{niveau}` + entretien de son bonus éventuel ;
//   - tour : `upkeep.tower` ; maison : rendement `houseIncome` (négatif = gain) ;
//   - autres bâtiments / arbre : barème `BUILDING_UPKEEP`.
// Valeur POSITIVE = coût prélevé sur le revenu ; NÉGATIVE = gain. Défaut 0.
export const upkeepFor = (unit, settings) => {
    if (!unit) return 0;
    if (unit.type === 'soldier') {
        // Unité invoquée / envoûtée : barème propre à son espèce (`units.js`).
        // Seul le squelette en a un, surchargeable par partie.
        if (isSummonedUnit(unit)) {
            // Le squelette ordinaire est réglable par partie ; celui du Démoniste
            // (`skeleton2`, plus robuste) a son propre barème, d'où la lecture par
            // ESPÈCE exacte plutôt que par marqueur.
            if (isSkeleton(unit)) {
                const kindId = unitKind(unit)?.id ?? 'skeleton';
                return settings?.upkeep?.[kindId] ?? unitUpkeep(unit);
            }
            return unitUpkeep(unit);
        }
        return (
            soldierLevelUpkeep(unit.level, settings) +
            (unit.bonus ? bonusUpkeep(unit.bonus, settings) : 0)
        );
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

// « Race » affichée d'une unité, par ordre de priorité :
//   - unité invoquée / envoûtée : le nom de son ESPÈCE (« Dragon », « Corbeau »,
//     « Squelette »…). Son niveau ne veut rien dire pour elle — un dragon n'est
//     pas un « Ignorant » — et elle ne portera jamais de bonus ;
//   - soldat avec bonus : le nom du bonus (« Bûcheron », « Roi »…) ;
//   - soldat ordinaire : son titre de niveau (« Ignorant », « Initié »…).
// Source de vérité unique de ce libellé, partagée par le panneau du soldat et
// les notifications.
export const raceLabel = (unit) =>
    unitLabel(unit) ?? (unit?.bonus ? bonusLabel(unit.bonus) : levelRankLabel(unit?.level));
