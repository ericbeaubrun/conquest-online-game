// Types de terrain : couleur d'affichage et jouabilité.
// Centralisé ici pour que carte et rendu partagent la même source de vérité.

export const TERRAIN_COLORS = {
    grass: '#7cae5b',
    forest: '#4d8c3f',
    sand: '#d9c48c',
    mountain: '#94897c',
    water: '#5b93c7',
};

// Liste ordonnée des types (palette de l'éditeur, itérations d'UI).
export const TERRAIN_TYPES = Object.keys(TERRAIN_COLORS);

// Libellés français, pour toute UI qui présente les terrains à l'utilisateur.
export const TERRAIN_LABELS = {
    grass: 'Herbe',
    forest: 'Forêt',
    sand: 'Sable',
    mountain: 'Montagne',
    water: 'Eau',
};

// Fond du plateau derrière les cases (visible autour de la carte et dans les
// trous des cartes de forme libre).
export const DEFAULT_BACKGROUND = '#14171d';

// --- Palettes par carte ---------------------------------------------------
//
// Chaque carte peut définir `palette: { grass: '#...', ..., background: '#...' }`
// pour se donner une ambiance propre (carte désertique, nocturne, volcanique…).
// Les clés absentes retombent sur les couleurs par défaut ci-dessus : une carte
// n'a jamais besoin de redéclarer toute la palette.
//
// `palette.backgroundImage` (facultatif) ajoute par-dessus la couleur de fond
// une image décorative derrière le plateau — voir `mapBackgroundImage`.

// Couleurs de terrain effectives d'une carte (défauts + surcharges éventuelles).
export function terrainColors(map) {
    return map?.palette ? { ...TERRAIN_COLORS, ...map.palette } : TERRAIN_COLORS;
}

// Couleur de fond effective d'une carte.
export function mapBackground(map) {
    return map?.palette?.background || DEFAULT_BACKGROUND;
}

// Image de fond d'une carte : chemin servi par le front (fichier posé dans
// `conquest-front/public/`, ex. '/backgrounds/duel.png'), ou `null`.
//
// Purement décoratif. Le front la pose DANS le plateau, sous les cases et dans
// le repère du monde : elle se déplace et grossit avec la carte, comme un
// décor du terrain et non comme un fond d'écran. La couleur de fond reste
// dessous et prend seule le relais si le fichier manque ou ne charge pas.
export function mapBackgroundImage(map) {
    return map?.palette?.backgroundImage || null;
}

// Terrains sur lesquels on ne peut pas poser d'unité.
export const BLOCKED_TERRAIN = new Set(['water']);
