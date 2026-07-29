import {
    BONUS_OFFERS,
    SOLDIER_SKINS,
    bonusTotalUpkeep,
    soldierCostForLevel,
} from '@conquest/shared-engine/data/soldier.js';
import {UNIT_KINDS} from '@conquest/shared-engine/data/units.js';
import {
    ITEMS,
    AFFINITY_ITEMS,
    SACRIFICE_POTION_ITEM,
    SACRIFICE_GOLD_PER_POINT,
} from '@conquest/shared-engine/data/items.js';
import {
    TREE_KINDS,
    treeRarity,
} from '@conquest/shared-engine/data/trees.js';
import {
    CHEST_SRC,
    LOOT_KINDS,
    lootRarity,
} from '@conquest/shared-engine/data/chests.js';
import {
    TERRAIN_COLORS,
    TERRAIN_LABELS,
} from '@conquest/shared-engine/data/terrain.js';
import {
    BUILDING_STATS,
    BUILDING_UPKEEP,
    SOLDIER_LEVEL_STATS,
    SOLDIER_UPKEEP,
    TREE_REWARD,
} from '@conquest/shared-engine/engine/rules.js';

// Le halo appartient aux données de la carte, pas au carousel : une carte pourra
// ainsi garder son identité visuelle lorsqu'elle sera réutilisée in-game.
const GLOW_COLORS = {
    white: '#f4f7ff',
    brown: '#9a633d',
    green: '#55c878',
    red: '#e45252',
    yellow: '#f1cf4f',
    orange: '#f18a45',
    violet: '#a767d8',
    blue: '#5597e8',
    pink: '#ed82b2',
};

const LEVEL_GLOWS = {
    1: '#8b98a8',
    2: '#4fa8e8',
    3: '#a36ce5',
    4: '#efad45',
    5: '#ff685f',
};

const HERO_GLOWS = {
    lumberjack: GLOW_COLORS.brown,
    adventurer: GLOW_COLORS.green,
    thief: GLOW_COLORS.green,
    farmer: GLOW_COLORS.brown,
    undead: GLOW_COLORS.red,
    ninja: '#6c65a9',
    warrior: GLOW_COLORS.yellow,
    monk: GLOW_COLORS.orange,
    viking: GLOW_COLORS.white,
    vampire: '#bd4f6d',
    magician: GLOW_COLORS.yellow,
    alchemist: GLOW_COLORS.violet,
    priest: '#e8d98d',
    blackKnight: GLOW_COLORS.red,
    paladin: '#f0c86b',
    druid: '#5db47a',
    sorcerer: GLOW_COLORS.blue,
    warlock: GLOW_COLORS.red,
    king: '#f1b94d',
    conqueror: '#ff7658',
};

const CREATURE_GLOWS = {
    skeleton: GLOW_COLORS.red,
    skeleton2: GLOW_COLORS.red,
    dragon: GLOW_COLORS.yellow,
};

const TREE_GLOWS = {
    special2: GLOW_COLORS.white,
    special4: GLOW_COLORS.green,
    special5: GLOW_COLORS.green,
    special6: GLOW_COLORS.pink,
};

const AFFINITY_GLOWS = {
    fire: '#ff633e',
    ice: '#64c8ef',
    lightning: '#f2d54b',
    shield: '#a3b7cf',
};

const AFFINITY_ICONS = Object.fromEntries(
    AFFINITY_ITEMS.map((affinity) => [
        affinity.id,
        {src: affinity.src, label: affinity.name},
    ]),
);

const LOOT_TOTAL_WEIGHT = LOOT_KINDS.reduce(
    (total, loot) => total + loot.weight,
    0,
);
const percentageFormatter = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 1,
});
const lootAppearancePercentage = (loot) =>
    `${percentageFormatter.format((loot.weight / LOOT_TOTAL_WEIGHT) * 100)} %`;

const challengeText = (bonus) => {
    if (typeof bonus.challenge === 'string') return bonus.challenge;
    return bonus.challenge?.describe?.(0, bonus.challenge.goal) ?? 'Aucun défi';
};

const lootEffect = (loot) => {
    const effects = [];
    if (loot.gold) effects.push(`+${loot.gold} or`);
    if (loot.hp) effects.push(`+${loot.hp} PV`);
    if (loot.atk) effects.push(`+${loot.atk} ATK`);
    if (loot.invert) effects.push('Inverse ATK et PV');
    if (loot.affinity) effects.push(`Donne l’affinité ${loot.affinity}`);
    if (loot.unit) effects.push(`Rallie un ${loot.label.toLowerCase()}`);
    return effects.join(' · ');
};

const soldierEntries = Object.entries(SOLDIER_LEVEL_STATS).map(([level, stats]) => ({
    id: `soldier-${level}`,
    title: 'Soldat',
    eyebrow: 'Rang militaire',
    image: SOLDIER_SKINS[level],
    level: Number(level),
    glow: GLOW_COLORS.white,
    description:
        Number(level) < 5
            ? `Deux soldats de niveau ${level} peuvent fusionner pour atteindre le rang suivant.`
            : 'Le rang ultime : sa puissance d’attaque atteint le maximum naturel.',
    combat: {atk: stats.atk, hp: stats.hp},
    economy: {
        price: soldierCostForLevel(Number(level)),
        upkeep: SOLDIER_UPKEEP[level],
    },
    badge: 'SOLDAT',
}));

const bonusEntries = BONUS_OFFERS.map((bonus) => ({
    id: `bonus-${bonus.id}`,
    title: bonus.label,
    eyebrow: 'Héros',
    image: bonus.src,
    level: bonus.requiredLevel,
    glow: HERO_GLOWS[bonus.id] ?? LEVEL_GLOWS[bonus.requiredLevel],
    description: bonus.effect,
    challenge: challengeText(bonus),
    combat: {atk: bonus.stats.atk, hp: bonus.stats.hp},
    economy: {
        price: bonus.price ?? 0,
        upkeep: bonusTotalUpkeep(bonus),
    },
    badge: 'BONUS',
}));

const creatureEntries = UNIT_KINDS.map((unit) => ({
    id: `creature-${unit.id}`,
    title: unit.label,
    eyebrow: unit.curseOf ? 'Créature envoûtée' : 'Créature',
    image: unit.src,
    glow: CREATURE_GLOWS[unit.id]
        ?? (unit.curseOf ? '#8d65b5' : (AFFINITY_GLOWS[unit.affinity] ?? '#75b784')),
    description: unit.curseOf
        ? 'Une forme maudite : elle conserve son camp et son affinité, mais perd tout bonus.'
        : 'Une unité spéciale qui ne peut ni fusionner, ni recevoir de bonus de héros.',
    combat: {atk: unit.atk, hp: unit.hp},
    economy: {upkeep: unit.upkeep ?? 0},
    badge: unit.curseOf ? 'MAUDIT' : 'UNITÉ',
}));

const buildingDescriptions = {
    base: 'Le cœur de votre royaume. Sa destruction peut décider de la partie.',
    house: 'Produit de l’or à chaque tour et soutient l’économie du territoire.',
    attackTower: 'Une fortification offensive qui inflige de lourds dégâts en riposte.',
    defenseTower: 'Une fortification robuste, conçue pour verrouiller une frontière.',
};

const buildingItems = ITEMS.filter((item) => item.id !== 'soldier');
const buildingEntries = [
    {
        id: 'building-base',
        title: 'Base',
        eyebrow: 'Bâtiment principal',
        image: '/base.png',
        cost: null,
        glow: '#e5c15d',
    },
    ...buildingItems.map((item) => ({
        id: `building-${item.id}`,
        title: item.name,
        eyebrow: 'Construction',
        image: item.src,
        cost: item.cost,
        glow: item.id === 'house'
            ? '#69bd72'
            : item.id === 'attackTower'
                ? '#e96752'
                : '#659bd4',
    })),
].map((entry) => {
    const type = entry.id.replace('building-', '');
    const stats = BUILDING_STATS[type];
    return {
        ...entry,
        description: buildingDescriptions[type],
        combat: {atk: stats?.atk, hp: stats?.hp},
        economy: {
            price: entry.cost,
            upkeep: BUILDING_UPKEEP[type] ?? 0,
        },
        badge: type === 'base' ? 'CAPITALE' : 'BÂTIMENT',
    };
});

const affinityDescriptions = {
    fire: 'Refuse le combat contre le feu. Se combine aux autres éléments lors d’une fusion.',
    ice: 'Refuse le combat contre la glace. Se combine aux autres éléments lors d’une fusion.',
    lightning: 'Refuse le combat contre la foudre. Se combine aux autres éléments lors d’une fusion.',
    shield: 'Ne combat ni les unités neutres, ni les autres porteurs d’un bouclier.',
};

const affinityEntries = AFFINITY_ITEMS.map((affinity) => ({
    id: `affinity-${affinity.id}`,
    title: affinity.name,
    eyebrow: 'Affinité',
    image: affinity.src,
    glow: AFFINITY_GLOWS[affinity.id],
    description: affinityDescriptions[affinity.id],
    economy: {price: affinity.cost},
    details: [
        {label: 'Cible', value: 'Soldat sans affinité'},
    ],
    badge: 'ÉLÉMENT',
}));

const potionEntries = [
    {
        id: 'potion-sacrifice',
        title: SACRIFICE_POTION_ITEM.name,
        eyebrow: 'Potion',
        image: SACRIFICE_POTION_ITEM.src,
        glow: '#e5b93a',
        description: `Transforme le soldat allié ciblé en un tas d’or au sol, à ramasser en s’y déplaçant.`,
        economy: {price: SACRIFICE_POTION_ITEM.cost},
        details: [
            {label: 'Cible', value: 'Soldat allié'},
            {label: 'Valeur du tas', value: `(ATK + PV) × ${SACRIFICE_GOLD_PER_POINT} or`},
        ],
        badge: 'POTION',
    },
];

const treeEntries = TREE_KINDS.map((tree) => ({
    id: `tree-${tree.id}`,
    title: tree.label,
    eyebrow: 'Essence naturelle',
    image: tree.src,
    glow: TREE_GLOWS[tree.id]
        ?? AFFINITY_GLOWS[tree.affinity]
        ?? (tree.id === 'forest' ? '#5aa86d' : '#d0a85d'),
    description: tree.affinity
        ? `Transmet l’affinité ${tree.affinity} au soldat neutre qui l’abat.`
        : 'Peut être abattu par un soldat adjacent pour récolter de l’or.',
    economy: {reward: Math.floor(TREE_REWARD * tree.reward)},
    details: [
        {label: 'Apparition', value: `${tree.weight} %`},
        tree.affinity
            ? {
                label: 'Affinité',
                image: AFFINITY_ICONS[tree.affinity]?.src,
                imageAlt: AFFINITY_ICONS[tree.affinity]?.label,
            }
            : {label: 'Affinité', value: 'Aucune'},
    ],
    badge: treeRarity({kind: tree.id}).label.toUpperCase(),
}));

const treasureEntries = [
    {
        id: 'treasure-chest',
        title: 'Coffre',
        eyebrow: 'Trésor fermé',
        image: CHEST_SRC,
        glow: '#e9bb55',
        description:
            'Attaquez-le avec un soldat adjacent pour révéler un butin. Son contenu reste secret avant l’ouverture.',
        details: [
            {label: 'Ouverture', value: '1 action'},
            {label: 'Contenu', value: 'Aléatoire'},
        ],
        badge: 'MYSTÈRE',
    },
    ...LOOT_KINDS.map((loot) => ({
        id: `treasure-${loot.id}`,
        title: loot.label,
        eyebrow: 'Butin de coffre',
        image: loot.src,
        glow: AFFINITY_GLOWS[loot.affinity]
            ?? (loot.gold ? '#edbd52' : loot.hp ? '#d85f6a' : loot.atk ? '#e27851' : '#8f78cc'),
        description: lootEffect(loot),
        economy: loot.gold ? {reward: loot.gold} : undefined,
        details: [
            {label: 'Apparition', value: lootAppearancePercentage(loot)},
            {label: 'Ramassage', value: '1 déplacement'},
        ],
        badge: lootRarity({kind: loot.id}).label.toUpperCase(),
    })),
];

const terrainDescriptions = {
    grass: 'Terrain ouvert et praticable, idéal pour étendre rapidement son territoire.',
    forest: 'Terrain praticable aux teintes boisées. Les arbres peuvent y apparaître.',
    sand: 'Terrain praticable des régions arides.',
    mountain: 'Terrain praticable au relief minéral.',
    water: 'Terrain infranchissable : aucune unité ni construction ne peut y être posée.',
};

const terrainEntries = Object.entries(TERRAIN_COLORS).map(([id, color]) => ({
    id: `terrain-${id}`,
    title: TERRAIN_LABELS[id],
    eyebrow: 'Terrain',
    color,
    glow: color,
    description: terrainDescriptions[id],
    details: [
        {label: 'Déplacement', value: id === 'water' ? 'Bloqué' : 'Autorisé'},
        {label: 'Construction', value: id === 'water' ? 'Impossible' : 'Autorisée'},
    ],
    badge: id === 'water' ? 'OBSTACLE' : 'PRATICABLE',
}));

export const WIKI_CATEGORIES = [
    {id: 'soldiers', label: 'Soldats', shortLabel: 'Soldats', entries: soldierEntries},
    {id: 'heroes', label: 'Héros & bonus', shortLabel: 'Héros', entries: bonusEntries},
    {id: 'creatures', label: 'Créatures', shortLabel: 'Créatures', entries: creatureEntries},
    {id: 'buildings', label: 'Bâtiments', shortLabel: 'Bâtiments', entries: buildingEntries},
    {id: 'affinities', label: 'Affinités', shortLabel: 'Éléments', entries: affinityEntries},
    {id: 'potions', label: 'Potions', shortLabel: 'Potions', entries: potionEntries},
    {id: 'trees', label: 'Arbres', shortLabel: 'Arbres', entries: treeEntries},
    {id: 'treasures', label: 'Coffres & butins', shortLabel: 'Trésors', entries: treasureEntries},
    {id: 'terrains', label: 'Terrains', shortLabel: 'Terrains', entries: terrainEntries},
];

export const WIKI_ENTRY_COUNT = WIKI_CATEGORIES.reduce(
    (total, category) => total + category.entries.length,
    0,
);
