// Cartes de TEST pour le banc de métriques du bot (voir
// `shared-engine/balance/botMetrics.js`) : trois tailles fixes (60 / 180 / 300
// cases) pour mesurer comment le comportement du bot varie avec la taille du
// terrain, à 2 joueurs constant.
//
// Volontairement TRÈS basiques : un rectangle plat, toute en herbe, sans
// obstacle ni contenu placé à la main — les arbres et coffres n'apparaissent
// que via le tirage aléatoire normal du moteur (`engine/endturn/spawns.js`),
// exactement comme en partie réelle.
//
// Comme les cartes de démonstration (`demoMaps.js`), elles rejoignent le
// registre complet du moteur (`ALL_MAPS` dans `maps.js`) mais PAS `MAPS` : elles
// ne sont donc jamais proposées comme carte de partie hors-ligne ou en ligne.

import {rectShape, buildMap} from './mapShapes.js';

const flatGrass = () => 'grass';

export const TEST_MAPS = [
    buildMap({
        id: 'test-small',
        name: '[Test] Petite',
        description: '2 joueurs · 60 cases (banc de métriques du bot)',
        cells: rectShape(12, 5, flatGrass),
        spawns: [
            {q: 1, r: 2},
            {q: 10, r: -3},
        ],
    }),
    buildMap({
        id: 'test-medium',
        name: '[Test] Moyenne',
        description: '2 joueurs · 180 cases (banc de métriques du bot)',
        cells: rectShape(18, 10, flatGrass),
        spawns: [
            {q: 1, r: 4},
            {q: 16, r: -4},
        ],
    }),
    buildMap({
        id: 'test-large',
        name: '[Test] Grande',
        description: '2 joueurs · 300 cases (banc de métriques du bot)',
        cells: rectShape(25, 12, flatGrass),
        spawns: [
            {q: 1, r: 5},
            {q: 23, r: -6},
        ],
    }),
];
