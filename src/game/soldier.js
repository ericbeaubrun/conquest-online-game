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

// Libellé affiché pour une valeur donnée (`null`/inconnu -> « Aucun(e) »).
export const affinityLabel = (id) => AFFINITIES.find((a) => a.id === id)?.label ?? 'Aucune';
export const bonusLabel = (id) => BONUSES.find((b) => b.id === id)?.label ?? 'Aucun';
export const behaviorLabel = (id) => BEHAVIORS.find((b) => b.id === id)?.label ?? 'Aucun';
