// Vocabulaire des caractéristiques de soldat (affinité, bonus, comportement).
// Anticipe des fonctionnalités à venir : pour l'instant un soldat naît sans
// aucune de ces caractéristiques (valeur `null`). Chaque liste sert à la fois
// d'affichage (libellés) et de source de vérité pour de futures règles.

export const AFFINITIES = [
    { id: 'fire', label: 'Feu' },
    { id: 'ice', label: 'Glace' },
    { id: 'lightning', label: 'Foudre' },
];

export const BONUSES = [
    { id: 'greedy', label: 'Cupide' },
    { id: 'fast', label: 'Rapide' },
    { id: 'assailant', label: 'Assaillant' },
    { id: 'protector', label: 'Protecteur' },
    { id: 'healer', label: 'Soigneur' },
    { id: 'lumberjack', label: 'Bûcheron' },
];

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
    1: '/SoldierLVL1.png',
    2: '/SoldierLVL2.png',
    3: '/SoldierLVL3.png',
};
export const soldierSkin = (level) => SOLDIER_SKINS[level] || SOLDIER_SKINS[1];

// Libellé affiché pour une valeur donnée (`null`/inconnu -> « Aucun(e) »).
export const affinityLabel = (id) => AFFINITIES.find((a) => a.id === id)?.label ?? 'Aucune';
export const bonusLabel = (id) => BONUSES.find((b) => b.id === id)?.label ?? 'Aucun';
export const behaviorLabel = (id) => BEHAVIORS.find((b) => b.id === id)?.label ?? 'Aucun';
