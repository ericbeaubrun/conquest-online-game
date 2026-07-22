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
//                  Les poids ci-dessous totalisent 100, ils se lisent donc
//                  directement en pourcentage : 47 % d'or, 20 % de statistique,
//                  20 % de gobelin, 10 % d'affinité élémentaire et 3 % de
//                  bouclier. Plus la somme d'or est grande, plus elle est rare.
//   - `gold`     : or versé au ramassage, OU
//   - `hp`/`atk` : points de vie / attaque gagnés par le ramasseur (plafonnés
//                  aux maximums du jeu), OU
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
    {id: 'gold5', label: '15 or', src: '/coin.png', weight: 14, gold: 15},
    {id: 'gold10', label: '30 or', src: '/coin.png', weight: 12, gold: 30},
    {id: 'gold20', label: '60 or', src: '/coin.png', weight: 10, gold: 60},
    {id: 'gold30', label: '90 or', src: '/coin.png', weight: 6, gold: 90},
    {id: 'gold40', label: '120 or', src: '/coin.png', weight: 3, gold: 120},
    {id: 'gold50', label: '150 or', src: '/coin.png', weight: 2, gold: 150},
    // --- Statistiques (20 %) ---
    {id: 'heart', label: 'Cœur', src: '/heart.png', weight: 10, hp: 1},
    {id: 'sword', label: 'Épée', src: '/sword.png', weight: 10, atk: 1},
    // --- Renfort (20 %) ---
    {id: 'goblin', label: 'Gobelin', src: '/characters/gobelin1.png', weight: 20, unit: 'goblin'},
    // --- Affinités (10 %) ---
    {id: 'fire', label: 'Affinité de feu', src: '/fire.png', weight: 4, affinity: 'fire'},
    {id: 'ice', label: 'Affinité de glace', src: '/ice.png', weight: 3, affinity: 'ice'},
    {id: 'lightning', label: 'Affinité de foudre', src: '/thunder.png', weight: 3, affinity: 'lightning'},
    // --- Trouvaille exceptionnelle (3 %) ---
    // Le bouclier ne s'achète pas : hors du bonus « Paladin », ce coffre est le
    // SEUL moyen de l'obtenir — d'où sa rareté.
    {id: 'shield', label: 'Bouclier', src: '/bouclier.png', weight: 3, affinity: SHIELD_AFFINITY},
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

export const lootSrc = (loot) => lootKind(loot).src;
export const lootLabel = (loot) => lootKind(loot).label;
export const lootGold = (loot) => lootKind(loot).gold ?? 0;
export const lootHp = (loot) => lootKind(loot).hp ?? 0;
export const lootAtk = (loot) => lootKind(loot).atk ?? 0;
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
