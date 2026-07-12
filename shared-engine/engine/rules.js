// Constantes de règles du jeu (indépendantes de l'affichage et du transport).
// Centralisées ici pour que le reducer, les sélecteurs et — plus tard — le
// serveur du mode « online » partagent exactement les mêmes valeurs.

export const MAX_MOVE = 2; // pas de déplacement maximum d'un soldat par tour
export const MERGE_MAX = 5; // niveau maximum d'un soldat fusionné
export const BASE_INCOME = 10; // or gagné par tour avant le bonus de territoire
export const STARTING_GOLD = 0; // or de départ de chaque joueur
export const HOUSE_INCOME = 10; // or/tour rapporté par chaque maison possédée

// Entretien (or/tour) prélevé sur le revenu pour chaque unité possédée. Un coût
// POSITIF réduit le revenu ; une valeur NÉGATIVE le renforce (les maisons
// rapportent). Barème centralisé, partagé par le calcul de revenu et l'affichage
// des panneaux. Le coût d'un soldat s'ajoute à celui de son bonus éventuel
// (voir `upkeepFor` / `bonusUpkeep` dans soldier.js).
export const SOLDIER_UPKEEP = {1: 2, 2: 4, 3: 8, 4: 16}; // par niveau de soldat
export const SKELETON_UPKEEP = 1; // squelette invoqué (Mort-vivant / Démoniste)
export const TOWER_UPKEEP = 10; // tour d'attaque ou de défense
// Bâtiments : la maison rapporte (entretien négatif) ; base et arbres = 0.
export const BUILDING_UPKEEP = {
    base: 0,
    house: -HOUSE_INCOME,
    attackTower: TOWER_UPKEEP,
    defenseTower: TOWER_UPKEEP,
    tree: 0,
};

// Arbres (forêts) : objets neutres qui apparaissent au fil de la partie. Un
// soldat adjacent peut abattre un arbre (gain immédiat). Ils restent rares
// (plafond en proportion de la carte) et se densifient avec l'avancée de la
// partie. Un arbre n'a aucun entretien (voir BUILDING_UPKEEP).
export const TREE_REWARD = 10; // or gagné en abattant un arbre
export const TREE_MAX_RATIO = 0.1; // au plus 10% des cases couvertes d'arbres
export const TREE_TURN_RAMP = 20; // montée en intensité jusqu'à ce tour
export const TREE_SPAWN_CHANCE = 0.5; // proba de base par tentative (mise à l'échelle)

// Statistiques de soldat : valeur de départ et plafond atteignable.
export const SOLDIER_HP_DEFAULT = 20;
export const SOLDIER_HP_MAX = 100;
export const SOLDIER_ATK_DEFAULT = 10;
export const SOLDIER_ATK_MAX = 100;

// Les trois affinités possibles. Défini ici (et non importé de soldier.js) pour
// éviter une dépendance circulaire : soldier.js importe déjà rules.js.
export const AFFINITY_IDS = ['fire', 'ice', 'lightning'];

// Affinité du soldat issu d'une fusion :
//   - sans affinité + affinité X            => X
//   - affinité X + affinité X               => X
//   - affinité X + affinité Y (différentes) => la TROISIÈME affinité (ni X ni Y)
// Fonction PURE, réutilisée par l'application comme par l'aperçu d'interface.
export function mergeAffinity(a, b) {
    if (!a) return b ?? null;
    if (!b) return a;
    if (a === b) return a;
    return AFFINITY_IDS.find((id) => id !== a && id !== b) ?? null;
}

// Fusion de soldats : on ne fusionne QUE deux soldats de même niveau (lvl 1
// avec lvl 1, lvl 2 avec lvl 2...), en-dessous du niveau maximum, et AUCUN des
// deux ne doit porter de bonus (un soldat à bonus n'est jamais fusionnable). Les
// affinités, elles, n'empêchent jamais la fusion (voir `mergeAffinity`). Le
// résultat monte d'un niveau et ADDITIONNE les points de vie et d'attaque
// (plafonnés). Fonctions PURES partagées par le reducer (application), les
// sélecteurs (cases de fusion valides) et l'aperçu d'interface — mêmes règles.
export function canMerge(from, to) {
    if (!from || !to || from.type !== 'soldier' || to.type !== 'soldier') return false;
    // Les squelettes invoqués ne fusionnent jamais (ni comme source ni cible).
    if (from.unit === 'skeleton' || to.unit === 'skeleton') return false;
    // Un soldat porteur d'un bonus n'est pas fusionnable (source comme cible).
    if (from.bonus || to.bonus) return false;
    const lvl = from.level || 1;
    return (to.level || 1) === lvl && lvl < MERGE_MAX;
}

export function mergedSoldier(from, to) {
    return {
        ...to,
        level: (to.level || 1) + 1,
        hp: Math.min((to.hp || 0) + (from.hp || 0), SOLDIER_HP_MAX),
        atk: Math.min((to.atk || 0) + (from.atk || 0), SOLDIER_ATK_MAX),
        affinity: mergeAffinity(from.affinity, to.affinity),
    };
}

// Combat entre deux soldats : chaque unité retire à l'autre des points de vie
// égaux à sa propre attaque (dégâts SIMULTANÉS). Une unité dont les PV tombent
// à 0 meurt (`dead`). Fonction PURE partagée par le reducer (application) et
// l'aperçu d'interface — mêmes règles partout.
export function combatResult(attacker, defender) {
    const atkHp = Math.max(0, (attacker.hp || 0) - (defender.atk || 0));
    const defHp = Math.max(0, (defender.hp || 0) - (attacker.atk || 0));
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
    base: {hp: 1000, hpMax: 1000},
    house: {hp: 20, hpMax: 20},
    attackTower: {hp: 50, hpMax: 50, atk: 10, atkMax: 100},
    defenseTower: {hp: 200, hpMax: 200, atk: 1, atkMax: 1},
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
