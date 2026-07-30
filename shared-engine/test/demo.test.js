import test from 'node:test';
import assert from 'node:assert/strict';

import {MAPS, getMapById, getPlayableMapById} from '../data/maps.js';
import {
    FUSION_DEMO_MAP_ID,
    FUSION_DEMO_CHEST_ID,
    FUSION_DEMO_ENEMY_BASE_ID,
    FUSION_DEMO_EXPLORER_ID,
    FUSION_DEMO_RAIDER_ID,
    FUSION_DEMO_SOURCE_ID,
    FUSION_DEMO_TARGET_ID,
    FUSION_DEMO_TREE_ID,
    createFusionDemoState,
} from '../demo/fusionScenario.js';
import {gameReducer} from '../engine/reducer.js';
import {
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
    assert.equal(getMapById(FUSION_DEMO_MAP_ID).cells.length, 24);
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

test('le scénario contient uniquement les forces demandées', () => {
    const initial = createFusionDemoState();
    const units = [...initial.placements.values()]
        .filter((placed) => placed.type === 'soldier');
    const allied = units.filter((unit) => unit.playerId === 'p1');
    const enemies = units.filter((unit) => unit.playerId === 'p2');

    assert.equal(allied.filter((unit) => unit.level === 1).length, 4);
    assert.equal(allied.filter((unit) => unit.level === 3).length, 1);
    assert.equal(enemies.filter((unit) => unit.kindId === 'goblin').length, 2);
    assert.equal(enemies.filter((unit) => unit.kindId === 'skeleton').length, 1);
    assert.equal(enemies.filter((unit) => unit.bonus === 'warlock').length, 1);
    assert.equal(enemies.filter((unit) => unit.kindId === 'skeleton2').length, 2);
    assert.equal(
        [...initial.placements.values()]
            .filter((placed) => placed.type === 'defenseTower').length,
        1,
    );
    assert.deepEqual(
        enemies
            .filter((unit) => unit.kindId === 'skeleton')
            .map(({atk, hp}) => ({atk, hp})),
        [{atk: 1, hp: 1}],
    );
    assert.deepEqual(
        enemies
            .filter((unit) => unit.kindId === 'skeleton2')
            .map(({atk, hp}) => ({atk, hp})),
        [{atk: 2, hp: 3}, {atk: 2, hp: 3}],
    );
    assert.equal(initial.baseHp[FUSION_DEMO_ENEMY_BASE_ID], 4);
    const board = getLogicalBoard(initial.mapId);
    assert.equal(
        [...initial.placements.keys()].every((id) => board.cellMap.has(id)),
        true,
    );
    assert.equal(initial.placements.has(FUSION_DEMO_ENEMY_BASE_ID), false);
});

test('coffre, arbre et conquête sont immédiatement jouables', () => {
    const initial = createFusionDemoState();
    const chest = gameReducer(
        initial,
        openChest(FUSION_DEMO_EXPLORER_ID, FUSION_DEMO_CHEST_ID),
    );
    const tree = gameReducer(
        initial,
        chopTree(FUSION_DEMO_EXPLORER_ID, FUSION_DEMO_TREE_ID),
    );
    const conquest = gameReducer(initial, moveSoldier(FUSION_DEMO_RAIDER_ID, '1,0'));

    assert.notEqual(chest, initial);
    assert.notEqual(chest.placements.get(FUSION_DEMO_CHEST_ID)?.type, 'chest');
    assert.notEqual(tree, initial);
    assert.equal(tree.placements.get(FUSION_DEMO_TREE_ID)?.type, 'soldier');
    assert.notEqual(conquest, initial);
    assert.equal(conquest.ownership.get('1,0'), 'p1');
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
