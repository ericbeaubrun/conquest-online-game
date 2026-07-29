// Constantes de règles du jeu (indépendantes de l'affichage et du transport).
// Centralisées ici pour que le reducer, les sélecteurs et — plus tard — le
// serveur du mode « online » partagent exactement les mêmes valeurs.

import {isSkeleton} from '../data/units.js';

export const MAX_MOVE = 2; // pas de déplacement maximum d'un soldat par tour
export const MERGE_MAX = 5; // niveau maximum d'un soldat fusionné
export const BASE_INCOME = 10; // or gagné par tour avant le bonus de territoire
export const STARTING_GOLD = 75; // or de départ de chaque joueur
export const HOUSE_INCOME = 5; // or/tour rapporté par chaque maison possédée

// Entretien (or/tour) prélevé sur le revenu pour chaque unité possédée. Un coût
// POSITIF réduit le revenu ; une valeur NÉGATIVE le renforce (les maisons
// rapportent). Barème centralisé, partagé par le calcul de revenu et l'affichage
// des panneaux. Le coût d'un soldat s'ajoute à celui de son bonus éventuel
// (voir `upkeepFor` / `bonusUpkeep` dans soldier.js).
export const SOLDIER_UPKEEP = {1: 2, 2: 4, 3: 8, 4: 16, 5: 32}; // par niveau de soldat
export const SKELETON_UPKEEP = 1; // squelette invoqué (Mort-vivant)
export const WARLOCK_SKELETON_UPKEEP = 8; // squelette du Démoniste (espèce `skeleton2`)
// Une tour est plus FAIBLE qu'un soldat du même prix (4/4 ou 8/1 contre 4/8
// pour un lvl 3) et ne se déplace pas : son entretien doit donc rester bien
// en-dessous du sien, sans quoi elle n'est jamais le bon achat.
export const TOWER_UPKEEP = 4; // tour d'attaque ou de défense
// Bâtiments : la maison rapporte (entretien négatif) ; base et arbres = 0.
export const BUILDING_UPKEEP = {
    base: 0,
    house: -HOUSE_INCOME,
    attackTower: TOWER_UPKEEP,
    defenseTower: TOWER_UPKEEP,
    tree: 0,
    chest: 0,
    loot: 0,
};

// Arbres (forêts) : objets neutres qui apparaissent au fil de la partie. Un
// soldat adjacent peut abattre un arbre (gain immédiat). Ils restent rares
// (plafond en proportion de la carte) et se densifient avec l'avancée de la
// partie. Un arbre n'a aucun entretien (voir BUILDING_UPKEEP).
export const TREE_REWARD = 10; // or gagné en abattant un arbre
export const TREE_MAX_RATIO = 0.1; // au plus 10% des cases couvertes d'arbres
export const TREE_TURN_RAMP = 20; // montée en intensité jusqu'à ce tour
export const TREE_SPAWN_CHANCE = 0.5; // proba de base par tentative (mise à l'échelle)

// Statistiques de soldat : valeur de départ (niveau 1) et plafond atteignable.
// 16 est la plus haute valeur du barème, atteinte à la fois en attaque (soldat
// lvl 5, dragon, Conquérant) et en PV (Prêtre, Alchimiste, Chevalier noir,
// Conquérant) : PV et attaque partagent donc le même plafond, qu'aucun gain —
// fusion, coffre, soin — ne peut jamais franchir.
export const SOLDIER_HP_DEFAULT = 2;
export const SOLDIER_HP_MAX = 16;
export const SOLDIER_ATK_DEFAULT = 1;
export const SOLDIER_ATK_MAX = 16;

// Barème d'un soldat ORDINAIRE par niveau (attaque / points de vie). Source de
// vérité unique : achat en boutique, fusion et affichage y puisent tous.
//
// L'attaque double à chaque niveau ; les PV doublent aussi, SAUF au niveau 5 qui
// plafonne à ceux du niveau 4 — le dernier palier échange sa robustesse contre
// sa force de frappe. C'est pourquoi ce barème est une TABLE explicite et non
// une formule : la progression n'est pas régulière.
//
// Les réglages de partie `soldierAtk` / `soldierHp` redéfinissent le niveau 1 ;
// les niveaux suivants suivent alors les mêmes proportions (voir
// `purchasedSoldierStats`).
export const SOLDIER_LEVEL_STATS = {
    1: {atk: 1, hp: 2},
    2: {atk: 2, hp: 4},
    3: {atk: 4, hp: 8},
    4: {atk: 8, hp: 16},
    5: {atk: 16, hp: 16},
};

// Les trois affinités ÉLÉMENTAIRES. Défini ici (et non importé de soldier.js)
// pour éviter une dépendance circulaire : soldier.js importe déjà rules.js.
// C'est la liste de tout ce qui se gagne au hasard ou à l'achat : boutique,
// arbres élémentaires, butin de coffre, don du « Magicien ».
export const AFFINITY_IDS = ['fire', 'ice', 'lightning'];

// Le BOUCLIER est une affinité à part : en plus d'être achetable en boutique
// et trouvable en coffre, il est conféré au soldat qui équipe le bonus
// « Paladin » (voir `reduceBuyBonus`). Il reste hors d'`AFFINITY_IDS` — la
// liste des éléments qui s'annulent entre eux ou sortent des tirages
// aléatoires (arbres) — car ses règles de combat et de fusion sont propres
// (voir `mergeAffinity` / `canFight`) ; il est ajouté à part aux items de
// boutique achetables (`AFFINITY_ITEMS` dans `data/items.js`).
//
// Là où les éléments s'annulent entre eux, le bouclier protège son porteur des
// combats qui n'en valent pas la peine : il ne peut ni attaquer ni être attaqué
// par un autre bouclier, ni par une unité SANS affinité. Il ne se bat donc que
// contre le feu, la glace et la foudre (voir `canFight`).
export const SHIELD_AFFINITY = 'shield';

// Affinité du soldat issu d'une fusion :
//   - sans affinité + affinité X            => X
//   - affinité X + affinité X               => X
//   - affinité X + affinité Y (différentes) => la TROISIÈME affinité (ni X ni Y)
//   - bouclier + bouclier                   => bouclier
//   - bouclier + sans affinité              => bouclier
//   - bouclier + élément X                  => X (l'élément l'emporte)
// Fonction PURE, réutilisée par l'application comme par l'aperçu d'interface.
export function mergeAffinity(a, b) {
    if (!a) return b ?? null;
    if (!b) return a;
    if (a === b) return a;
    // Le bouclier n'est pas un élément et ne se combine pas : face à un VRAI
    // élément, il s'efface et l'élément l'emporte. (Bouclier + bouclier et
    // bouclier + rien sont déjà réglés au-dessus et donnent bien le bouclier.)
    if (a === SHIELD_AFFINITY) return b;
    if (b === SHIELD_AFFINITY) return a;
    return AFFINITY_IDS.find((id) => id !== a && id !== b) ?? null;
}

// Fusion de soldats : on ne fusionne QUE deux soldats de même niveau (lvl 1
// avec lvl 1, lvl 2 avec lvl 2...), en-dessous du niveau maximum, et portant le
// MÊME bonus — soit aucun des deux (fusion classique), soit le même bonus des
// deux côtés (ex. deux bûcherons lvl 1 fusionnent en un bûcheron lvl 2). Deux
// bonus différents (ou l'un avec / l'autre sans) restent infusionnables. Les
// affinités, elles, n'empêchent jamais la fusion (voir `mergeAffinity`). Le
// résultat monte d'un niveau, conserve le bonus commun et ADDITIONNE les points
// de vie et d'attaque (plafonnés). Fonctions PURES partagées par le reducer
// (application), les sélecteurs (cases de fusion valides) et l'aperçu — mêmes
// règles.
export function canMerge(from, to) {
    if (!from || !to || from.type !== 'soldier' || to.type !== 'soldier') return false;
    // Les unités invoquées (squelette, arbre-druide) ne fusionnent jamais, ni
    // comme source ni comme cible : elles portent toutes un marqueur `unit`.
    if (from.unit || to.unit) return false;
    // Les deux soldats doivent porter le même bonus (ou aucun) : un bûcheron ne
    // fusionne qu'avec un bûcheron, un soldat nu qu'avec un soldat nu.
    if ((from.bonus || null) !== (to.bonus || null)) return false;
    const lvl = from.level || 1;
    return (to.level || 1) === lvl && lvl < MERGE_MAX;
}

// Avancement des défis : chaque métrique conserve la valeur la PLUS AVANCÉE
// des deux soldats, quel que soit le sens de la fusion (`fromId`/`toId` dans
// `reduceMerge`) — un soldat qui a ouvert un coffre ne doit pas perdre ce
// crédit parce qu'il a fusionné DANS un soldat qui ne l'a pas ouvert.
function mergedProgress(from, to) {
    const a = from?.progress ?? {};
    const b = to?.progress ?? {};
    const merged = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        merged[key] = Math.max(a[key] ?? 0, b[key] ?? 0);
    }
    return merged;
}

export function mergedSoldier(from, to) {
    const level = Math.min((to.level || 1) + 1, MERGE_MAX);
    // Les statistiques s'additionnent, puis sont ramenées au barème du niveau
    // atteint : c'est lui qui fait foi. Sans ce plafond, deux soldats lvl 4
    // (8/16 chacun) donneraient un lvl 5 à 32 PV alors que le barème en prévoit
    // 16, et les bonus ramassés en coffre feraient dériver la table.
    const ceiling = SOLDIER_LEVEL_STATS[level] ?? SOLDIER_LEVEL_STATS[MERGE_MAX];
    return {
        ...to,
        level,
        hp: Math.min((to.hp || 0) + (from.hp || 0), ceiling.hp, SOLDIER_HP_MAX),
        atk: Math.min((to.atk || 0) + (from.atk || 0), ceiling.atk, SOLDIER_ATK_MAX),
        affinity: mergeAffinity(from.affinity, to.affinity),
        progress: mergedProgress(from, to),
    };
}

// Une unité est-elle une tour (d'attaque ou de défense) ? Sert au bonus
// « Viking », immunisé aux dégâts infligés par les tours.
export function isTower(unit) {
    return unit?.type === 'attackTower' || unit?.type === 'defenseTower';
}

// Combat entre deux soldats : chaque unité retire à l'autre des points de vie
// égaux à sa propre attaque (dégâts SIMULTANÉS). Une unité dont les PV tombent
// à 0 meurt (`dead`). Bonus « Viking » : un soldat-viking ne subit AUCUN dégât
// d'une tour (dans les deux sens : qu'il l'attaque ou qu'une tour le frappe).
// Bonus « Chevalier noir » : même principe face aux SQUELETTES — il ne prend
// aucun dégât d'un squelette, qu'il l'attaque ou qu'il en soit attaqué.
// Fonction PURE partagée par le reducer (application) et l'aperçu d'interface —
// mêmes règles partout.
export function combatResult(attacker, defender) {
    const atkImmune =
        (attacker?.bonus === 'viking' && isTower(defender)) ||
        (attacker?.bonus === 'blackKnight' && isSkeleton(defender));
    const defImmune =
        (defender?.bonus === 'viking' && isTower(attacker)) ||
        (defender?.bonus === 'blackKnight' && isSkeleton(attacker));
    const atkHp = atkImmune ? (attacker.hp || 0) : Math.max(0, (attacker.hp || 0) - (defender.atk || 0));
    const defHp = defImmune ? (defender.hp || 0) : Math.max(0, (defender.hp || 0) - (attacker.atk || 0));
    return {
        attacker: {...attacker, hp: atkHp, dead: atkHp <= 0},
        defender: {...defender, hp: defHp, dead: defHp <= 0},
    };
}

// Statistiques des bâtiments (et de la base). `hp`/`atk` sont les valeurs de
// départ (les bâtiments naissent au maximum) et `hpMax`/`atkMax` les plafonds,
// utilisés pour dimensionner les barres. La base n'est pas un item posé (absente
// de `placements`) mais partage ce barème. Les tours possèdent une attaque :
// elles ripostent quand un soldat les attaque (mêmes règles que le combat).
export const BUILDING_STATS = {
    base: {hp: 64, hpMax: 64},
    house: {hp: 2, hpMax: 2},
    attackTower: {hp: 2, hpMax: 2, atk: 10, atkMax: 10},
    defenseTower: {hp: 10, hpMax: 10, atk: 2, atkMax: 2},
};

// Plafonds de PV / d'attaque d'une unité quelconque (soldat ou bâtiment),
// pour dimensionner les jauges de façon homogène.
export function maxHp(unit) {
    if (!unit) return 0;
    return unit.type === 'soldier' ? SOLDIER_HP_MAX : BUILDING_STATS[unit.type]?.hpMax ?? unit.hp ?? 0;
}

export function maxAtk(unit) {
    if (!unit) return 0;
    return unit.type === 'soldier' ? SOLDIER_ATK_MAX : BUILDING_STATS[unit.type]?.atkMax ?? unit.atk ?? 0;
}

// Une unité est attaquable si c'est un soldat ou une structure dotée de PV
// (maison, tour, base). Un soldat peut donc assiéger n'importe quel bâtiment
// ennemi adjacent, exactement comme il attaque un autre soldat. Seules les
// unités POSSÉDANT une attaque (soldats, tours) ripostent ; les maisons et la
// base encaissent sans rendre les coups. Les arbres (`tree`, absents de
// BUILDING_STATS) restent hors combat : ils s'abattent (`chop`).
export function isAttackable(unit) {
    return !!unit && (unit.type === 'soldier' || unit.type in BUILDING_STATS);
}

// Deux unités de MÊME affinité (feu, glace, foudre) refusent le combat : leurs
// éléments s'annulent. Le BOUCLIER refuse en plus le combat contre une unité
// SANS affinité : un paladin ne s'abaisse pas à croiser le fer avec un soldat
// ordinaire, et un soldat ordinaire ne peut rien contre lui. Il ne reste donc
// au bouclier que les trois éléments comme adversaires.
//
// Ne concerne en pratique que les soldats — les structures (maison, tour, base)
// ne portent jamais d'affinité. Elles restent assiégeables par tous, bouclier
// compris : la règle ci-dessous ne parle que d'unités qui SE battent, et une
// structure sans affinité qu'on assiège n'est pas un duel.
//
// Par défaut le combat est AUTORISÉ. Fonction PURE partagée par
// `computeReachable` (cibles proposées) et le reducer (validation de l'attaque).
export function canFight(attacker, defender) {
    const a = attacker?.affinity ?? null;
    const b = defender?.affinity ?? null;
    // Affinités identiques (deux boucliers compris) : elles s'annulent.
    if (a && a === b) return false;
    // Bouclier contre unité sans affinité, dans un sens comme dans l'autre.
    // Réservé aux SOLDATS : une structure sans affinité reste assiégeable.
    if (a === SHIELD_AFFINITY && !b && defender?.type === 'soldier') return false;
    if (b === SHIELD_AFFINITY && !a && attacker?.type === 'soldier') return false;
    return true;
}
