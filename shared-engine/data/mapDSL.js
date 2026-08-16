// Outil de création de cartes personnalisées « en ASCII ».
//
// Au lieu de calculer des coordonnées hexagonales à la main, un level designer
// DESSINE la carte dans une chaîne de texte : une ligne = une rangée de cases,
// un caractère = une case. Les espaces laissent un trou, ce qui permet des
// formes totalement libres (îles, croix, sabliers…) sans effort.
//
// Légende par défaut (voir LEGEND ci-dessous) :
//   .  herbe        ~  eau          T  forêt
//   ^  montagne     _  sable        (espace) : pas de case (trou)
//   1 2 3 4  : point de départ du joueur (posé sur de l'herbe)
//
// RÈGLE : grille stricte. Une case toutes les 2 colonnes (les cases sont
// séparées par UNE espace), et on n'indente pas les rangées les unes par
// rapport aux autres. La forme dessinée est alors exactement la forme obtenue
// à l'écran (le moteur ajoute seul le décalage en quinconce, d'où des bords en
// zigzag). Une espace au milieu du dessin = un trou, ce qui autorise n'importe
// quelle forme (croix, sablier, île…).
//
// Exemple minimal (colonne d'eau au centre, 2 joueurs) :
//   const carte = defineAsciiMap({
//       id: 'ma-carte', name: 'Ma carte',
//       art: `
//         1 . . . ~ . . . 2
//         . . T . ~ . T . .
//         . . . . . . . . .
//       `,
//   });

import { hexId, getNeighbors } from './hex.js';

// Caractère du dessin -> type de terrain du moteur.
export const LEGEND = {
    '.': 'grass',
    T: 'forest',
    '^': 'mountain',
    _: 'sand',
    '~': 'water',
};

// Caractères réservés aux points de départ (l'index dans la chaîne = n° joueur).
const SPAWN_CHARS = '1234';

// Convertit une position en grille en quinconce (col, row) vers l'axial q/r
// « odd-q » utilisé partout ailleurs dans le jeu (cf. rectShape de maps.js).
function offsetToAxial(col, row) {
    return { q: col, r: row - Math.floor(col / 2) };
}

// Empêche une base (ou ses voisins) de se retrouver sur de l'eau : elle serait
// alors inconquérable. On force la terre ferme autour de chaque spawn.
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

// Analyse le dessin ASCII et renvoie { cells, spawns }.
// `legend` permet d'ajouter/redéfinir des symboles de terrain au besoin.
export function parseAsciiMap(art, legend = LEGEND) {
    // On retire les lignes vides de début/fin mais on garde l'indentation
    // interne (utile pour aligner visuellement les rangées décalées).
    const lines = art.replace(/\t/g, ' ').split('\n');

    // Les rangées vides du dessin sont VOLONTAIRES : elles n'ajoutent aucune
    // case mais agrandissent le cadre de la carte (marge de décor, cf.
    // `buildGeometry`). On les compte avant de les retirer. Les toutes
    // premières/dernières lignes sont l'artefact du littéral `…` (retour à la
    // ligne après l'anti-quote, indentation avant la fermante) : elles ne
    // comptent pas.
    if (lines.length && lines[0].trim() === '') lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

    let top = 0;
    let bottom = 0;
    while (lines.length && lines[0].trim() === '') { lines.shift(); top++; }
    while (lines.length && lines[lines.length - 1].trim() === '') { lines.pop(); bottom++; }

    // Décalage commun à retirer : la plus petite indentation parmi les lignes
    // non vides, pour pouvoir écrire l'art indenté dans le code source.
    const indent = Math.min(
        ...lines.filter((l) => l.trim() !== '').map((l) => l.match(/^ */)[0].length),
    );

    const cells = [];
    const spawnsByPlayer = {};

    lines.forEach((line, row) => {
        const body = line.slice(indent);
        // Grille STRICTE : une case toutes les 2 colonnes de caractères (les
        // cases sont séparées par une espace pour rester lisibles). La colonne
        // logique est donc i/2. On ne touche PAS au décalage en quinconce : il
        // est appliqué automatiquement par offsetToAxial, si bien que la forme
        // dessinée est exactement la forme obtenue à l'écran (bords en zigzag).
        for (let i = 0; i < body.length; i += 2) {
            const ch = body[i];
            if (ch === undefined || ch === ' ') continue;
            const col = i / 2;
            const { q, r } = offsetToAxial(col, row);

            const spawnIdx = SPAWN_CHARS.indexOf(ch);
            if (spawnIdx !== -1) {
                spawnsByPlayer[spawnIdx] = { q, r };
                cells.push({ q, r, type: 'grass' });
                continue;
            }

            const type = legend[ch];
            if (type === undefined) {
                throw new Error(`Symbole de carte inconnu : « ${ch} » (ligne ${row + 1})`);
            }
            cells.push({ q, r, type });
        }
    });

    // Spawns triés par numéro de joueur ; on vérifie qu'ils sont contigus (1,2,3…).
    const spawns = Object.keys(spawnsByPlayer)
        .map(Number)
        .sort((a, b) => a - b)
        .map((k) => spawnsByPlayer[k]);

    if (spawns.length < 2) {
        throw new Error(`Une carte a besoin d'au moins 2 points de départ (trouvés : ${spawns.length}).`);
    }

    return { cells: clearWaterAroundSpawns(cells, spawns), spawns, margin: { top, bottom } };
}

// Fabrique une carte complète prête pour le registre MAPS à partir d'un dessin.
// `description` est déduite automatiquement si non fournie.
// `palette` (facultatif) donne à la carte ses propres couleurs de terrain et
// son fond : couleurs de terrain, `opacity` par type, `background` et, de façon
// facultative, `backgroundImage` + `backgroundRatio`. Sans image, la couleur de
// fond reste seule. Les clés omises gardent leur valeur par défaut.
export function defineAsciiMap({ id, name, description, art, legend, palette }) {
    const { cells, spawns, margin } = parseAsciiMap(art, legend);
    return {
        id,
        name,
        description: description ?? `${spawns.length} joueurs · ${cells.length} cases`,
        spawns,
        palette,
        margin,
        cells,
    };
}
