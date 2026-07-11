// Palette de couleurs des joueurs, PARTAGÉE par le front (sélecteur de couleur)
// et le back (attribution/validation en ligne). Source de vérité unique : les
// deux côtés proposent et acceptent donc exactement les mêmes couleurs.
// Choisies pour se distinguer entre elles ET des terrains (vert herbe, bleu eau,
// sable). Un joueur ne peut pas prendre une couleur déjà utilisée par un autre.

export const COLOR_PALETTE = [
    { name: 'Rouge', value: '#d64545' },
    { name: 'Bleu', value: '#3f7fd8' },
    { name: 'Violet', value: '#9b59b6' },
    { name: 'Orange', value: '#e08e2b' },
    { name: 'Rose', value: '#e06ab0' },
    { name: 'Cyan', value: '#35c4c4' },
    { name: 'Or', value: '#e0c93a' },
    { name: 'Gris', value: '#b0b6bd' },
];

// Valeurs seules (ordre de préférence pour l'attribution automatique).
export const PALETTE_VALUES = COLOR_PALETTE.map((c) => c.value);

// Nom lisible d'une couleur de la palette (repli générique).
export const colorName = (value) =>
    COLOR_PALETTE.find((c) => c.value === value)?.name || 'Joueur';
