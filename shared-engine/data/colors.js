// Palette de couleurs des joueurs, PARTAGÉE par le front (sélecteur de couleur)
// et le back (attribution/validation en ligne). Source de vérité unique : les
// deux côtés proposent et acceptent donc exactement les mêmes couleurs.
// Choisies pour se distinguer entre elles, des terrains (herbe, forêt, sable,
// montagne — désormais des teintes pâles, voir TERRAIN_COLORS) ET des couleurs
// d'indicateur de combat (victoire/abattage vert #4dd25b, défaite rouge
// #ff4d4d, égalité jaune #e8d24d, double élimination orange #ff9d4d) : plus
// sombres/saturées que ces dernières pour rester lisibles sous la surbrillance
// pulsante d'une case en combat. Un joueur ne peut pas prendre une couleur
// déjà utilisée par un autre.

export const COLOR_PALETTE = [
    { name: 'Rouge', value: '#a8293f' },
    { name: 'Bleu', value: '#274e8c' },
    { name: 'Jaune', value: '#a67c1e' },
    { name: 'Violet', value: '#9b59b6' },
    { name: 'Gris', value: '#5c6672' },
    { name: 'Cyan', value: '#31a2a2' },
    { name: 'Orange', value: '#b5551a' },
    { name: 'Rose', value: '#e06ab0' },
];

// Valeurs seules (ordre de préférence pour l'attribution automatique).
export const PALETTE_VALUES = COLOR_PALETTE.map((c) => c.value);

// Nom lisible d'une couleur de la palette (repli générique).
export const colorName = (value) =>
    COLOR_PALETTE.find((c) => c.value === value)?.name || 'Joueur';
