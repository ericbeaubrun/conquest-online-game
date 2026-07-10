// Items achetables dans la boutique et posables sur une case conquise.

export const ITEMS = [
    { id: 'soldier', name: 'Soldat', src: '/characters/SoldierLVL1.png', cost: 1 },
    { id: 'house', name: 'Maison', src: '/house.png', cost: 2 },
    { id: 'attackTower', name: "Tour d'attaque", src: '/attackTower.png', cost: 3 },
    { id: 'defenseTower', name: 'Tour de défense', src: '/defenseTower.png', cost: 3 },
];

// Accès rapide type -> image, pour le rendu des items posés.
export const ITEM_SRC = Object.fromEntries(ITEMS.map((i) => [i.id, i.src]));

// Accès rapide type -> coût en or, pour la boutique et le reducer.
export const ITEM_COST = Object.fromEntries(ITEMS.map((i) => [i.id, i.cost]));
