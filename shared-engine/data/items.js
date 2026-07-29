// Items achetables dans la boutique et posables sur une case conquise.

import { AFFINITY_IDS, SHIELD_AFFINITY } from '../engine/rules.js';

// Les prix sont calés sur le REVENU, pas sur une échelle arbitraire : un joueur
// démarre avec 75 or en poche, puis touche 10 or/tour + 1 or par case possédée
// (4 au départ), soit 14 or au premier tour. Un soldat de base vaut donc ~2 tours
// de revenu, une maison ~4 tours et s'amortit en 12. Sans ce calage, l'or ne
// limite plus rien et les seules contraintes du jeu redeviennent la place sur le
// plateau et l'entretien.
export const ITEMS = [
    { id: 'house', name: 'Maison', src: '/house.png', cost: 50 },
    { id: 'attackTower', name: "Tour d'attaque", src: '/attackTower.png', cost: 25 },
    { id: 'defenseTower', name: 'Tour de défense', src: '/defenseTower.png', cost: 25 },
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
    { id: 'fire', name: 'Feu', src: '/fire.png', cost: 75 },
    { id: 'ice', name: 'Glace', src: '/ice.png', cost: 75 },
    { id: 'lightning', name: 'Foudre', src: '/thunder.png', cost: 75 },
    // Le bouclier refuse en plus le combat contre une unité SANS affinité (voir
    // `canFight`) — une protection plus large que les trois éléments, d'où un
    // coût triple du leur.
    { id: SHIELD_AFFINITY, name: 'Bouclier', src: '/bouclier.png', cost: 300 },
];

// Cet item de boutique est-il une affinité (et non un item posable sur une case) ?
export const isAffinityItem = (itemType) =>
    AFFINITY_IDS.includes(itemType) || itemType === SHIELD_AFFINITY;

// Potion de sacrifice : comme une affinité, elle ne se pose pas sur une case
// libre mais s'applique à un SOLDAT ALLIÉ déjà posé — ordinaire, avec bonus,
// ou unité invoquée/envoûtée (voir `canReceiveSacrifice`). Les STRUCTURES en
// sont exclues : leur ratio attaque+PV / prix en ferait une fabrique à or (voir
// le commentaire de `canReceiveSacrifice`). Elle transforme sa cible en un TAS
// D'OR au sol (un butin comme celui d'un coffre, voir `data/chests.js`), que
// n'importe quel soldat ramasse ensuite en s'y déplaçant — la cible ne rejoint
// pas directement le porte-monnaie de l'acheteur. Sa valeur : `atk + hp` de la
// cible, chaque point valant `SACRIFICE_GOLD_PER_POINT` or (voir le reducer).
export const SACRIFICE_POTION_ITEM = {
    id: 'sacrifice',
    name: 'Potion de sacrifice',
    src: '/potionSacrifice.png',
    cost: 5,
};

// Or accordé PAR POINT (d'attaque OU de PV, au même tarif) de la cible transformée.
export const SACRIFICE_GOLD_PER_POINT = 5;

// Cet item de boutique est-il la potion de sacrifice ?
export const isSacrificeItem = (itemType) => itemType === SACRIFICE_POTION_ITEM.id;

// Cet item de boutique cible-t-il un ÉLÉMENT déjà posé (et non une case vide) ?
// Regroupe les affinités et la potion de sacrifice, les deux seuls items dont
// la cible est une unité ou une structure déjà en jeu.
export const isPlacementTargetedItem = (itemType) =>
    isAffinityItem(itemType) || isSacrificeItem(itemType);

// Accès rapide type -> image, pour le rendu des items POSÉS sur une case. Les
// affinités n'en font pas partie : elles décorent un soldat (voir AFFINITY_SRC).
export const ITEM_SRC = Object.fromEntries(ITEMS.map((i) => [i.id, i.src]));

// Accès rapide type -> coût en or, pour la boutique et le reducer. Couvre les
// items posables, les affinités ET la potion de sacrifice : tous s'achètent
// via `PLACE_ITEM`.
export const ITEM_COST = Object.fromEntries(
    [...ITEMS, ...AFFINITY_ITEMS, SACRIFICE_POTION_ITEM].map((i) => [i.id, i.cost])
);
