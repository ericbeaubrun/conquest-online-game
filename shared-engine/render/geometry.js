// Géométrie de rendu : positions pixel et points SVG de chaque case, dérivés du
// modèle logique du plateau. C'est une préoccupation purement CLIENT (le
// serveur du mode « online » n'en a jamais besoin), d'où sa séparation de
// `engine/board.js`.

import { getLogicalBoard } from '../engine/board.js';
import { HEX_SIZE, hexToPixel, hexPointsAttr, computeBounds, hexHeight } from '../data/hex.js';

export const PADDING = HEX_SIZE * 0.8;

// Ne dépend que de l'identifiant de carte : mémoïsé une fois pour toutes.
const geometryCache = new Map();

export function buildGeometry(mapId) {
    if (geometryCache.has(mapId)) return geometryCache.get(mapId);
    const { map, cells: logicalCells, baseIds } = getLogicalBoard(mapId);

    const cells = logicalCells.map((c) => {
        const { x, y } = hexToPixel(c);
        return { ...c, cx: x, cy: y, points: hexPointsAttr(x, y) };
    });
    const cellMap = new Map(cells.map((c) => [c.id, c]));

    const b = computeBounds(map.cells);
    // Marge de la carte : des rangées vides (sans case) au-dessus et au-dessous
    // du plateau. Elles n'existent que dans le CADRE — le décor de fond s'y
    // étend, les cases s'arrêtent avant. Voir `margin` dans maps.js/mapDSL.js.
    const marginTop = (map.margin?.top || 0) * hexHeight();
    const marginBottom = (map.margin?.bottom || 0) * hexHeight();
    const base = {
        x: b.minX - PADDING,
        y: b.minY - PADDING - marginTop,
        w: b.width + PADDING * 2,
        h: b.height + PADDING * 2 + marginTop + marginBottom,
    };
    const baseCells = [...baseIds].map((id) => cellMap.get(id)).filter(Boolean);

    const geometry = { cells, cellMap, base, baseCells };
    geometryCache.set(mapId, geometry);
    return geometry;
}
