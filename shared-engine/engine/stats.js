// Statistiques de partie : instantanés par tour et décomposition de l'économie.
// PUR et déterministe (aucune dépendance d'affichage) : le reducer y puise
// l'instantané enregistré à chaque tour complet (`state.statsHistory`), et le
// front y puise le point « en direct » du tour courant ainsi que les données
// des graphiques instantanés. Client et serveur calculent donc exactement les
// mêmes chiffres — l'historique voyage dans l'état sérialisé.

import {ownedCount, incomeFor} from './selectors.js';
import {upkeepFor} from '../data/soldier.js';
import {BASE_INCOME} from './rules.js';

// Effectif militaire d'un joueur : nombre de soldats sur le plateau (unités
// invoquées — squelettes, arbres-druides — comprises : elles combattent).
export function unitCountFor(state, playerId) {
    let n = 0;
    for (const p of state.placements.values()) {
        if (p.type === 'soldier' && p.playerId === playerId) n += 1;
    }
    return n;
}

// Puissance militaire d'un joueur : somme des PV et de l'attaque de toutes ses
// unités combattantes. Quantifie l'armée mieux que le simple effectif (un
// soldat de niveau 5 pèse bien plus qu'un squelette invoqué).
export function armyPowerFor(state, playerId) {
    let sum = 0;
    for (const p of state.placements.values()) {
        if (p.type === 'soldier' && p.playerId === playerId) {
            sum += (p.hp || 0) + (p.atk || 0);
        }
    }
    return sum;
}

// Niveaux cumulés de l'armée d'un joueur : somme des niveaux (1 à 5) de toutes
// ses unités combattantes. Entre l'effectif brut et la puissance : un soldat de
// niveau 5 compte comme cinq unités de niveau 1.
export function armyLevelFor(state, playerId) {
    let sum = 0;
    for (const p of state.placements.values()) {
        if (p.type === 'soldier' && p.playerId === playerId) sum += p.level || 1;
    }
    return sum;
}

// Instantané des indicateurs de chaque joueur, étiqueté du tour `t` (par défaut
// le tour courant). C'est l'élément stocké dans `state.statsHistory` à chaque
// tour complet — champs volontairement courts et scalaires (JSON-compact).
export function statsSnapshot(state, t = state.turn) {
    const players = {};
    for (const p of state.players) {
        players[p.id] = {
            tiles: ownedCount(state, p.id),
            units: unitCountFor(state, p.id),
            power: armyPowerFor(state, p.id),
            levels: armyLevelFor(state, p.id),
            gold: state.gold[p.id] || 0,
            income: incomeFor(state, p.id),
        };
    }
    return {t, players};
}

// Décomposition de l'économie d'un joueur pour le tour courant : ce qu'il gagne
// (revenu de base, cases, maisons) et ce qu'il paie (soldats, tours, arbres).
// Même barème que `incomeFor` (le `net` est identique, plancher 0 compris) —
// simplement ventilé poste par poste pour l'affichage.
export function economyBreakdown(state, playerId) {
    const base = state.settings?.baseIncome ?? BASE_INCOME;
    const tiles = ownedCount(state, playerId);
    let houses = 0; // gains des maisons (entretien négatif, compté positif ici)
    let soldiers = 0; // entretien des soldats (bonus et squelettes compris)
    let towers = 0; // entretien des tours d'attaque / de défense
    for (const placed of state.placements.values()) {
        if (placed.playerId !== playerId) continue;
        const u = upkeepFor(placed, state.settings);
        if (placed.type === 'house') houses += -u;
        else if (placed.type === 'attackTower' || placed.type === 'defenseTower') towers += u;
        else if (placed.type === 'soldier') soldiers += u;
    }
    // Entretien des arbres sur le territoire (0 par défaut, configurable).
    const perTree = state.settings?.treeUpkeep ?? 0;
    let trees = 0;
    if (perTree) {
        for (const [id, placed] of state.placements) {
            if (placed.type === 'tree' && state.ownership.get(id) === playerId) trees += perTree;
        }
    }
    const gains = base + tiles + houses;
    const costs = soldiers + towers + trees;
    return {base, tiles, houses, soldiers, towers, trees, gains, costs, net: incomeFor(state, playerId)};
}
