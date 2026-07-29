// Registre des cartes prédéfinies. Chaque carte est une liste de cases
// { q, r, type } accompagnée de ses points de départ (spawns). Le nombre de
// spawns fixe le nombre de joueurs de la carte (entre 2 et 4).

import { region, hexShape, rectShape, buildMap } from './mapShapes.js';
import { CUSTOM_MAPS } from './customMaps.js';
import {DEMO_MAPS} from './demoMaps.js';
import {TEST_MAPS} from './testMaps.js';

// Terrain naturel pour les cartes en forme d'hexagone.
function landTerrain(q, r) {
    const n = region(q, r, 3) * 0.55 + region(q, r, 8) * 0.45;
    if (n < 0.16) return 'water';
    if (n < 0.26) return 'sand';
    if (n > 0.85) return 'mountain';
    if (n > 0.68) return 'forest';
    return 'grass';
}

// Terrain « île » : eau sur les bords, plages puis terres vers le centre.
function islandTerrain(col, row, cols, rows) {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const dx = (col - cx) / cx;
    const dy = (row - cy) / cy;
    const d = Math.sqrt(dx * dx + dy * dy); // 0 au centre, ~1.4 aux coins
    const n = region(col, row, 4) * 0.5 + region(col, row, 9) * 0.5;
    if (d + n * 0.3 > 1.0) return 'water';
    if (d + n * 0.3 > 0.88) return 'sand';
    if (n > 0.72) return 'mountain';
    if (n > 0.55) return 'forest';
    return 'grass';
}

// Petite carte d'origine : herbe avec quelques points d'eau fixes.
const DUEL_WATER = new Set(['-2,-1', '-1,-2', '2,1', '1,2', '0,3', '0,-3']);
const duelTerrain = (q, r) => (DUEL_WATER.has(`${q},${r}`) ? 'water' : 'grass');

// --- Registre ---
export const MAPS = [
    buildMap({
        id: 'duel',
        name: 'Duel',
        description: '2 joueurs · 61 cases',
        cells: hexShape(4, duelTerrain),
        spawns: [
            { q: -4, r: 0 },
            { q: 4, r: 0 },
        ],
    }),
    buildMap({
        id: 'vallee',
        name: 'Vallée',
        description: '3 joueurs · 271 cases',
        cells: hexShape(9, landTerrain),
        spawns: [
            { q: 0, r: -8 },
            { q: 8, r: 0 },
            { q: -8, r: 8 },
        ],
    }),
    buildMap({
        id: 'continent',
        name: 'Continent',
        description: '4 joueurs · 631 cases',
        cells: hexShape(14, landTerrain),
        spawns: [
            { q: 0, r: -12 },
            { q: 12, r: -6 },
            { q: 0, r: 12 },
            { q: -12, r: 6 },
        ],
    }),
    buildMap({
        id: 'archipel',
        name: 'Archipel',
        description: '4 joueurs · 560 cases',
        cells: rectShape(28, 20, islandTerrain),
        spawns: [
            { q: 9, r: 2 },
            { q: 19, r: -3 },
            { q: 9, r: 10 },
            { q: 19, r: 5 },
        ],
    }),
    // Cartes personnalisées dessinées via l'outil ASCII (voir customMaps.js).
    ...CUSTOM_MAPS,
];

export const DEFAULT_MAP_ID = MAPS[0].id;

// Registre complet utilisé par le moteur. Les cartes de démonstration et de
// test y sont résolues par id, sans rejoindre MAPS (la liste publique des
// cartes jouables) : voir `demoMaps.js` et `testMaps.js`.
const ALL_MAPS = [...MAPS, ...DEMO_MAPS, ...TEST_MAPS];

export const getMapById = (id) => ALL_MAPS.find((m) => m.id === id) || MAPS[0];

// Résolution stricte pour les entrées venant d'un joueur (création/configuration
// d'un lobby). Un id de démo ou inconnu retombe sur une vraie carte jouable.
export const getPlayableMapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
