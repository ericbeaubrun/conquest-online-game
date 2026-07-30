// Mini-cartes réservées aux démonstrations de la page d'accueil.
// Elles appartiennent au registre logique du moteur pour profiter du vrai
// plateau et du reducer, mais restent séparées de MAPS : elles ne sont donc
// jamais proposées comme cartes de partie hors-ligne ou en ligne.

import {defineAsciiMap} from './mapDSL.js';

export const DEMO_MAPS = [
    defineAsciiMap({
        id: 'demo-fusion-breach',
        name: 'La Brèche',
        description: 'Démonstration · fusion de soldats',
        palette: {
            background: '#10141b',
            grass: '#668e52',
            forest: '#3e6d3e',
            mountain: '#716b69',
            water: '#416f94',
        },
        art: `
            . . . . . .
            . . . . . .
            1 . . . . 2
            . . . . . .
        `,
    }),
];
