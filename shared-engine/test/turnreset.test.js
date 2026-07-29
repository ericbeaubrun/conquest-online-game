// RETOUR AU DÉBUT DE TOUR (`engine/turnReset.js`).
//
// Le filet de sécurité du joueur : recommencer son tour. Ce n'est pas une action
// du reducer (qui n'a aucune mémoire du passé) mais une restitution d'instantané,
// gardée par l'appelant — la session front en hors-ligne, le lobby serveur en
// ligne, qui l'applique tous les deux et DOIT obtenir le même état.
//
//   npm test
//
// Ce qui est verrouillé ici : le plateau revient exactement à l'état figé, le
// journal d'évènements ne recule JAMAIS (sans quoi tous les clients
// re-notifieraient leur historique), et aucune restitution ne franchit une
// frontière de tour.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gameReducer } from '../engine/reducer.js';
import { createInitialState } from '../engine/board.js';
import { serializeState } from '../engine/serialize.js';
import { restoreTurnStart } from '../engine/turnReset.js';
import { placeItem, endTurn } from '../engine/actions.js';

const PLAYERS = [
    { id: 'p1', name: 'Un', color: '#e11', kind: 'human', spawnIndex: 0 },
    { id: 'p2', name: 'Deux', color: '#11e', kind: 'human', spawnIndex: 1 },
];

const newGame = (seed = 987654321) =>
    createInitialState('continent', { players: PLAYERS, settings: {} }, seed);

// Première case possédée et libre du joueur actif : de quoi poser un item, donc
// dépenser de l'or et modifier le plateau de façon observable.
function ownedFreeCell(state) {
    return [...state.ownership]
        .filter(([cid, owner]) => owner === state.activePlayerId && !state.placements.has(cid))
        .map(([cid]) => cid)
        .sort()[0];
}

// Tout l'état SAUF le journal d'évènements : c'est la partie qui doit revenir à
// l'identique (le journal, lui, continue d'avancer — voir plus bas).
function withoutEvents(state) {
    const { events, eventSeq, ...rest } = serializeState(state);
    return rest;
}

test('le plateau revient exactement à son état de début de tour', () => {
    const start = newGame();
    let state = start;

    // Deux achats : l'or baisse, deux cases se garnissent.
    state = gameReducer(state, placeItem(ownedFreeCell(state), 'house'));
    state = gameReducer(state, placeItem(ownedFreeCell(state), 'soldier'));
    assert.notDeepEqual(withoutEvents(state), withoutEvents(start), 'le tour doit avoir changé le plateau');

    const restored = restoreTurnStart(state, start);
    assert.deepEqual(withoutEvents(restored), withoutEvents(start));
});

test("le journal d'évènements avance au lieu de reculer", () => {
    const start = newGame();
    const state = gameReducer(start, placeItem(ownedFreeCell(start), 'house'));
    const seqBefore = state.eventSeq;

    const restored = restoreTurnStart(state, start);
    // Une `seq` qui reculerait ferait re-notifier tout le journal chez chaque
    // client (déduplication par `seq` croissante, cf. `useToasts`).
    assert.ok(restored.eventSeq > seqBefore, 'la séquence doit continuer de croître');
    assert.equal(restored.events.at(-1).kind, 'turnReset');
    assert.equal(restored.events.at(-1).playerId, start.activePlayerId);
    // L'achat annulé reste inscrit au journal : les joueurs l'ont vu passer.
    assert.ok(restored.events.some((e) => e.kind === 'buyBuilding'));
});

test('la restitution est identique des deux côtés (client optimiste / serveur)', () => {
    const start = newGame();
    const state = gameReducer(start, placeItem(ownedFreeCell(start), 'soldier'));

    // Même entrée, deux calculs indépendants : l'application optimiste du client
    // et la restitution du serveur doivent produire le même état, au bit près.
    assert.deepEqual(
        serializeState(restoreTurnStart(state, start)),
        serializeState(restoreTurnStart(state, start))
    );
});

test('aucune restitution ne franchit une frontière de tour', () => {
    const start = newGame();
    let state = gameReducer(start, placeItem(ownedFreeCell(start), 'house'));
    state = gameReducer(state, endTurn()); // la main passe à p2

    // Instantané périmé (celui du tour de p1) : il ressusciterait le tour d'un
    // autre joueur, avec son revenu et ses apparitions.
    assert.equal(restoreTurnStart(state, start), state, "l'instantané périmé doit être refusé");
});

test('un tour intact ou un instantané absent ne changent rien', () => {
    const start = newGame();
    // `current` est renvoyé TEL QUEL (même référence) : c'est ce que l'appelant
    // teste pour savoir qu'il n'y avait rien à restituer.
    assert.equal(restoreTurnStart(start, start), start, 'rien à restituer');
    assert.equal(restoreTurnStart(start, null), start, "pas d'instantané");
});

test('une partie terminée ne se rejoue pas', () => {
    const start = newGame();
    const played = gameReducer(start, placeItem(ownedFreeCell(start), 'house'));
    // Victoire survenue pendant le tour : l'écran de fin est ouvert, et une
    // victoire ne se dé-gagne pas d'un clic.
    const finished = { ...played, status: 'over' };
    assert.equal(restoreTurnStart(finished, start), finished);
});
