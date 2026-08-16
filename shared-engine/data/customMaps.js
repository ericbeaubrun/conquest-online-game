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
// RANGÉES VIDES en haut/bas du dessin : elles ne posent aucune case mais
// agrandissent le cadre de la carte (marge de décor) — voir `margin` dans
// mapDSL.js.
//
// APPARENCE : `palette` accepte les couleurs (`grass`, `forest`, `mountain`,
// `sand`, `water`, `background`), `opacity: { grass: 0.8, ... }` et, en option,
// `backgroundImage` + `backgroundRatio`. Sans image, le fond reste une couleur
// unie. Toutes les clés omises gardent leur valeur par défaut de terrain.js.

import {defineAsciiMap} from './mapDSL.js';

export const CUSTOM_MAPS = [

    // La plus petite carte du jeu : 31 cases et une montagne pile au milieu,
    // qui oblige à choisir son côté dès le premier tour.
    defineAsciiMap({
        id: 'escarmouche',
        name: 'Escarmouche',
        art: `
              .   .   .   .
            . . . . . . . . .
            1 . . . ^ . . . 2
            . . . . . . . . .

        `,
    }),

    // Grande plaine rase, sans le moindre obstacle : un duel est-ouest où tout
    // se joue au placement, puisque rien ne couvre ni ne ralentit personne.
    defineAsciiMap({
        id: 'plaine',
        name: 'Plaine',
        art: `

              .   .   .   .   .   .   .
            . . . . . . . . . . . . . . .
            . . . . . . . . . . . . . . .
            . . . . . . . . . . . . . . .
            1 . . . . . . . . . . . . . 2
            . . . . . . . . . . . . . . .
            . . . . . . . . . . . . . . .
            . . . . . . . . . . . . . . .


        `,
    }),

    // Bandes de forêt, de sable et de vide empilées d'ouest en est, tranchées
    // par une colonne de montagnes : on progresse couche par couche.
    defineAsciiMap({
        id: 'lignes',
        name: 'Lignes',
        art: `

              .   T   T   T   T   T   T   T   T   T   T   T   T   .
            . . T   T   T   T   T   T   ^   T   T   T   T   T   T . .
            . .   _   _   _   _   _   _   _   _   _   _   _   _   . .
            . . _   _   _   _   _   _   ^   _   _   _   _   _   _ . .
            1 .                                                   . 2
            . . _ _ _ _ _ _ _ _ _ _ _ _ ^ _ _ _ _ _ _ _ _ _ _ _ _ . .
            . .                                                   . .
            . . T T T T T T T T T T T T ^ T T T T T T T T T T T T . .


        `,
    }),


    // Deux ailes de plaine reliées par un seul cœur boisé : à 4 joueurs, chacun
    // tient un quart d'aile et le passage central est le seul point de contact.
    defineAsciiMap({
        id: 'papillon',
        name: 'Papillon',
        art: `



                  1 . . . . . . .   . . . . . . . 3
                  . . . . . . . .   . . . . . . . .
                  . . . . . . . .   . . . . . . . .
                  . . . . . . . .   . . . . . . . .
                  . . . . . . . .   . . . . . . . .
                  . . . . . . . .   . . . . . . . .
                  . . . . . . . T T T . . . . . . .
                  . . . . . . T T T T T . . . . . .
                              T T T T T
                  . . . . . . T T T T T . . . . . .
                  . . . . . . . . T . . . . . . . .
                  . . . . . . . .   . . . . . . . .
                  . . . . . . . .   . . . . . . . .
                  . . . . . . . .   . . . . . . . .
                  . . . . . . . .   . . . . . . . .
                  . . . . . . . .   . . . . . . . .
                  4 . . . . . . .   . . . . . . . 2



        `,
    }),






];
