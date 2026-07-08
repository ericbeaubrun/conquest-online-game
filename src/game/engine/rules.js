// Constantes de règles du jeu (indépendantes de l'affichage et du transport).
// Centralisées ici pour que le reducer, les sélecteurs et — plus tard — le
// serveur du mode « online » partagent exactement les mêmes valeurs.

export const MAX_MOVE = 2; // pas de déplacement maximum d'un soldat par tour
export const MERGE_MAX = 3; // niveau maximum d'un soldat fusionné
export const BASE_INCOME = 10; // or gagné par tour avant le bonus de territoire
export const STARTING_GOLD = 0; // or de départ de chaque joueur

// Statistiques de soldat : valeur de départ et plafond atteignable.
export const SOLDIER_HP_DEFAULT = 20;
export const SOLDIER_HP_MAX = 100;
export const SOLDIER_ATK_DEFAULT = 10;
export const SOLDIER_ATK_MAX = 100;

// Fusion de soldats : on ne fusionne QUE deux soldats de même niveau (lvl 1
// avec lvl 1, lvl 2 avec lvl 2...), en-dessous du niveau maximum. Le résultat
// monte d'un niveau et ADDITIONNE les points de vie et d'attaque (plafonnés).
// Fonctions PURES partagées par le reducer (application), les sélecteurs
// (cases de fusion valides) et l'aperçu d'interface — mêmes règles partout.
export function canMerge(from, to) {
    if (!from || !to || from.type !== 'soldier' || to.type !== 'soldier') return false;
    const lvl = from.level || 1;
    return (to.level || 1) === lvl && lvl < MERGE_MAX;
}

export function mergedSoldier(from, to) {
    return {
        ...to,
        level: (to.level || 1) + 1,
        hp: Math.min((to.hp || 0) + (from.hp || 0), SOLDIER_HP_MAX),
        atk: Math.min((to.atk || 0) + (from.atk || 0), SOLDIER_ATK_MAX),
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
        attacker: { ...attacker, hp: atkHp, dead: atkHp <= 0 },
        defender: { ...defender, hp: defHp, dead: defHp <= 0 },
    };
}

// Statistiques des bâtiments (et de la base). `hp`/`atk` sont les valeurs de
// départ (les bâtiments naissent au maximum) et `hpMax`/`atkMax` les plafonds,
// utilisés pour dimensionner les barres. La base n'est pas un item posé (absente
// de `placements`) mais partage ce barème. Les tours possèdent une attaque :
// elles ripostent quand un soldat les attaque (mêmes règles que le combat).
export const BUILDING_STATS = {
    base: { hp: 1000, hpMax: 1000 },
    house: { hp: 20, hpMax: 20 },
    attackTower: { hp: 50, hpMax: 50, atk: 10, atkMax: 100 },
    defenseTower: { hp: 200, hpMax: 200, atk: 1, atkMax: 1 },
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

// Une unité est attaquable si elle possède des PV et n'appartient pas à
// l'attaquant. Les tours (dotées d'une attaque) ripostent ; la base et les
// maisons ne sont pas des cibles de combat (elles bloquent seulement).
export function isAttackable(unit) {
    return !!unit && (unit.type === 'soldier' || unit.atk != null);
}
