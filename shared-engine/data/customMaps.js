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
    defineAsciiMap({
        id: 'croix',
        name: 'La Croix',
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
