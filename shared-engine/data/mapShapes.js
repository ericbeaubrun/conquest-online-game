// Générateurs de forme de carte partagés (hexagone, rectangle) et l'assemblage
// final (`buildMap`) — réutilisés par le registre des cartes jouables
// (`maps.js`) et par les cartes de test du banc de métriques du bot
// (`testMaps.js`).

import {hexId, getNeighbors} from './hex.js';

// --- Bruit déterministe (0..1) pour distribuer les terrains ---
export function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Régions contiguës : les cases d'un même bloc de taille `scale` partagent
// une valeur, ce qui crée des lacs/forêts d'un seul tenant plutôt qu'un bruit
// « poivre et sel ». Le décalage +1000 évite les coordonnées négatives.
export function region(q, r, scale) {
    return hash(Math.floor((q + 1000) / scale), Math.floor((r + 1000) / scale));
}

// Carte en forme d'hexagone de rayon `radius` (coordonnées axiales).
export function hexShape(radius, terrainFn) {
    const cells = [];
    for (let q = -radius; q <= radius; q++) {
        const r1 = Math.max(-radius, -q - radius);
        const r2 = Math.min(radius, -q + radius);
        for (let r = r1; r <= r2; r++) {
            cells.push({q, r, type: terrainFn(q, r)});
        }
    }
    return cells;
}

// Carte rectangulaire (grille décalée « odd-q » convertie en axial) : exactement
// `cols * rows` cases, sans trou — pratique quand on veut une taille de carte
// exacte (voir `testMaps.js`).
export function rectShape(cols, rows, terrainFn) {
    const cells = [];
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            const q = col;
            const r = row - Math.floor(col / 2);
            cells.push({q, r, type: terrainFn(col, row, cols, rows)});
        }
    }
    return cells;
}

// Garantit que chaque base et ses voisins reposent sur de la terre ferme
// (une base ne peut pas être sur l'eau, sinon elle serait inconquérable).
export function clearWaterAroundSpawns(cells, spawns) {
    const byId = new Map(cells.map((c) => [hexId(c.q, c.r), c]));
    for (const s of spawns) {
        for (const p of [{q: s.q, r: s.r}, ...getNeighbors(s.q, s.r)]) {
            const c = byId.get(hexId(p.q, p.r));
            if (c && c.type === 'water') c.type = 'grass';
        }
    }
    return cells;
}

// Assemble une carte : applique le nettoyage de l'eau autour des spawns.
// `palette` (facultatif) surcharge les couleurs de terrain et le fond de la
// carte — voir `terrainColors` / `mapBackground` dans terrain.js.
export function buildMap({id, name, description, cells, spawns, palette}) {
    return {id, name, description, spawns, palette, cells: clearWaterAroundSpawns(cells, spawns)};
}
