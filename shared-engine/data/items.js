// Items achetables dans la boutique et posables sur une case conquise.

import { AFFINITY_IDS } from '../engine/rules.js';

// Les prix sont calés sur le REVENU, pas sur une échelle arbitraire : un joueur
// démarre à 15 or/tour + 1 or par case possédée (4 au départ), soit 19 or au
// premier tour. Un soldat de base vaut donc ~1,5 tour de revenu, une maison ~3
// tours et s'amortit en 6. Sans ce calage, l'or ne limite plus rien et les
// seules contraintes du jeu redeviennent la place sur le plateau et l'entretien.
export const ITEMS = [
    { id: 'house', name: 'Maison', src: '/house.png', cost: 60 },
    { id: 'attackTower', name: "Tour d'attaque", src: '/attackTower.png', cost: 60 },
    { id: 'defenseTower', name: 'Tour de défense', src: '/defenseTower.png', cost: 60 },
    { id: 'soldier', name: 'Soldat', src: '/characters/lvl1/SoldierLVL1.png', cost: 25 },
];

// Affinités achetables en boutique. Contrairement aux ITEMS, elles ne se posent
// PAS sur une case libre : elles s'appliquent à un SOLDAT du joueur actif encore
// sans affinité, à qui elles donnent l'élément correspondant (voir
// `canReceiveAffinity` et `reducePlaceAffinity`). Leur id est celui de
// l'affinité elle-même, ce qui fait de leur achat un `PLACE_ITEM` ordinaire.
export const AFFINITY_ITEMS = [
    // Une affinité rend son porteur INCAPABLE de se battre contre la même
    // affinité : c'est une immunité partielle, pas un ornement. D'où un prix
    // supérieur à celui d'un soldat neuf.
    { id: 'fire', name: 'Feu', src: '/fire.png', cost: 40 },
    { id: 'ice', name: 'Glace', src: '/ice.png', cost: 40 },
    { id: 'lightning', name: 'Foudre', src: '/thunder.png', cost: 40 },
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
