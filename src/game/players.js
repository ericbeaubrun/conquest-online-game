// Joueurs disponibles. Une carte utilise les N premiers selon son nombre de
// spawns (entre 2 et 4). Les couleurs sont choisies pour se distinguer entre
// elles ET des terrains (vert herbe / bleu eau).

export const PLAYERS = [
    { id: 'p1', name: 'Rouge', color: '#d64545' },
    { id: 'p2', name: 'Bleu', color: '#3f7fd8' },
    { id: 'p3', name: 'Violet', color: '#9b59b6' },
    { id: 'p4', name: 'Orange', color: '#e08e2b' },
];

// Les joueurs actifs pour une carte donnée (autant que de points de départ).
export const playersForMap = (map) => PLAYERS.slice(0, map.spawns.length);
