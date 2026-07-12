// Réglages de partie configurables (page hors-ligne). Ce module est la SOURCE DE
// VÉRITÉ des *valeurs* par défaut ; la page de configuration (menu/setupConfig.js)
// n'apporte que la présentation (libellés, aide, type de contrôle) et réutilise
// ces valeurs. Le moteur lit toujours `state.settings`, garni ici de tous les
// champs, pour ne jamais dépendre d'une clé manquante.
//
// Certaines valeurs par défaut sont dérivées des barèmes de base (prix boutique,
// entretiens, prix/entretiens des bonus) pour rester alignées automatiquement.

import {ITEM_COST} from '../data/items.js';
import {SOLDIER_UPKEEP, TOWER_UPKEEP, SKELETON_UPKEEP} from './rules.js';
import {BONUS_OFFERS} from '../data/soldier.js';

// --- Seuils par défaut des conditions de victoire (repli si non fournis) ---
export const DOMINATION_PERCENT = 60; // % du territoire jouable à contrôler
export const ECONOMY_GOAL = 200; // or à atteindre en mode « course à l'or »

// Cartes { id -> valeur } dérivées des barèmes de base, éditables par partie.
const DEFAULT_BONUS_PRICE = Object.fromEntries(BONUS_OFFERS.map((b) => [b.id, b.price ?? 0]));
const DEFAULT_BONUS_UPKEEP = Object.fromEntries(BONUS_OFFERS.map((b) => [b.id, b.upkeep ?? 0]));
// Chaque bonus est autorisé par défaut ; on peut en désactiver individuellement.
const DEFAULT_BONUS_ENABLED = Object.fromEntries(BONUS_OFFERS.map((b) => [b.id, true]));

export const DEFAULT_SETTINGS = {
    // Économie
    startingGold: 0,
    baseIncome: 10,
    houseIncome: 10,
    itemCost: {...ITEM_COST}, // prix de la boutique par item
    // Entretien par tour (or prélevé sur le revenu) par type d'unité.
    upkeep: {
        soldier1: SOLDIER_UPKEEP[1],
        soldier2: SOLDIER_UPKEEP[2],
        soldier3: SOLDIER_UPKEEP[3],
        soldier4: SOLDIER_UPKEEP[4],
        tower: TOWER_UPKEEP,
        skeleton: SKELETON_UPKEEP,
    },
    // Monde
    treesEnabled: true,
    treeReward: 10,
    treeUpkeep: 2, // or prélevé par tour pour chaque arbre sur le territoire du joueur
    treeDensity: 10, // % des cases pouvant porter un arbre (plafond global)
    treeSpawnChance: 50, // % de chance qu'une vague d'arbres apparaisse par tour
    treeSpawnMin: 0, // nombre minimum d'arbres par vague
    treeSpawnMax: 2, // nombre maximum d'arbres par vague
    // Unités
    bonusesEnabled: true,
    soldierHp: 10,
    soldierAtk: 5,
    bonusEnabled: DEFAULT_BONUS_ENABLED, // bonus autorisés (activables un par un)
    bonusPrice: DEFAULT_BONUS_PRICE, // prix d'achat par bonus
    bonusUpkeep: DEFAULT_BONUS_UPKEEP, // entretien par tour par bonus
    // Partie
    victoryMode: 'elimination', // 'elimination' | 'domination' | 'economy'
    dominationPercent: DOMINATION_PERCENT, // seuil de victoire par domination
    economyGoal: ECONOMY_GOAL, // seuil de victoire économique
    maxTurns: 0, // 0 = illimité
    turnTimer: 0, // s, 0 = sans limite
    randomFirstPlayer: false,
};

// Complète une configuration partielle avec les valeurs par défaut : le moteur
// obtient toujours un objet de réglages entier (fusion superficielle, suffisante
// puisque les sous-objets sont fournis d'un bloc par le menu).
export function resolveSettings(partial) {
    return {...DEFAULT_SETTINGS, ...(partial || {})};
}
