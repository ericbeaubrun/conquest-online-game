// Items achetables dans la boutique et posables sur une case conquise.

export const ITEMS = [
    { id: 'soldier', name: 'Soldat', src: '/soldier.png' },
    { id: 'house', name: 'Maison', src: '/house.png' },
    { id: 'attackTower', name: "Tour d'attaque", src: '/attackTower.png' },
    { id: 'defenseTower', name: 'Tour de défense', src: '/defenseTower.png' },
];

// Accès rapide type -> image, pour le rendu des items posés.
export const ITEM_SRC = Object.fromEntries(ITEMS.map((i) => [i.id, i.src]));
