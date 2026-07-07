// Registre des cartes prédéfinies. Chaque carte est une liste de cases
// { q, r, type } accompagnée de ses points de départ (spawns). Le nombre de
// spawns fixe le nombre de joueurs de la carte (entre 2 et 4).

import { hexId, getNeighbors } from './hex.js';

// --- Bruit déterministe (0..1) pour distribuer les terrains ---
function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Régions contiguës : les cases d'un même bloc de taille `scale` partagent
// une valeur, ce qui crée des lacs/forêts d'un seul tenant plutôt qu'un bruit
// « poivre et sel ». Le décalage +1000 évite les coordonnées négatives.
function region(q, r, scale) {
    return hash(Math.floor((q + 1000) / scale), Math.floor((r + 1000) / scale));
}

// Terrain naturel pour les cartes en forme d'hexagone.
function landTerrain(q, r) {
    const n = region(q, r, 3) * 0.55 + region(q, r, 8) * 0.45;
    if (n < 0.16) return 'water';
    if (n < 0.26) return 'sand';
    if (n > 0.85) return 'mountain';
    if (n > 0.68) return 'forest';
    return 'grass';
}

// --- Générateurs de forme ---

// Carte en forme d'hexagone de rayon `radius` (coordonnées axiales).
function hexShape(radius, terrainFn) {
    const cells = [];
    for (let q = -radius; q <= radius; q++) {
        const r1 = Math.max(-radius, -q - radius);
        const r2 = Math.min(radius, -q + radius);
        for (let r = r1; r <= r2; r++) {
            cells.push({ q, r, type: terrainFn(q, r) });
        }
    }
    return cells;
}

// Carte rectangulaire (grille décalée « odd-q » convertie en axial).
function rectShape(cols, rows, terrainFn) {
    const cells = [];
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            const q = col;
            const r = row - Math.floor(col / 2);
            cells.push({ q, r, type: terrainFn(col, row, cols, rows) });
        }
    }
    return cells;
}

// Terrain « île » : eau sur les bords, plages puis terres vers le centre.
function islandTerrain(col, row, cols, rows) {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const dx = (col - cx) / cx;
    const dy = (row - cy) / cy;
    const d = Math.sqrt(dx * dx + dy * dy); // 0 au centre, ~1.4 aux coins
    const n = region(col, row, 4) * 0.5 + region(col, row, 9) * 0.5;
    if (d + n * 0.3 > 1.0) return 'water';
    if (d + n * 0.3 > 0.88) return 'sand';
    if (n > 0.72) return 'mountain';
    if (n > 0.55) return 'forest';
    return 'grass';
}

// Petite carte d'origine : herbe avec quelques points d'eau fixes.
const DUEL_WATER = new Set(['-2,-1', '-1,-2', '2,1', '1,2', '0,3', '0,-3']);
const duelTerrain = (q, r) => (DUEL_WATER.has(`${q},${r}`) ? 'water' : 'grass');

// Garantit que chaque base et ses voisins reposent sur de la terre ferme
// (une base ne peut pas être sur l'eau, sinon elle serait inconquérable).
function clearWaterAroundSpawns(cells, spawns) {
    const byId = new Map(cells.map((c) => [hexId(c.q, c.r), c]));
    for (const s of spawns) {
        for (const p of [{ q: s.q, r: s.r }, ...getNeighbors(s.q, s.r)]) {
            const c = byId.get(hexId(p.q, p.r));
            if (c && c.type === 'water') c.type = 'grass';
        }
    }
    return cells;
}

// Assemble une carte : applique le nettoyage de l'eau autour des spawns.
function buildMap({ id, name, description, cells, spawns }) {
    return { id, name, description, spawns, cells: clearWaterAroundSpawns(cells, spawns) };
}

// --- Registre ---
export const MAPS = [
    buildMap({
        id: 'duel',
        name: 'Duel',
        description: '2 joueurs · 61 cases',
        cells: hexShape(4, duelTerrain),
        spawns: [
            { q: -4, r: 0 },
            { q: 4, r: 0 },
        ],
    }),
    buildMap({
        id: 'vallee',
        name: 'Vallée',
        description: '3 joueurs · 271 cases',
        cells: hexShape(9, landTerrain),
        spawns: [
            { q: 0, r: -8 },
            { q: 8, r: 0 },
            { q: -8, r: 8 },
        ],
    }),
    buildMap({
        id: 'continent',
        name: 'Continent',
        description: '4 joueurs · 631 cases',
        cells: hexShape(14, landTerrain),
        spawns: [
            { q: 0, r: -12 },
            { q: 12, r: -6 },
            { q: 0, r: 12 },
            { q: -12, r: 6 },
        ],
    }),
    buildMap({
        id: 'archipel',
        name: 'Archipel',
        description: '4 joueurs · 560 cases',
        cells: rectShape(28, 20, islandTerrain),
        spawns: [
            { q: 9, r: 2 },
            { q: 19, r: -3 },
            { q: 9, r: 10 },
            { q: 19, r: 5 },
        ],
    }),
];

export const DEFAULT_MAP_ID = MAPS[0].id;

export const getMapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
