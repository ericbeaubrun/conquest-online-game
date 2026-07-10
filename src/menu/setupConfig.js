// Configuration de la page HORS-LIGNE (offline). Tout ce qui décrit *ce qu'on
// peut régler avant une partie* vit ici, sous une forme DÉCLARATIVE : la page
// se contente de rendre ces données. Ajouter/retirer un réglage d'équilibrage
// se fait donc en éditant les tableaux ci-dessous — aucun composant à toucher.

import { MAPS, DEFAULT_MAP_ID } from '../../shared-game/data/maps.js';
import { DEFAULT_SETTINGS } from '../../shared-game/engine/settings.js';
import { ITEMS } from '../../shared-game/data/items.js';
import { BONUS_OFFERS } from '../../shared-game/data/soldier.js';

// --- Palette de couleurs des joueurs ---
// Choisies pour se distinguer entre elles ET des terrains (vert herbe, bleu
// eau, sable). Un joueur ne peut pas prendre une couleur déjà utilisée.
export const COLOR_PALETTE = [
    { name: 'Rouge', value: '#d64545' },
    { name: 'Bleu', value: '#3f7fd8' },
    { name: 'Violet', value: '#9b59b6' },
    { name: 'Orange', value: '#e08e2b' },
    { name: 'Rose', value: '#e06ab0' },
    { name: 'Cyan', value: '#35c4c4' },
    { name: 'Or', value: '#e0c93a' },
    { name: 'Gris', value: '#b0b6bd' },
];

// --- Difficultés de bot ---
export const BOT_DIFFICULTIES = [
    { id: 'easy', label: 'Facile' },
    { id: 'normal', label: 'Normal' },
    { id: 'hard', label: 'Difficile' },
];

// Capacité (nombre de joueurs) d'une carte = son nombre de points de départ.
export const mapCapacity = (mapId) =>
    MAPS.find((m) => m.id === mapId)?.spawns.length ?? 2;

export const MIN_PLAYERS = 2;

// Fabrique un joueur par défaut pour l'emplacement `index` (0-based). On lui
// donne la couleur et le nom de la palette non encore pris par un autre joueur.
export function makeDefaultPlayer(index, taken = []) {
    const usedColors = new Set(taken.map((p) => p.color));
    const slot = COLOR_PALETTE.find((c) => !usedColors.has(c.value)) || COLOR_PALETTE[index % COLOR_PALETTE.length];
    return {
        id: `p${index + 1}`,
        kind: 'human', // 'human' | 'bot'
        botDifficulty: 'normal',
        name: slot.name,
        color: slot.value,
    };
}

// Liste de joueurs par défaut pour une carte donnée (2 humains pour démarrer).
export function makeDefaultPlayers(count = MIN_PLAYERS) {
    const players = [];
    for (let i = 0; i < count; i += 1) {
        players.push(makeDefaultPlayer(i, players));
    }
    return players;
}

// --- Sous-champs des réglages « groupe » (barèmes détaillés) ---
// Chaque groupe édite un objet { clé -> nombre } ; les valeurs par défaut sont
// tirées de DEFAULT_SETTINGS (source de vérité du moteur).
const ITEM_COST_FIELDS = ITEMS.map((it) => ({
    key: it.id,
    label: it.name,
    default: DEFAULT_SETTINGS.itemCost[it.id],
    min: 0,
    max: 99,
    step: 1,
    unit: '💰',
}));

const UPKEEP_FIELDS = [
    { key: 'soldier1', label: 'Soldat niv. 1' },
    { key: 'soldier2', label: 'Soldat niv. 2' },
    { key: 'soldier3', label: 'Soldat niv. 3' },
    { key: 'soldier4', label: 'Soldat niv. 4' },
    { key: 'tower', label: 'Tour' },
    { key: 'skeleton', label: 'Squelette' },
].map((f) => ({ ...f, default: DEFAULT_SETTINGS.upkeep[f.key], min: 0, max: 99, step: 1, unit: '/tour' }));

const BONUS_PRICE_FIELDS = BONUS_OFFERS.map((b) => ({
    key: b.id,
    label: b.label,
    default: DEFAULT_SETTINGS.bonusPrice[b.id],
    min: 0,
    max: 999,
    step: 5,
    unit: '💰',
}));

const BONUS_UPKEEP_FIELDS = BONUS_OFFERS.map((b) => ({
    key: b.id,
    label: b.label,
    default: DEFAULT_SETTINGS.bonusUpkeep[b.id],
    min: 0,
    max: 99,
    step: 1,
    unit: '/tour',
}));

// Sous-champs à bascule (Oui/Non) : autorise ou non chaque bonus individuellement.
const BONUS_ENABLED_FIELDS = BONUS_OFFERS.map((b) => ({
    key: b.id,
    label: b.label,
    default: DEFAULT_SETTINGS.bonusEnabled[b.id],
    control: 'toggle',
}));

// --- Réglages d'équilibrage / avancés ---
// Schéma DÉCLARATIF. Chaque entrée décrit un champ de formulaire :
//   type    : 'toggle' | 'number' | 'select' | 'group'
//   default : valeur initiale (les 'group' la tirent de leurs `fields`)
//   min/max/step/unit : pour 'number'
//   options : [{ value, label }] pour 'select'
//   fields  : [{ key, label, default, min, max, step, unit }] pour 'group'
//   group   : titre de la section où le réglage s'affiche
//   help    : ligne d'aide affichée sous le libellé
//   dependsOn : id d'un toggle ; le réglage est masqué si ce toggle est off
//   showWhen  : (settings) => bool ; condition d'affichage fine (ex. mode choisi)
// Pour ajouter un réglage, il suffit d'ajouter un objet ici.
export const GAME_SETTINGS = [
    // --- Économie ---
    {
        id: 'startingGold',
        label: 'Or de départ',
        group: 'Économie',
        type: 'number',
        min: 0,
        max: 500,
        step: 5,
        unit: '💰',
        help: 'Or dans la réserve de chaque joueur au premier tour.',
    },
    {
        id: 'baseIncome',
        label: 'Revenu de base',
        group: 'Économie',
        type: 'number',
        min: 0,
        max: 100,
        step: 1,
        unit: '/tour',
        help: 'Or gagné chaque tour avant le bonus de territoire.',
    },
    {
        id: 'houseIncome',
        label: 'Rendement des maisons',
        group: 'Économie',
        type: 'number',
        min: 0,
        max: 100,
        step: 1,
        unit: '/tour',
        help: 'Or rapporté par chaque maison possédée.',
    },
    {
        id: 'itemCost',
        label: 'Prix de la boutique',
        group: 'Économie',
        type: 'group',
        fields: ITEM_COST_FIELDS,
        help: 'Coût d’achat de chaque item posable.',
    },
    {
        id: 'upkeep',
        label: 'Entretien des unités',
        group: 'Économie',
        type: 'group',
        fields: UPKEEP_FIELDS,
        help: 'Or prélevé chaque tour par unité possédée.',
    },

    // --- Monde ---
    {
        id: 'treesEnabled',
        label: 'Apparition des arbres',
        group: 'Monde',
        type: 'toggle',
        help: 'Des forêts apparaissent au fil de la partie (or à l’abattage).',
    },
    {
        id: 'treeSpawnChance',
        label: 'Probabilité d’apparition',
        group: 'Monde',
        type: 'number',
        min: 0,
        max: 100,
        step: 5,
        unit: '%',
        help: 'Chance qu’une vague d’arbres apparaisse à chaque tour.',
        dependsOn: 'treesEnabled',
    },
    {
        id: 'treeSpawnMin',
        label: 'Arbres par vague (min)',
        group: 'Monde',
        type: 'number',
        min: 0,
        max: 20,
        step: 1,
        help: 'Nombre minimum d’arbres lorsqu’une vague apparaît.',
        dependsOn: 'treesEnabled',
    },
    {
        id: 'treeSpawnMax',
        label: 'Arbres par vague (max)',
        group: 'Monde',
        type: 'number',
        min: 0,
        max: 20,
        step: 1,
        help: 'Nombre maximum d’arbres lorsqu’une vague apparaît.',
        dependsOn: 'treesEnabled',
    },
    {
        id: 'treeReward',
        label: 'Or par arbre abattu',
        group: 'Monde',
        type: 'number',
        min: 0,
        max: 100,
        step: 1,
        unit: '💰',
        help: 'Récompense pour un arbre coupé par un soldat adjacent.',
        dependsOn: 'treesEnabled',
    },
    {
        id: 'treeDensity',
        label: 'Densité maximale d’arbres',
        group: 'Monde',
        type: 'number',
        min: 0,
        max: 50,
        step: 1,
        unit: '%',
        help: 'Part maximale des cases pouvant être couvertes de forêts.',
        dependsOn: 'treesEnabled',
    },

    // --- Unités ---
    {
        id: 'bonusesEnabled',
        label: 'Bonus de soldats',
        group: 'Unités',
        type: 'toggle',
        help: 'Autorise les défis et bonus équipables (Roi, Paladin…).',
    },
    {
        id: 'soldierHp',
        label: 'PV de départ d’un soldat',
        group: 'Unités',
        type: 'number',
        min: 5,
        max: 100,
        step: 5,
        unit: '❤',
        help: 'Points de vie d’un soldat neuf.',
    },
    {
        id: 'soldierAtk',
        label: 'Attaque de départ d’un soldat',
        group: 'Unités',
        type: 'number',
        min: 1,
        max: 100,
        step: 1,
        unit: '⚔',
        help: 'Dégâts infligés par un soldat neuf.',
    },
    {
        id: 'bonusEnabled',
        label: 'Bonus autorisés',
        group: 'Unités',
        type: 'group',
        fields: BONUS_ENABLED_FIELDS,
        help: 'Active ou désactive chaque bonus individuellement.',
        dependsOn: 'bonusesEnabled',
    },
    {
        id: 'bonusPrice',
        label: 'Prix des bonus',
        group: 'Unités',
        type: 'group',
        fields: BONUS_PRICE_FIELDS,
        help: 'Coût d’achat de chaque bonus (0 = gratuit).',
        dependsOn: 'bonusesEnabled',
    },
    {
        id: 'bonusUpkeep',
        label: 'Entretien des bonus',
        group: 'Unités',
        type: 'group',
        fields: BONUS_UPKEEP_FIELDS,
        help: 'Or prélevé chaque tour par bonus équipé.',
        dependsOn: 'bonusesEnabled',
    },

    // --- Partie ---
    {
        id: 'victoryMode',
        label: 'Condition de victoire',
        group: 'Partie',
        type: 'select',
        options: [
            { value: 'elimination', label: 'Élimination' },
            { value: 'domination', label: 'Domination du territoire' },
            { value: 'economy', label: 'Course à l’or' },
        ],
        help: 'Ce qui met fin à la partie et désigne le vainqueur.',
    },
    {
        id: 'dominationPercent',
        label: 'Seuil de domination',
        group: 'Partie',
        type: 'number',
        min: 10,
        max: 100,
        step: 5,
        unit: '%',
        help: 'Part du territoire à contrôler pour gagner par domination.',
        showWhen: (s) => s.victoryMode === 'domination',
    },
    {
        id: 'economyGoal',
        label: 'Objectif d’or',
        group: 'Partie',
        type: 'number',
        min: 50,
        max: 2000,
        step: 50,
        unit: '💰',
        help: 'Or à accumuler pour gagner la course à l’or.',
        showWhen: (s) => s.victoryMode === 'economy',
    },
    {
        id: 'maxTurns',
        label: 'Nombre de tours',
        group: 'Partie',
        type: 'number',
        min: 0,
        max: 200,
        step: 5,
        help: 'Limite de tours (0 = illimité).',
    },
    {
        id: 'turnTimer',
        label: 'Chrono par tour',
        group: 'Partie',
        type: 'number',
        min: 0,
        max: 300,
        step: 5,
        unit: 's',
        help: 'Temps imparti à chaque joueur (0 = sans limite).',
    },
    {
        id: 'randomFirstPlayer',
        label: 'Premier joueur aléatoire',
        group: 'Partie',
        type: 'toggle',
        help: 'Tire au sort qui commence plutôt que le joueur 1.',
    },
];

// Groupes de réglages, dans l'ordre d'apparition, déduits du schéma.
export const SETTING_GROUPS = [...new Set(GAME_SETTINGS.map((s) => s.group))];

// Valeurs par défaut : proviennent du moteur (source de vérité unique). Les
// réglages « groupe » sont copiés en profondeur (un niveau) pour être éditables
// indépendamment sans muter DEFAULT_SETTINGS.
export function defaultSettings() {
    const s = { ...DEFAULT_SETTINGS };
    for (const spec of GAME_SETTINGS) {
        if (spec.type === 'group') s[spec.id] = { ...DEFAULT_SETTINGS[spec.id] };
    }
    return s;
}

// Configuration hors-ligne complète par défaut (carte + joueurs + réglages).
export function defaultOfflineConfig() {
    return {
        mapId: DEFAULT_MAP_ID,
        players: makeDefaultPlayers(MIN_PLAYERS),
        settings: defaultSettings(),
    };
}
