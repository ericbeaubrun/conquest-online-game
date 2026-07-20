// Cartes personnalisées, ajoutées automatiquement au menu par maps.js.
//
// FAÇON RECOMMANDÉE : utilisez l'éditeur visuel dans le dossier `map-editor/`
// (ouvrez map-editor/index.html), dessinez la carte, puis collez ici le bloc
// `defineAsciiMap({...})` exporté. Pour retirer une carte, supprimez son bloc.
//
// À LA MAIN (facultatif) : grille stricte — une case toutes les 2 colonnes
// (cases séparées par une espace), sans indenter les rangées entre elles. Une
// espace au milieu du dessin = un trou (permet n'importe quelle forme).
// Symboles : . herbe  T forêt  ^ montagne  _ sable  ~ eau  et 1 2 3 4 pour
// les points de départ des joueurs. La forme dessinée = la forme à l'écran.
//
// COULEURS : `palette: { grass, forest, mountain, sand, water, background }`
// donne à la carte son ambiance propre. Toutes les clés sont facultatives —
// celles qu'on omet gardent la couleur par défaut de terrain.js.

import { defineAsciiMap } from './mapDSL.js';

export const CUSTOM_MAPS = [
    // Un couloir avec une rivière centrale et deux forêts défensives (2 joueurs).
    defineAsciiMap({
        id: 'passage',
        name: 'Le Passage',
        art: `
            1 . . . ~ . . . 2
            . . T . ~ . T . .
            . . . . ~ . . . .
            . T . . . . . T .
            . . . . ~ . . . .
        `,
    }),

    // Carte en croix pour 4 joueurs : les coins vides (espaces) creusent la
    // forme, un lac de montagnes garde le centre. Dessin = rendu.
    // Ambiance volcanique : la palette propre à la carte suffit à la
    // caractériser, sans toucher au moteur ni au rendu.
    defineAsciiMap({
        id: 'croix',
        name: 'La Croix',
        palette: {
            grass: '#8a7a4e',
            forest: '#5c5230',
            mountain: '#6b4136',
            water: '#c1502e',
            background: '#1a1110',
        },
        art: `
                . 1 .
                . . .
            . . . ^ . . .
            3 . ^ ~ ^ . 4
            . . . ^ . . .
                . . .
                . 2 .
        `,
    }),

    defineAsciiMap({
        id: 'ma-carte',
        name: 'Ma carte',
        art: `
            . . . . 1     T T T   T T T     3 . . . .
            . . . .     T T T T   T T T T     . . . .
            . . . .       T T T   T T T       . . . .
            . . . .   T   T T ^   ^ T T   T   . . . .
            . . . . . T T T ^ ^ ^ ^ ^ T T T . . . . .
            . . . . . T T T ^ ^ ^ ^ ^ T T T . . . . .
            . . . . . T T T ^ ^ ^ ^ ^ T T T . . . . .
            . . . .       T T T   T T T       . . . .
            . . . .     T T T T   T T T T     . . . .
            . . . . 2     T T T   T T T     4 . . . .
        `,
    }),
];
