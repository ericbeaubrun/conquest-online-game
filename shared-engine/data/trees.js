// Types d'arbres (essences). Un arbre posé sur le plateau est un item
// `{type: 'tree', kind}` où `kind` est l'id d'une essence de ce catalogue.
//
// Chaque essence porte :
//   - `weight`   : coefficient d'apparition. Plus il est élevé, plus l'essence a
//                  de chances d'être tirée LORS d'une apparition d'arbre. Il ne
//                  change PAS la fréquence des apparitions elle-même (réglée par
//                  `treeSpawnChance` / `treeSpawnMin` / `treeSpawnMax`) : il ne
//                  décide que de l'essence tirée. Les poids ci-dessous totalisent
//                  100, ils se lisent donc directement en pourcentage.
//   - `reward`   : multiplicateur appliqué à l'or d'abattage (`treeReward`).
//   - `affinity` : élément de l'arbre (feu / glace / foudre), ou `null`.
//
// Un arbre à affinité ne peut PAS être abattu par un soldat portant la MÊME
// affinité (les éléments s'annulent, comme au combat — voir `canFight`), et
// DONNE son affinité au soldat sans affinité qui l'abat (voir `reduceChop`).

export const TREE_KINDS = [
    {id: 'forest', label: 'Arbre', src: '/trees/forestTree.png', weight: 54, reward: 1, affinity: null},
    {id: 'fire', label: 'Arbre de feu', src: '/trees/fireTree.png', weight: 4, reward: 2, affinity: 'fire'},
    {id: 'ice', label: 'Arbre de glace', src: '/trees/IceTree.png', weight: 4, reward: 2, affinity: 'ice'},
    {id: 'lightning', label: 'Arbre de foudre', src: '/trees/lightningTree.png', weight: 4, reward: 2, affinity: 'lightning'},
    {id: 'special1', label: 'Arbre mort', src: '/trees/specialTree1.png', weight: 10, reward: 0.5, affinity: null},
    {id: 'special2', label: 'Arbre enneigé', src: '/trees/specialTree2.png', weight: 8, reward: 1.5, affinity: null},
    {id: 'special3', label: 'Bouleau', src: '/trees/specialTree3.png', weight: 6, reward: 2, affinity: null},
    {id: 'special4', label: 'Arbre à lianes', src: '/trees/specialTree4.png', weight: 5, reward: 2, affinity: null},
    {id: 'special5', label: 'Arbre à fruits', src: '/trees/specialTree5.png', weight: 3, reward: 3, affinity: null},
    {id: 'special6', label: 'Arbre à fleurs', src: '/trees/specialTree6.png', weight: 2, reward: 4, affinity: null},
];

// Raretés, déduites du coefficient d'apparition (et non saisies à la main : une
// essence dont on change le poids change automatiquement de rareté). Seuil =
// coefficient MINIMUM de la tranche, du plus courant au plus rare.
export const TREE_RARITIES = [
    {id: 'common', label: 'Ordinaire', min: 10},   // ≥ 10 % des apparitions
    {id: 'uncommon', label: 'Atypique', min: 4},   // 4 à 9 %
    {id: 'rare', label: 'Rare', min: 0},           // < 4 %
];

// Essence par défaut : celle des arbres sans `kind` (parties d'avant l'ajout des
// essences, et repli si un id inconnu arrive du réseau).
export const DEFAULT_TREE_KIND = 'forest';

const BY_ID = Object.fromEntries(TREE_KINDS.map((k) => [k.id, k]));

// Essence d'un arbre posé (tolérante : id manquant ou inconnu -> essence de base).
export const treeKind = (tree) => BY_ID[tree?.kind] ?? BY_ID[DEFAULT_TREE_KIND];

export const treeSrc = (tree) => treeKind(tree).src;
export const treeLabel = (tree) => treeKind(tree).label;
export const treeAffinity = (tree) => treeKind(tree).affinity;

// Rareté d'une essence : la première tranche dont le seuil est atteint.
export const treeRarity = (tree) => {
    const {weight} = treeKind(tree);
    return TREE_RARITIES.find((r) => weight >= r.min) ?? TREE_RARITIES[TREE_RARITIES.length - 1];
};

// Or gagné en abattant `tree`, à partir de la récompense de base configurée.
// Arrondi à l'entier inférieur : les multiplicateurs fractionnaires (0,5 / 1,5)
// ne doivent pas introduire d'or décimal dans les bourses.
export const treeReward = (tree, baseReward) => Math.floor(baseReward * treeKind(tree).reward);

const TOTAL_WEIGHT = TREE_KINDS.reduce((sum, k) => sum + k.weight, 0);

// Tirage d'une essence au coefficient d'apparition (roulette pondérée). Utilise
// le PRNG semé du moteur : même graine => même essence des deux côtés du réseau.
export function pickTreeKind(rng) {
    let roll = rng.int(TOTAL_WEIGHT);
    for (const k of TREE_KINDS) {
        roll -= k.weight;
        if (roll < 0) return k.id;
    }
    return DEFAULT_TREE_KIND;
}

// Nouvel arbre à poser sur le plateau, d'essence tirée au sort.
export const makeTree = (rng) => ({type: 'tree', kind: pickTreeKind(rng)});

// Un soldat peut-il abattre cet arbre ? Non s'il porte la MÊME affinité que
// l'arbre : leurs éléments s'annulent (même règle que `canFight`). Fonction PURE
// partagée par `computeReachable` (cibles proposées) et le reducer (validation).
export function canChopTree(soldier, tree) {
    const affinity = treeAffinity(tree);
    return !(affinity && soldier?.affinity === affinity);
}
