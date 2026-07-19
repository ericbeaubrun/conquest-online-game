// Catalogue des SOUS-TYPES d'unités : les personnages qui occupent le plateau
// comme un soldat (déplacement, combat, territoire) mais n'en sont pas un
// ordinaire — invocations (squelette, arbre-druide, dragon) et créatures issues
// d'un envoûtement du sorcier (cochon, corbeau, grenouille).
//
// Un soldat ORDINAIRE n'a pas de champ `unit` ; toute unité de ce catalogue en
// porte un, égal à son `unit` (ou à son `id` par défaut). C'est ce marqueur qui
// leur interdit la fusion et les bonus (voir `isSummonedUnit`) — mais PAS les
// affinités : comme tout soldat, une unité de ce catalogue peut porter un
// élément. Elle en NAÎT parfois pourvue, selon son origine (un squelette hérite
// de celui de son invocateur, un arbre-druide de celui de l'arbre transformé,
// une créature d'envoûtement de celui de sa victime) ; sinon elle naît neutre et
// peut en gagner un plus tard, comme n'importe qui.
//
// Ce fichier est la source de vérité unique de leurs caractéristiques : sprite,
// statistiques de départ, libellé affiché, entretien et taille de rendu. Le
// reducer les fabrique toutes par `makeUnit`, l'interface les nomme par
// `unitLabel` et les dimensionne par `unitScale` — plus aucun cas particulier
// dispersé dans le code.
//
// Champs :
//   - `unit`    : marqueur porté par l'unité (défaut : `id`). Deux entrées
//                 peuvent partager un marqueur — les deux squelettes sont des
//                 « skeleton » aux statistiques différentes.
//   - `scale`   : taille de rendu en multiple d'une case (défaut 1). Le dragon
//                 déborde volontairement de la sienne.
//   - `upkeep`  : entretien or/tour (défaut 0 : une invocation est gratuite).
//   - `curseOf` : bonus que cette créature remplace, pour le sort du sorcier.
//   - `faces`   : sens dans lequel le SPRITE est dessiné (défaut 'right', comme
//                 tous les soldats). Une espèce dessinée vers la gauche demande
//                 le miroir INVERSE pour regarder du bon côté — voir
//                 `spriteFacesLeft`.

export const UNIT_KINDS = [
    {
        id: 'skeleton',
        label: 'Squelette',
        src: '/characters/lvl2/skeleton1.png',
        hp: 1,
        atk: 1,
        level: 1,
        upkeep: 1, // seule invocation à coûter de l'entretien
    },
    {
        id: 'skeleton2',
        unit: 'skeleton', // même espèce que ci-dessus, en plus robuste
        label: 'Squelette',
        src: '/characters/lvl5/skeleton2.png',
        hp: 2,
        atk: 2,
        level: 1,
        upkeep: 1,
    },
    {
        id: 'druidTree',
        label: 'Arbre-druide',
        src: '/characters/lvl4/druidTree.png',
        hp: 2,
        atk: 2,
        level: 2,
    },
    {
        id: 'dragon',
        label: 'Dragon',
        src: '/characters/dragon1.png',
        hp: 16,
        atk: 16,
        level: 1,
        scale: 1.6, // colosse : son sprite déborde de sa case
        faces: 'left', // dessiné tête à gauche, à rebours de la convention
    },
    // Renfort trouvé dans un coffre (butin « gobelin ») : petite créature alliée,
    // gratuite mais chétive.
    {
        id: 'goblin',
        label: 'Gobelin',
        src: '/characters/gobelin1.png',
        hp: 1,
        atk: 2,
        level: 1,
    },
    // --- Créatures d'envoûtement (bonus « Sorcier ») ---
    // Elles REMPLACENT un soldat existant : il garde son propriétaire, sa case
    // et son affinité, mais tombe à 1/1 et perd tout effet.
    {id: 'pig', label: 'Cochon', src: '/characters/pig.png', hp: 1, atk: 1, level: 1, curseOf: 'king'},
    // Sprite dessiné bec à gauche, à rebours de la convention : son miroir est
    // donc inversé (voir `spriteFacesLeft`).
    {id: 'crow', label: 'Corbeau', src: '/characters/crow.png', hp: 1, atk: 1, level: 1, curseOf: 'warlock', faces: 'left'},
    {id: 'frog', label: 'Grenouille', src: '/characters/frog.png', hp: 1, atk: 1, level: 1, curseOf: 'conqueror'},
];

const BY_ID = Object.fromEntries(UNIT_KINDS.map((k) => [k.id, k]));
// Recherche par MARQUEUR (`u.unit`) et non par id : c'est tout ce que porte une
// unité posée. Les deux squelettes partageant un marqueur, le premier gagne —
// ils n'ont de toute façon que leurs statistiques de départ qui diffèrent.
const BY_UNIT = {};
for (const k of UNIT_KINDS) {
    const marker = k.unit ?? k.id;
    if (!BY_UNIT[marker]) BY_UNIT[marker] = k;
}

// Espèce d'une unité POSÉE (d'après son marqueur), ou `null` pour un soldat
// ordinaire — qui n'appartient à aucune de ces espèces.
export const unitKind = (u) => (u?.unit ? BY_UNIT[u.unit] ?? null : null);

// Espèce par identifiant de catalogue (pour fabriquer une unité neuve).
export const unitKindById = (id) => BY_ID[id] ?? null;

// Une unité est-elle INVOQUÉE / ENVOÛTÉE ? Elle ne fusionne jamais et ne porte
// jamais de bonus. Test unique partagé par le moteur et l'interface.
export const isSummonedUnit = (u) => !!u && !!u.unit;

// Squelette (les deux variantes) — défi « Chevalier noir ».
export const isSkeleton = (u) => u?.unit === 'skeleton';

// Libellé affiché d'une unité invoquée (« Dragon », « Cochon »…), `null` pour un
// soldat ordinaire, qui est nommé par son rang et son bonus.
export const unitLabel = (u) => unitKind(u)?.label ?? null;

// Taille de rendu d'une unité, en multiple d'une case. 1 par défaut : seules les
// espèces qui déclarent une `scale` (le dragon) sortent de leur case.
export const unitScale = (u) => unitKind(u)?.scale ?? 1;

// Le SPRITE de cette unité est-il dessiné tourné vers la gauche ? Faux pour un
// soldat ordinaire et pour la plupart des espèces : la convention du jeu veut
// des sprites tournés vers la droite. Les rares exceptions (le corbeau) le
// déclarent, et le rendu inverse alors son miroir pour qu'elles regardent
// réellement du côté où elles vont.
export const spriteFacesLeft = (u) => unitKind(u)?.faces === 'left';

// Entretien or/tour d'une unité invoquée (0 pour la plupart).
export const unitUpkeep = (u) => unitKind(u)?.upkeep ?? 0;

// Créature qui remplace le porteur de ce bonus quand le sorcier l'envoûte.
export const curseFor = (bonusId) => UNIT_KINDS.find((k) => k.curseOf === bonusId) ?? null;

// Ce bonus est-il envoûtable par le sorcier ?
export const isCursable = (bonusId) => !!bonusId && !!curseFor(bonusId);
