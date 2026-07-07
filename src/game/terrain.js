// Types de terrain : couleur d'affichage et jouabilité.
// Centralisé ici pour que carte et rendu partagent la même source de vérité.

export const TERRAIN_COLORS = {
    grass: '#7cae5b',
    forest: '#4d8c3f',
    sand: '#d9c48c',
    mountain: '#94897c',
    water: '#5b93c7',
};

// Terrains sur lesquels on ne peut pas poser d'unité.
export const BLOCKED_TERRAIN = new Set(['water']);
