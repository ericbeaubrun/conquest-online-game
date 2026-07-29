// Coffres et leur butin.
//
// Un coffre est un item neutre `{type: 'chest'}` qui apparaît au fil de la
// partie, comme un arbre. Un soldat adjacent peut l'OUVRIR (action de contact,
// exactement comme l'abattage) : le coffre disparaît et laisse à sa place un
// BUTIN `{type: 'loot', kind}`, que n'importe quel soldat récupère ensuite en se
// DÉPLAÇANT sur la case. Ouvrir consomme le tour du soldat ; ramasser aussi.
//
// Chaque butin porte :
//   - `weight`   : coefficient d'apparition, tiré comme les essences d'arbres
//                  (roulette pondérée sur le PRNG semé — voir `pickLootKind`).
//                  Les poids sont relatifs les uns aux autres (leur somme sert
//                  de dénominateur) : l'or domine, puis les statistiques, les
//                  renforts, les affinités et enfin le bouclier. Plus la somme
//                  d'or est grande, plus elle est rare.
//   - `gold`     : or versé au ramassage, OU
//   - `hp`/`atk` : points de vie / attaque gagnés par le ramasseur (plafonnés
//                  aux maximums du jeu) — les deux peuvent coexister sur un même
//                  butin (l'élixir de vigueur donne +1/+1), OU
//   - `invert`   : échange les PV et l'attaque du ramasseur (breuvage
//                  d'inversion) — sans rien ajouter, OU
//   - `affinity` : élément donné au ramasseur (s'il n'en a pas déjà), OU
//   - `unit`     : espèce du catalogue `units.js` ralliée dès l'ouverture.

import {SHIELD_AFFINITY} from '../engine/rules.js';

export const CHEST_SRC = '/characters/chest.png';

export const LOOT_KINDS = [
    // --- Or (47 %) : plus la somme est grosse, plus elle est rare ---
    // ATTENTION : l'`id` est une clé de TRANSPORT (il voyage sur le réseau et
    // dort dans les parties sauvegardées) ; il ne suit donc PAS le montant quand
    // celui-ci est rééquilibré. `gold5` vaut 15 or, et c'est normal — seul
    // `gold` fait foi. Les montants sont calés sur la boutique : le plus gros
    // coffre vaut ~1,5 soldat de niveau 2, un beau coup de chance mais jamais
    // une partie gagnée.
    {id: 'gold5', label: '15 or', src: '/coin15.png', weight: 15, gold: 15},
    {id: 'gold10', label: '30 or', src: '/coin30.png', weight: 12, gold: 30},
    {id: 'gold20', label: '60 or', src: '/coin60.png', weight: 8, gold: 60},
    {id: 'gold30', label: '90 or', src: '/coin90.png', weight: 5, gold: 90},
    {id: 'gold40', label: '120 or', src: '/coin120.png', weight: 2, gold: 120},
    {id: 'gold50', label: '150 or', src: '/coin150.png', weight: 1, gold: 150},
    // --- Statistiques ---
    {id: 'heart', label: 'Cœur', src: '/heart.png', weight: 12, hp: 1},
    {id: 'sword', label: 'Épée', src: '/sword.png', weight: 12, atk: 1},
    // L'élixir de vigueur cumule les deux effets (+1/+1).
    {id: 'potion', label: 'Élixir de vigueur', src: '/potion1.png', weight: 8, hp: 1, atk: 1},
    // Le breuvage d'inversion n'ajoute rien : il ÉCHANGE les PV et l'attaque du
    // ramasseur — décisif sur un soldat très déséquilibré, dangereux sur un
    // soldat équilibré. Plus rare que l'élixir.
    {id: 'potion2', label: "Breuvage d'inversion", src: '/potion2.png', weight: 5, invert: true},
    // --- Renfort ---
    {id: 'goblin', label: 'Gobelin', src: '/characters/gobelin1.png', weight: 8, unit: 'goblin'},
    {id: 'skeleton', label: 'Squelette', src: '/characters/lvl2/skeleton1.png', weight: 5, unit: 'skeleton'},
    // --- Affinités ---
    {id: 'fire', label: 'Affinité de feu', src: '/fire.png', weight: 3, affinity: 'fire'},
    {id: 'ice', label: 'Affinité de glace', src: '/ice.png', weight: 3, affinity: 'ice'},
    {id: 'lightning', label: 'Affinité de foudre', src: '/thunder.png', weight: 3, affinity: 'lightning'},
    // --- Trouvaille exceptionnelle ---
    // Le bouclier s'achète aussi en boutique (180 or), mais reste rare en coffre.
    {id: 'shield', label: 'Bouclier', src: '/bouclier.png', weight: 2, affinity: SHIELD_AFFINITY},
];

// Raretés déduites du coefficient d'apparition, comme pour les arbres : changer
// un poids change automatiquement la rareté affichée. Seuil = coefficient
// MINIMUM de la tranche, du plus courant au plus rare.
export const LOOT_RARITIES = [
    {id: 'common', label: 'Ordinaire', min: 10},   // ≥ 10 % des ouvertures
    {id: 'uncommon', label: 'Atypique', min: 5},   // 5 à 9 %
    {id: 'rare', label: 'Rare', min: 0},           // < 5 %
];

// Butin par défaut : repli si un id inconnu arrive du réseau.
export const DEFAULT_LOOT_KIND = 'gold5';

const BY_ID = Object.fromEntries(LOOT_KINDS.map((k) => [k.id, k]));

// Nature d'un butin posé (tolérante : id manquant ou inconnu -> butin de base).
export const lootKind = (loot) => BY_ID[loot?.kind] ?? BY_ID[DEFAULT_LOOT_KIND];

// `lootSrc`/`lootGold` lisent d'abord un champ PORTÉ DIRECTEMENT par le butin
// (`gold`/`src`) avant de retomber sur le catalogue par `kind` — un butin de
// coffre n'a jamais ces champs (il ne porte qu'un `kind`) donc rien ne change
// pour lui, mais ça laisse un AUTRE producteur de butin (la potion de
// sacrifice, voir `reducePlaceSacrifice`) poser un montant CALCULÉ, hors
// catalogue, sans avoir à inventer une entrée `LOOT_KINDS` par montant possible.
export const lootSrc = (loot) => loot?.src ?? lootKind(loot).src;
export const lootLabel = (loot) => lootKind(loot).label;
export const lootGold = (loot) => loot?.gold ?? lootKind(loot).gold ?? 0;
export const lootHp = (loot) => lootKind(loot).hp ?? 0;
export const lootAtk = (loot) => lootKind(loot).atk ?? 0;
export const lootInvert = (loot) => lootKind(loot).invert ?? false;
export const lootAffinity = (loot) => lootKind(loot).affinity ?? null;
export const lootUnit = (loot) => lootKind(loot).unit ?? null;

// Rareté d'un butin : la première tranche dont le seuil est atteint.
export const lootRarity = (loot) => {
    const {weight} = lootKind(loot);
    return LOOT_RARITIES.find((r) => weight >= r.min) ?? LOOT_RARITIES[LOOT_RARITIES.length - 1];
};

const TOTAL_WEIGHT = LOOT_KINDS.reduce((sum, k) => sum + k.weight, 0);

// Tirage d'un butin au coefficient d'apparition (roulette pondérée). Utilise le
// PRNG semé du moteur : même graine => même butin des deux côtés du réseau.
export function pickLootKind(rng) {
    let roll = rng.int(TOTAL_WEIGHT);
    for (const k of LOOT_KINDS) {
        roll -= k.weight;
        if (roll < 0) return k.id;
    }
    return DEFAULT_LOOT_KIND;
}

// Nouveau coffre à poser sur le plateau. Son contenu n'est PAS tiré ici : il ne
// l'est qu'à l'ouverture, pour que la graine consommée dépende des actions des
// joueurs et non du simple hasard de l'apparition.
export const makeChest = () => ({type: 'chest'});

// Butin laissé par un coffre ouvert, de nature tirée au sort.
export const makeLoot = (rng) => ({type: 'loot', kind: pickLootKind(rng)});

// Paliers d'icône « pièces » (mêmes images que le butin d'or des coffres),
// dérivés du catalogue ci-dessus pour qu'une seule liste fasse foi : une pièce
// vaut l'icône du plus gros palier de coffre qu'elle égale ou dépasse (au-delà
// du plus gros palier, elle garde son icône). Sert à un montant CALCULÉ plutôt
// que tiré au sort — voir la potion de sacrifice.
const COIN_TIERS = LOOT_KINDS
    .filter((k) => k.gold)
    .map((k) => ({threshold: k.gold, src: k.src}))
    .sort((a, b) => b.threshold - a.threshold);

export const coinSrcForGold = (amount) =>
    (COIN_TIERS.find((t) => amount >= t.threshold) ?? COIN_TIERS[COIN_TIERS.length - 1]).src;
