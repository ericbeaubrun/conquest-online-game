// Registre des cartes prédéfinies. Chaque carte est une liste de cases
// { q, r, type } accompagnée de ses points de départ (spawns). Le nombre de
// spawns fixe le nombre de joueurs de la carte (entre 2 et 4).

import { hexShape, buildMap } from './mapShapes.js';
import { CUSTOM_MAPS } from './customMaps.js';
import {DEMO_MAPS} from './demoMaps.js';
import {TEST_MAPS} from './testMaps.js';

// Les trois cartes de base sont volontairement en terrain uniforme : aucune
// eau ni montagne ne vient couper les trajets, seule la taille les distingue.
const plainTerrain = () => 'grass';

// Marge commune : trois rangées vides au-dessus et au-dessous du plateau. Elles
// ne contiennent pas de case — elles agrandissent seulement le cadre de la
// carte, ce qui laisse respirer le décor de fond (voir `buildGeometry`).
const MARGIN = {top: 3, bottom: 3};

// Configuration visuelle commune aux cartes qui utilisent le cadre rocheux.
// Chaque appel crée son propre objet `opacity` pour permettre des réglages
// indépendants carte par carte.
const rockyPalette = (opacity = {}) => ({
    background: '#14171d',
    backgroundImage: '/backgrounds/cadre-rocheux.webp',
    backgroundRatio: 2048 / 1365,
    opacity: {
        grass: 1,
        forest: 1,
        sand: 1,
        mountain: 1,
        water: 1,
        ...opacity,
    },
});

// --- Registre ---
export const MAPS = [
    buildMap({
        id: 'duel',
        name: 'Duel',
        description: '2 joueurs · 61 cases',
        palette: {
            ...rockyPalette({grass: 0.55}),
            background: '#315d08',
            backgroundImage: '/backgrounds/herbe-duel.png',
            backgroundRatio: 4 / 3,
        },
        cells: hexShape(4, plainTerrain),
        margin: MARGIN,
        spawns: [
            { q: -4, r: 0 },
            { q: 4, r: 0 },
        ],
    }),
    buildMap({
        id: 'vallee',
        name: 'Vallée',
        description: '3 joueurs · 217 cases',
        palette: {
            ...rockyPalette({grass: 0.55}),
            grass: '#d9c48c',
            background: '#d2b98e',
            backgroundImage: '/backgrounds/sable-vallee.png',
            backgroundRatio: 4 / 3,
        },
        cells: hexShape(8, plainTerrain),
        margin: MARGIN,
        spawns: [
            { q: 0, r: -8 },
            { q: 8, r: 0 },
            { q: -8, r: 8 },
        ],
    }),
    buildMap({
        id: 'continent',
        name: 'Continent',
        description: '4 joueurs · 397 cases',
        palette: {
            ...rockyPalette({grass: 0.55}),
            background: '#4f9992',
            backgroundImage: '/backgrounds/ile-continent.webp',
            backgroundRatio: 4 / 3,
        },
        cells: hexShape(11, plainTerrain),
        margin: MARGIN,
        spawns: [
            { q: 0, r: -9 },
            { q: 9, r: -5 },
            { q: 0, r: 9 },
            { q: -9, r: 5 },
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
