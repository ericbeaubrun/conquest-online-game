// SURVEILLANCE de la potion de sacrifice (boutique) : elle transforme le
// SOLDAT allié ciblé (ordinaire, avec bonus, ou unité invoquée/envoûtée) en un
// TAS D'OR au sol — un butin ordinaire (voir `data/chests.js`), ramassable par
// n'importe quel soldat en s'y déplaçant, exactement comme celui d'un coffre.
// Sa valeur : `(ATK + PV) × SACRIFICE_GOLD_PER_POINT`.
//
// Les STRUCTURES (maison, tours) sont délibérément HORS CIBLE : une première
// version les incluait, et ce test avait aussitôt révélé qu'une tour (25 or,
// ATK 10 ou PV 10 selon le type) y créerait un tas de 60 or — 240 % de son
// prix, très au-dessus de tout ce que rendaient les soldats/bonus (≤ 61 %).
// `canReceiveSacrifice` (voir `data/soldier.js`) s'en tient donc aux soldats.
//
// Ce test ne corrige rien : il RECALCULE le tableau à chaque exécution à
// partir des données de jeu courantes (`soldier.js`, `units.js`, `items.js`)
// et échoue si un futur réglage (PV/ATK relevés, prix baissé…) pousse la
// valeur créée au-delà d'un ratio critique de son prix — le signal qu'il
// faudrait revoir l'équilibrage AVANT de le laisser filer en jeu.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {gameReducer} from '../engine/reducer.js';
import {createInitialState} from '../engine/board.js';
import {placeItem} from '../engine/actions.js';
import {makeSoldier} from '../engine/factories.js';
import {SACRIFICE_GOLD_PER_POINT, SACRIFICE_POTION_ITEM} from '../data/items.js';
import {lootGold, lootSrc, coinSrcForGold} from '../data/chests.js';
import {
    BONUS_OFFERS,
    bonusPriceOf,
    soldierCostForLevel,
    purchasedSoldierStats,
    MAX_SOLDIER_PURCHASE_LEVEL,
} from '../data/soldier.js';
import {UNIT_KINDS} from '../data/units.js';

const CELL = '-3,0'; // case du territoire de départ de p1 (carte « Duel »), voir bonus.test.js

// Partie à deux joueurs avec un unique élément posé sur `CELL` (déjà muni de
// son `playerId`, ou sans pour un placement neutre comme un arbre).
function stateWithTarget(target, {gold = 400} = {}) {
    const state = createInitialState(
        'duel',
        {
            players: [
                {id: 'p1', name: 'A', kind: 'human'},
                {id: 'p2', name: 'B', kind: 'human'},
            ],
            settings: {startingGold: gold},
        },
        1
    );
    return {...state, activePlayerId: 'p1', placements: new Map([[CELL, target]])};
}

// Valeur du tas d'or créé pour une cible d'ATK/PV donnés. Reproduit exactement
// `reducePlaceSacrifice`.
const goldValueFor = (atk, hp) => ((atk ?? 0) + (hp ?? 0)) * SACRIFICE_GOLD_PER_POINT;

// Au-delà de ce ratio (valeur du tas / prix TOTAL investi dans l'unité), la
// potion créerait un tas jugé abusif pour une action instantanée et sans
// risque de combat. Fixé juste au-dessus du pire cas connu (Alchimiste,
// ~60,7 %) — assez bas pour alerter si un futur réglage ouvre un nouveau levier.
const CRITICAL_VALUE_TO_PRICE_RATIO = 0.65;

// Prix TOTAL investi pour faire tenir ce bonus sur le plateau : le soldat du
// niveau requis, PLUS le prix du bonus lui-même.
const bonusTotalPrice = (bonus) => soldierCostForLevel(bonus.requiredLevel) + (bonusPriceOf(bonus) || 0);

function buildRows() {
    const rows = [];

    // --- Soldats de base (sans bonus) ---
    for (let level = 1; level <= MAX_SOLDIER_PURCHASE_LEVEL; level += 1) {
        const stats = purchasedSoldierStats(level);
        rows.push({categorie: 'Soldat', unite: `Niveau ${level}`, atk: stats.atk, pv: stats.hp, prix: soldierCostForLevel(level)});
    }

    // --- Bonus (prix = soldat du niveau requis + prix du bonus) ---
    for (const bonus of BONUS_OFFERS) {
        rows.push({categorie: 'Bonus', unite: bonus.label, atk: bonus.stats.atk, pv: bonus.stats.hp, prix: bonusTotalPrice(bonus)});
    }

    // --- Créatures invoquées : pas de prix direct (invocation gratuite) ---
    for (const kind of UNIT_KINDS) {
        rows.push({categorie: 'Créature', unite: kind.label, atk: kind.atk, pv: kind.hp, prix: null});
    }

    return rows.map((row) => {
        const valeur = goldValueFor(row.atk, row.pv);
        const ratio = row.prix ? valeur / row.prix : null;
        return {
            ...row,
            valeur,
            icone: coinSrcForGold(valeur).replace(/^\//, ''),
            ratioPct: ratio == null ? null : Math.round(ratio * 1000) / 10,
        };
    });
}

test('potion de sacrifice — valeur créée par soldat (surveillance)', () => {
    const rows = buildRows();

    // Affiche le tableau complet à chaque exécution de `npm test` : la
    // première ligne de défense contre un déséquilibre qui passerait
    // inaperçu dans un diff de données sans qu'aucune assertion ne le détecte.
    console.table(
        rows.map((r) => ({
            Catégorie: r.categorie,
            Unité: r.unite,
            ATK: r.atk,
            PV: r.pv,
            'Valeur du tas': r.valeur,
            Icône: r.icone,
            Prix: r.prix ?? '—',
            'Valeur / Prix': r.ratioPct == null ? '—' : `${r.ratioPct}%`,
        }))
    );

    // Invariant de FORMULE : la valeur ne dépend QUE de l'ATK et des PV de la
    // cible, jamais de son prix. Cassé ici, c'est la formule elle-même qui a
    // changé, pas les données de jeu — voir `goldValueFor`.
    for (const row of rows) {
        assert.equal(row.valeur, goldValueFor(row.atk, row.pv), `formule incohérente pour ${row.unite}`);
    }

    // Déséquilibre CRITIQUE : un soldat au prix CONNU (soldat de base, bonus)
    // ne doit pas créer un tas d'or démesuré par rapport à son prix total
    // investi. Les créatures invoquées (prix null, gratuites) sont hors de
    // cette vérification : leur ratio n'a pas de sens.
    const offenders = rows.filter((r) => r.prix && r.valeur / r.prix > CRITICAL_VALUE_TO_PRICE_RATIO);
    assert.deepEqual(
        offenders.map((r) => r.unite),
        [],
        offenders.length
            ? `déséquilibre critique (> ${CRITICAL_VALUE_TO_PRICE_RATIO * 100}% du prix créé en tas d'or) : ` +
              offenders.map((r) => `${r.unite} (${r.ratioPct}%)`).join(', ')
            : undefined
    );
});

// --- Paliers d'icône (voir `coinSrcForGold`, `data/chests.js`) ---

test('coinSrcForGold choisit le palier d’icône égal ou juste en dessous du montant', () => {
    assert.equal(coinSrcForGold(10), '/coin15.png'); // sous le plus petit palier : la plus petite icône quand même
    assert.equal(coinSrcForGold(15), '/coin15.png');
    assert.equal(coinSrcForGold(29), '/coin15.png');
    assert.equal(coinSrcForGold(30), '/coin30.png');
    assert.equal(coinSrcForGold(119), '/coin90.png');
    assert.equal(coinSrcForGold(120), '/coin120.png');
    assert.equal(coinSrcForGold(150), '/coin150.png');
    assert.equal(coinSrcForGold(500), '/coin150.png'); // au-delà du plus gros palier : il ne grandit plus
});

// --- `lootGold`/`lootSrc` lisent un montant CALCULÉ, hors catalogue ---

test('lootGold / lootSrc lisent un montant porté directement par le butin', () => {
    const loot = {type: 'loot', gold: 42, src: '/coin30.png'};
    assert.equal(lootGold(loot), 42);
    assert.equal(lootSrc(loot), '/coin30.png');
});

// --- Comportement du reducer (même chemin que `dispatch(placeItem(...))`) ---

test('la potion transforme un soldat en tas d’or de (ATK+PV) × 5', () => {
    const target = {...makeSoldier('p1', 's1'), atk: 4, hp: 8}; // soldat niveau 3 (4/8)
    const state = stateWithTarget(target);
    const before = state.gold.p1;
    const next = gameReducer(state, placeItem(CELL, 'sacrifice'));
    assert.notEqual(next, state);
    const loot = next.placements.get(CELL);
    assert.equal(loot.type, 'loot');
    assert.equal(loot.gold, 60); // (4 + 8) × 5
    assert.equal(loot.src, coinSrcForGold(60));
    // Le prix de la potion est débité ; le tas d'or, lui, doit être RAMASSÉ —
    // il ne rejoint pas directement le porte-monnaie de l'acheteur.
    assert.equal(next.gold.p1, before - SACRIFICE_POTION_ITEM.cost);
});

test('la potion est refusée sur une structure alliée (tour d’attaque)', () => {
    const target = {type: 'attackTower', playerId: 'p1', hp: 2, atk: 10};
    const state = stateWithTarget(target);
    assert.equal(gameReducer(state, placeItem(CELL, 'sacrifice')), state);
});

test('la potion est refusée sur un élément adverse', () => {
    const state = stateWithTarget(makeSoldier('p2', 's1'));
    assert.equal(gameReducer(state, placeItem(CELL, 'sacrifice')), state);
});

test('la potion est refusée sans assez d’or', () => {
    const state = stateWithTarget(makeSoldier('p1', 's1'), {gold: 0});
    assert.equal(gameReducer(state, placeItem(CELL, 'sacrifice')), state);
});

test('la potion est refusée sur un élément non sacrifiable (arbre)', () => {
    const state = stateWithTarget({type: 'tree', kind: 'forest'});
    assert.equal(gameReducer(state, placeItem(CELL, 'sacrifice')), state);
});
