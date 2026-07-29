// RÈGLE : une unité INVOQUÉE ou ENVOÛTÉE ne porte jamais de bonus.
//
// Elle est énoncée par le catalogue (`data/units.js`) et appliquée à trois
// endroits — l'interface (`SoldierPanel` n'ouvre pas la boutique), les
// notifications (`unlockedBonusIds`) et le reducer. Seul le dernier fait
// autorité : l'interface ne protège que la souris, pas une action fabriquée à
// la main par un bot ou par un client.
//
// Le reducer ne refusait longtemps que les SQUELETTES, laissant un dragon (20/20)
// acheter un bonus de niveau 1 — et tomber au passage aux statistiques du bonus,
// puisque les équiper REMPLACE celles de l'unité. D'où ce test.

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {gameReducer} from '../engine/reducer.js';
import {createInitialState} from '../engine/board.js';
import {buyBonus} from '../engine/actions.js';
import {makeSoldier, makeUnit} from '../engine/factories.js';
import {BONUS_OFFERS} from '../data/soldier.js';

const CELL = '-3,0'; // case du territoire de départ de p1 (carte « Duel »)
const BONUS = 'thief'; // bonus de niveau 1, le moins cher (15 or)

// Partie où le bonus visé n'est bloqué NI par son défi, NI par son prix : ne
// reste que la nature de l'unité, ce qu'on veut isoler.
function stateWith(unit) {
    const state = createInitialState(
        'duel',
        {
            players: [
                {id: 'p1', name: 'A', kind: 'human'},
                {id: 'p2', name: 'B', kind: 'human'},
            ],
            settings: {
                startingGold: 400,
                bonusChallengeEnabled: Object.fromEntries(BONUS_OFFERS.map((b) => [b.id, false])),
            },
        },
        1
    );
    return {
        ...state,
        activePlayerId: 'p1',
        placements: new Map([[CELL, unit(state.settings)]]),
    };
}

test('un soldat ordinaire achète bien son bonus', () => {
    const state = stateWith((settings) => makeSoldier('p1', 's1', settings));
    const next = gameReducer(state, buyBonus(CELL, BONUS));
    assert.notEqual(next, state);
    assert.equal(next.placements.get(CELL).bonus, BONUS);
});

test('aucune invocation ne peut acheter de bonus', () => {
    // Toutes les espèces du catalogue : invocations (squelette, arbre-druide,
    // dragon, gobelin) ET créatures d'envoûtement (cochon, corbeau, grenouille).
    for (const kindId of ['skeleton', 'skeleton2', 'druidTree', 'dragon', 'goblin', 'pig', 'crow', 'frog']) {
        const state = stateWith(() => makeUnit(kindId, 'p1', 's1'));
        const next = gameReducer(state, buyBonus(CELL, BONUS));
        assert.equal(next, state, `${kindId} a pu acheter un bonus`);
    }
});
