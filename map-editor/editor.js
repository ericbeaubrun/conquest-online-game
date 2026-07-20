// Éditeur visuel de cartes pour Conquest.
//
// Le designer saisit des dimensions, peint des cases (terrain / départ / trou)
// puis exporte un bloc `defineAsciiMap({...})` à coller dans
// shared-engine/data/customMaps.js. La géométrie hexagonale et les couleurs
// sont identiques à celles du jeu (hex.js / terrain.js) pour un rendu fidèle.

// --- Constantes partagées avec le moteur ---------------------------------
const HEX_SIZE = 40; // rayon centre -> sommet (unités du viewBox SVG)
const SQRT3 = Math.sqrt(3);

// type interne -> { symbole ASCII, couleur par défaut, libellé }.
// Les symboles correspondent à la LEGEND de mapDSL.js, les couleurs aux
// défauts de TERRAIN_COLORS (terrain.js).
const TERRAINS = {
    grass: { char: '.', color: '#7cae5b', label: 'Herbe' },
    forest: { char: 'T', color: '#4d8c3f', label: 'Forêt' },
    mountain: { char: '^', color: '#94897c', label: 'Montagne' },
    sand: { char: '_', color: '#d9c48c', label: 'Sable' },
    water: { char: '~', color: '#5b93c7', label: 'Eau' },
};
// Fond du plateau par défaut (DEFAULT_BACKGROUND de terrain.js).
const DEFAULT_BACKGROUND = '#14171d';
// Les points de départ : type 'spawn1'..'spawn4', symbole = le chiffre.
const SPAWNS = [1, 2, 3, 4];

// --- État -----------------------------------------------------------------
let cols = 9;
let rows = 7;
let grid = []; // grid[row][col] = 'grass' | ... | 'hole' | 'spawn1'..
let brush = 'grass'; // pinceau courant
let painting = false;
// Palette de la carte en cours d'édition : couleur par terrain + arrière-plan.
// Exportée avec la carte, elle est ensuite appliquée en jeu (voir terrain.js).
let palette = defaultPalette();

function defaultPalette() {
    const p = { background: DEFAULT_BACKGROUND };
    for (const [key, t] of Object.entries(TERRAINS)) p[key] = t.color;
    return p;
}

// --- Géométrie (flat-top, cf. hex.js du jeu) ------------------------------
// (col,row) -> axial q/r « odd-q » (identique à offsetToAxial de mapDSL.js).
function toAxial(col, row) {
    return { q: col, r: row - Math.floor(col / 2) };
}
function hexCenter(col, row) {
    const { q, r } = toAxial(col, row);
    return {
        x: HEX_SIZE * 1.5 * q,
        y: HEX_SIZE * SQRT3 * (r + q / 2),
    };
}
function hexPoints(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i);
        pts.push(`${(cx + HEX_SIZE * Math.cos(a)).toFixed(1)},${(cy + HEX_SIZE * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
}

// --- Construction / réinitialisation de la grille -------------------------
function makeGrid() {
    cols = clampInt(document.getElementById('cols').value, 2, 40, 9);
    rows = clampInt(document.getElementById('rows').value, 2, 40, 7);
    grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'grass'));
    render();
}
function clampInt(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

// --- Rendu SVG ------------------------------------------------------------
function render() {
    // Boîte englobante pour dimensionner le viewBox.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const centers = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const c = hexCenter(col, row);
            centers.push({ col, row, ...c });
            minX = Math.min(minX, c.x - HEX_SIZE);
            maxX = Math.max(maxX, c.x + HEX_SIZE);
            minY = Math.min(minY, c.y - HEX_SIZE);
            maxY = Math.max(maxY, c.y + HEX_SIZE);
        }
    }
    const pad = 6;
    const w = maxX - minX + 2 * pad;
    const h = maxY - minY + 2 * pad;
    const vb = `${minX - pad} ${minY - pad} ${w} ${h}`;

    // On fixe la taille NATURELLE (px) du SVG : ~1 hexagone reste à sa taille
    // réelle. Le CSS (max-width:100%) le rétrécit sur petit écran mais ne
    // l'agrandit jamais au-delà — évite les hexagones géants sur grand écran.
    let svg = `<svg viewBox="${vb}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" xmlns="http://www.w3.org/2000/svg">`;
    for (const { col, row, x, y } of centers) {
        const val = grid[row][col];
        const isHole = val === 'hole';
        const spawn = val.startsWith('spawn') ? val.slice(5) : null;
        const fill = isHole ? 'transparent' : (spawn ? palette.grass : palette[val]);
        svg += `<polygon class="hex${isHole ? ' hole' : ''}" points="${hexPoints(x, y)}"`
            + ` fill="${fill}" data-col="${col}" data-row="${row}"></polygon>`;
        if (spawn) {
            svg += `<text class="hex-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${spawn}</text>`;
        }
    }
    svg += `</svg>`;
    document.getElementById('board').innerHTML = svg;
    // Le fond de la zone de dessin reprend l'arrière-plan de la carte : le
    // designer juge ses couleurs dans les conditions du jeu.
    document.querySelector('.board-wrap').style.background = palette.background;

    updateOutput();
}

// Pinceau actif pendant un « trait » : clic GAUCHE = pinceau choisi, clic DROIT
// = trou (vide) par défaut. On lie les événements une seule fois sur le
// conteneur #board (qui persiste), et non sur chaque hexagone : render() recrée
// le SVG à chaque coup de pinceau, donc les nœuds changent. On retrouve la case
// sous le curseur via elementFromPoint, ce qui fiabilise le cliquer-glisser.
let strokeBrush = null;

function bindBoard() {
    const board = document.getElementById('board');
    // Pas de menu contextuel au clic droit : il sert à peindre des trous.
    board.addEventListener('contextmenu', (e) => e.preventDefault());

    board.addEventListener('pointerdown', (e) => {
        const el = e.target.closest && e.target.closest('.hex');
        if (!el) return;
        e.preventDefault();
        painting = true;
        strokeBrush = e.button === 2 ? 'hole' : brush;
        paintCell(el, strokeBrush);
    });

    // On peint tant que le bouton reste enfoncé (glissé). elementFromPoint donne
    // la case réellement sous le curseur, même après un re-render.
    board.addEventListener('pointermove', (e) => {
        if (!painting) return;
        const at = document.elementFromPoint(e.clientX, e.clientY);
        const el = at && at.closest && at.closest('.hex');
        if (el) paintCell(el, strokeBrush);
    });
}

function paintCell(el, useBrush) {
    const col = +el.dataset.col;
    const row = +el.dataset.row;
    if (grid[row][col] === useBrush) return; // rien à faire, évite un re-render inutile
    // Un point de départ est unique : peindre spawnN l'enlève d'abord d'ailleurs.
    if (useBrush.startsWith('spawn')) {
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++)
                if (grid[r][c] === useBrush) grid[r][c] = 'grass';
    }
    grid[row][col] = useBrush;
    render();
}

// --- Palette --------------------------------------------------------------
function buildPalette() {
    const pal = document.getElementById('palette');
    const entries = [
        ...Object.keys(TERRAINS).map((k) => ({ key: k, color: palette[k], label: TERRAINS[k].label, txt: '' })),
        ...SPAWNS.map((n) => ({ key: `spawn${n}`, color: palette.grass, label: `Départ ${n}`, txt: n })),
        { key: 'hole', color: '', label: 'Trou (vide)', hole: true, txt: '' },
    ];
    pal.innerHTML = entries.map((e) => `
        <div class="brush${e.key === brush ? ' active' : ''}" data-brush="${e.key}">
            <span class="swatch${e.hole ? ' hole' : ''}"${e.color ? ` style="background:${e.color}"` : ''}>${e.txt}</span>
            <span>${e.label}</span>
        </div>`).join('');
    pal.querySelectorAll('.brush').forEach((el) => {
        el.addEventListener('click', () => {
            brush = el.dataset.brush;
            pal.querySelectorAll('.brush').forEach((b) => b.classList.toggle('active', b === el));
        });
    });
}

// --- Couleurs de la carte -------------------------------------------------
// Un sélecteur de couleur par type de terrain. Chaque changement re-dessine le
// plateau ET la palette de pinceaux, pour un retour visuel immédiat.
function buildColorControls() {
    const box = document.getElementById('colors');
    box.innerHTML = Object.entries(TERRAINS).map(([key, t]) => `
        <label class="color-row">
            <input type="color" data-terrain="${key}" value="${palette[key]}">
            <span>${t.label}</span>
        </label>`).join('');
    box.querySelectorAll('input[type=color]').forEach((el) => {
        el.addEventListener('input', () => {
            palette[el.dataset.terrain] = el.value;
            buildPalette();
            render();
        });
    });

    const bg = document.getElementById('bgColor');
    bg.value = palette.background;
    bg.addEventListener('input', () => {
        palette.background = bg.value;
        render();
    });

    document.getElementById('resetColors').addEventListener('click', () => {
        palette = defaultPalette();
        syncColorInputs();
        buildPalette();
        render();
    });
}

// Recale les champs sur la palette courante (après une réinitialisation).
function syncColorInputs() {
    document.querySelectorAll('#colors input[type=color]').forEach((el) => {
        el.value = palette[el.dataset.terrain];
    });
    document.getElementById('bgColor').value = palette.background;
}

// --- Export ---------------------------------------------------------------
// Convertit la grille en dessin ASCII (grille stricte : col c = caractère 2*c).
function toAscii() {
    return grid.map((line) =>
        line.map((val) => {
            if (val === 'hole') return ' ';
            if (val.startsWith('spawn')) return val.slice(5);
            return TERRAINS[val].char;
        }).join(' ').replace(/\s+$/, ''), // une espace entre cases, on rogne la fin
    ).join('\n');
}

function countSpawns() {
    const found = new Set();
    for (const line of grid) for (const v of line) if (v.startsWith('spawn')) found.add(v);
    return found.size;
}
function countCells() {
    let n = 0;
    for (const line of grid) for (const v of line) if (v !== 'hole') n++;
    return n;
}

// Bloc `palette: {...}` limité aux couleurs RÉELLEMENT modifiées : une carte
// aux couleurs standard n'exporte aucune palette, et les clés omises retombent
// sur les défauts du moteur.
function buildPaletteBlock() {
    const base = defaultPalette();
    const changed = Object.keys(base).filter((k) => palette[k].toLowerCase() !== base[k].toLowerCase());
    if (changed.length === 0) return '';
    const lines = changed.map((k) => `            ${k}: '${palette[k]}',`).join('\n');
    return `        palette: {\n${lines}\n        },\n`;
}

function buildSnippet() {
    const id = (document.getElementById('mapId').value || 'ma-carte').trim();
    const name = (document.getElementById('mapName').value || 'Ma carte').trim();
    const art = toAscii().split('\n').map((l) => '            ' + l).join('\n');
    return `    defineAsciiMap({\n        id: '${id}',\n        name: '${name}',\n${buildPaletteBlock()}        art: \`\n${art}\n        \`,\n    }),`;
}

function updateOutput() {
    document.getElementById('output').textContent = buildSnippet();
    const spawns = countSpawns();
    const cells = countCells();
    document.getElementById('cellCount').textContent = cells;
    document.getElementById('stats').textContent =
        `${cells} cases · ${spawns} point(s) de départ`;
    const warn = document.getElementById('warn');
    if (spawns < 2) warn.textContent = '⚠ Il faut au moins 2 points de départ pour une carte jouable.';
    else warn.textContent = '';
}

// --- Actions d'export -----------------------------------------------------
function copyCode() {
    navigator.clipboard.writeText(buildSnippet()).then(() => {
        flash(document.getElementById('copy'), '✓ Copié !');
    });
}
function downloadCode() {
    const id = (document.getElementById('mapId').value || 'ma-carte').trim();
    const blob = new Blob([buildSnippet() + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${id}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
}
function flash(btn, msg) {
    const old = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = old; }, 1200);
}

// --- Initialisation -------------------------------------------------------
window.addEventListener('pointerup', () => { painting = false; strokeBrush = null; });
bindBoard();
document.getElementById('generate').addEventListener('click', makeGrid);
document.getElementById('copy').addEventListener('click', copyCode);
document.getElementById('download').addEventListener('click', downloadCode);
['mapId', 'mapName'].forEach((id) =>
    document.getElementById(id).addEventListener('input', updateOutput));

buildColorControls();
buildPalette();
makeGrid();
