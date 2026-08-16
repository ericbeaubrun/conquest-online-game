// Types de terrain : couleur d'affichage et jouabilité.
// Centralisé ici pour que carte et rendu partagent la même source de vérité.

export const TERRAIN_COLORS = {
    grass: '#7cae5b',
    forest: '#4d8c3f',
    sand: '#d9c48c',
    mountain: '#94897c',
    water: '#5b93c7',
};

// Opacité par défaut des cases. Une carte peut surcharger chaque type via
// `palette.opacity` sans devoir redéclarer les autres.
export const TERRAIN_OPACITIES = {
    grass: 1,
    forest: 1,
    sand: 1,
    mountain: 1,
    water: 1,
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
    if (!map?.palette) return TERRAIN_COLORS;
    return Object.fromEntries(
        TERRAIN_TYPES.map((type) => [type, map.palette[type] || TERRAIN_COLORS[type]]),
    );
}

// Opacités effectives, bornées entre 0 et 1 pour qu'une erreur de configuration
// ne produise pas un attribut SVG invalide.
export function terrainOpacities(map) {
    return Object.fromEntries(
        TERRAIN_TYPES.map((type) => {
            const configured = map?.palette?.opacity?.[type];
            const value = Number.isFinite(configured) ? configured : TERRAIN_OPACITIES[type];
            return [type, Math.min(1, Math.max(0, value))];
        }),
    );
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

// Ratio largeur/hauteur du fichier de décor. Il permet au front de conserver
// les proportions de chaque image sans supposer que toutes ont le même format.
export function mapBackgroundRatio(map) {
    const ratio = map?.palette?.backgroundRatio;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 3 / 2;
}

// Terrains sur lesquels on ne peut pas poser d'unité.
export const BLOCKED_TERRAIN = new Set(['water']);
