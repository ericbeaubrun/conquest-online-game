// Items achetables dans la boutique et posables sur une case conquise.

import { AFFINITY_IDS } from '../engine/rules.js';

export const ITEMS = [
    { id: 'house', name: 'Maison', src: '/house.png', cost: 2 },
    { id: 'attackTower', name: "Tour d'attaque", src: '/attackTower.png', cost: 3 },
    { id: 'defenseTower', name: 'Tour de défense', src: '/defenseTower.png', cost: 3 },
    { id: 'soldier', name: 'Soldat', src: '/characters/lvl1/SoldierLVL1.png', cost: 1 },
];

// Affinités achetables en boutique. Contrairement aux ITEMS, elles ne se posent
// PAS sur une case libre : elles s'appliquent à un SOLDAT du joueur actif encore
// sans affinité, à qui elles donnent l'élément correspondant (voir
// `canReceiveAffinity` et `reducePlaceAffinity`). Leur id est celui de
// l'affinité elle-même, ce qui fait de leur achat un `PLACE_ITEM` ordinaire.
export const AFFINITY_ITEMS = [
    { id: 'fire', name: 'Feu', src: '/fire.png', cost: 5 },
    { id: 'ice', name: 'Glace', src: '/ice.png', cost: 5 },
    { id: 'lightning', name: 'Foudre', src: '/thunder.png', cost: 5 },
];

// Cet item de boutique est-il une affinité (et non un item posable sur une case) ?
export const isAffinityItem = (itemType) => AFFINITY_IDS.includes(itemType);

// Accès rapide type -> image, pour le rendu des items POSÉS sur une case. Les
// affinités n'en font pas partie : elles décorent un soldat (voir AFFINITY_SRC).
export const ITEM_SRC = Object.fromEntries(ITEMS.map((i) => [i.id, i.src]));

// Accès rapide type -> coût en or, pour la boutique et le reducer. Couvre les
// items posables ET les affinités : les deux s'achètent via `PLACE_ITEM`.
export const ITEM_COST = Object.fromEntries(
    [...ITEMS, ...AFFINITY_ITEMS].map((i) => [i.id, i.cost])
);
