// Géométrie des hexagones (orientation "flat-top", coordonnées axiales q/r).
// Réf. : https://www.redblobgames.com/grids/hexagons/

export const HEX_SIZE = 40; // rayon (centre -> sommet) en unités du viewBox SVG

// Largeur/hauteur d'un hexagone flat-top pour un rayon donné.
export const hexWidth = (size = HEX_SIZE) => size * 2;
export const hexHeight = (size = HEX_SIZE) => Math.sqrt(3) * size;

// Centre (x, y) d'un hexagone à partir de ses coordonnées axiales.
export function hexToPixel({ q, r }, size = HEX_SIZE) {
    const x = size * (3 / 2) * q;
    const y = size * Math.sqrt(3) * (r + q / 2);
    return { x, y };
}

// Les 6 sommets d'un hexagone centré en (cx, cy).
export function hexCorners(cx, cy, size = HEX_SIZE) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i);
        corners.push({
            x: cx + size * Math.cos(angle),
            y: cy + size * Math.sin(angle),
        });
    }
    return corners;
}

// Chaîne "x,y x,y ..." prête pour l'attribut points d'un <polygon>.
export function hexPointsAttr(cx, cy, size = HEX_SIZE) {
    return hexCorners(cx, cy, size)
        .map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`)
        .join(' ');
}

// Conversion inverse : un point pixel -> coordonnées axiales entières.
// Indispensable pour savoir quelle case a été cliquée sur une carte déplaçable.
export function pixelToHex({ x, y }, size = HEX_SIZE) {
    const q = ((2 / 3) * x) / size;
    const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / size;
    return hexRound(q, r);
}

// Arrondi cube : ramène des coordonnées fractionnaires à l'hexagone le plus proche.
export function hexRound(q, r) {
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
}

// Identifiant stable d'une case, utile comme clé React et dans les Map.
export const hexId = (q, r) => `${q},${r}`;

// Les 6 directions voisines en coordonnées axiales.
export const HEX_DIRECTIONS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
];

// Coordonnées des 6 cases adjacentes à (q, r).
export function getNeighbors(q, r) {
    return HEX_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

// Distance hexagonale (en nombre de cases) entre deux cases axiales, à vol
// d'oiseau — elle ignore les obstacles.
export function hexDistance(a, b) {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Boîte englobante de toutes les cases (pour dimensionner le viewBox SVG).
export function computeBounds(cells, size = HEX_SIZE) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cell of cells) {
        const { x, y } = hexToPixel(cell, size);
        minX = Math.min(minX, x - size);
        maxX = Math.max(maxX, x + size);
        minY = Math.min(minY, y - hexHeight(size) / 2);
        maxY = Math.max(maxY, y + hexHeight(size) / 2);
    }
    return { minX, minY, width: maxX - minX, height: maxY - minY };
}
