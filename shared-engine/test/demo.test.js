import test from 'node:test';
import assert from 'node:assert/strict';

import {MAPS, getMapById, getPlayableMapById} from '../data/maps.js';
import {
    FUSION_DEMO_MAP_ID,
    FUSION_DEMO_CHEST_ID,
    FUSION_DEMO_ENEMY_BASE_ID,
    FUSION_DEMO_EXPLORER_ID,
    FUSION_DEMO_RAIDER_ID,
    FUSION_DEMO_SKELETON_ID,
    FUSION_DEMO_SOURCE_ID,
    FUSION_DEMO_TARGET_ID,
    FUSION_DEMO_TREE_ID,
    createFusionDemoState,
} from '../demo/fusionScenario.js';
import {gameReducer} from '../engine/reducer.js';
import {
    attackSoldier,
    chopTree,
    endTurn,
    mergeSoldier,
    moveSoldier,
    openChest,
} from '../engine/actions.js';
import {getLogicalBoard} from '../engine/board.js';
import {computeReachable} from '../engine/selectors.js';

test('la mini-carte de démo reste hors du catalogue des parties', () => {
    assert.equal(MAPS.some((map) => map.id === FUSION_DEMO_MAP_ID), false);
    assert.equal(getMapById(FUSION_DEMO_MAP_ID).id, FUSION_DEMO_MAP_ID);
    assert.equal(getMapById(FUSION_DEMO_MAP_ID).cells.length, 49);
    assert.notEqual(getPlayableMapById(FUSION_DEMO_MAP_ID).id, FUSION_DEMO_MAP_ID);
});

test('la démonstration applique une vraie fusion du reducer', () => {
    const initial = createFusionDemoState();
    const merged = gameReducer(
        initial,
        mergeSoldier(FUSION_DEMO_SOURCE_ID, FUSION_DEMO_TARGET_ID),
    );

    assert.equal(initial.placements.get(FUSION_DEMO_SOURCE_ID)?.level, 1);
    assert.equal(initial.placements.get(FUSION_DEMO_TARGET_ID)?.level, 1);
    assert.equal(merged.placements.has(FUSION_DEMO_SOURCE_ID), false);
    assert.deepEqual(
        {
            level: merged.placements.get(FUSION_DEMO_TARGET_ID)?.level,
            atk: merged.placements.get(FUSION_DEMO_TARGET_ID)?.atk,
            hp: merged.placements.get(FUSION_DEMO_TARGET_ID)?.hp,
        },
        {level: 2, atk: 2, hp: 4},
    );
});

test('le mini-défi se termine par un vrai combat contre le squelette', () => {
    const initial = createFusionDemoState();
    const victorious = gameReducer(
        initial,
        attackSoldier(FUSION_DEMO_RAIDER_ID, FUSION_DEMO_SKELETON_ID),
    );

    assert.notEqual(victorious, initial);
    assert.equal(
        victorious.placements.get(FUSION_DEMO_SKELETON_ID)?.playerId,
        'p1',
    );
    assert.equal(victorious.placements.get(FUSION_DEMO_SKELETON_ID)?.hp, 7);
    assert.equal(victorious.ownership.get(FUSION_DEMO_SKELETON_ID), 'p1');
});

test('coffre, arbre, conquête et base sont tous réellement jouables', () => {
    const initial = createFusionDemoState();
    const chest = gameReducer(
        initial,
        openChest(FUSION_DEMO_EXPLORER_ID, FUSION_DEMO_CHEST_ID),
    );
    const tree = gameReducer(
        initial,
        chopTree(FUSION_DEMO_EXPLORER_ID, FUSION_DEMO_TREE_ID),
    );
    const conquest = gameReducer(initial, moveSoldier(FUSION_DEMO_TARGET_ID, '2,0'));
    const base = gameReducer(
        initial,
        attackSoldier(FUSION_DEMO_RAIDER_ID, FUSION_DEMO_ENEMY_BASE_ID),
    );

    assert.notEqual(chest, initial);
    assert.notEqual(chest.placements.get(FUSION_DEMO_CHEST_ID)?.type, 'chest');
    assert.notEqual(tree, initial);
    assert.equal(tree.placements.get(FUSION_DEMO_TREE_ID)?.type, 'soldier');
    assert.notEqual(conquest, initial);
    assert.equal(conquest.ownership.get('2,0'), 'p1');
    assert.notEqual(base, initial);
    assert.equal(base.destroyedBases.has(FUSION_DEMO_ENEMY_BASE_ID), true);
});

test('le terrain libre permet bien de conquérir cinq cases', () => {
    let state = createFusionDemoState();
    const board = getLogicalBoard(state.mapId);
    let conquered = 0;
    let attempts = 0;

    while (conquered < 5 && attempts < 30) {
        attempts += 1;
        let acted = false;
        for (const [fromId, soldier] of state.placements) {
            if (
                soldier.type !== 'soldier' ||
                soldier.playerId !== 'p1' ||
                state.movedSoldiers.has(soldier.uid)
            ) {
                continue;
            }
            const target = [...computeReachable(state, board, fromId).moves.entries()]
                .find(([, move]) => move.kind === 'conquer');
            if (!target) continue;
            const next = gameReducer(state, moveSoldier(fromId, target[0]));
            if (next === state) continue;
            state = next;
            conquered += 1;
            acted = true;
            break;
        }
        if (!acted) {
            state = gameReducer(state, endTurn());
            state = gameReducer(state, endTurn());
        }
    }

    assert.equal(conquered, 5);
    assert.equal(state.status, 'playing');
});
