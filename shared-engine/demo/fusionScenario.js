// Premier micro-scénario interactif. L'état initial est fabriqué avec les mêmes
// usines et réglages qu'une vraie partie ; toutes les actions de l'utilisateur
// passent ensuite par le reducer normal. Aucune règle parallèle n'est introduite
// pour l'accueil.

import {createInitialState} from '../engine/board.js';
import {makeSoldier, makeUnit} from '../engine/factories.js';
import {BUILDING_STATS, SOLDIER_LEVEL_STATS} from '../engine/rules.js';

export const FUSION_DEMO_MAP_ID = 'demo-fusion-breach';
export const FUSION_DEMO_SOURCE_ID = '0,1';
export const FUSION_DEMO_TARGET_ID = '1,0';
export const FUSION_DEMO_SKELETON_ID = '4,4';
export const FUSION_DEMO_CHEST_ID = '2,2';
export const FUSION_DEMO_TREE_ID = '2,1';
export const FUSION_DEMO_ENEMY_BASE_ID = '6,3';
export const FUSION_DEMO_EXPLORER_ID = '1,2';
export const FUSION_DEMO_RAIDER_ID = '5,4';

const PLAYERS = [
    {id: 'p1', name: 'Vous', color: '#3f6f9f', kind: 'human'},
    {id: 'p2', name: 'La Garde', color: '#b85c36', kind: 'human'},
];

const P1_TERRITORY = [
    '0,0', '1,0', '0,1', '1,1', '0,2', '1,2',
    // Petit avant-poste de siège : permet d'expérimenter immédiatement avec
    // une unité plus avancée, sans imposer un long trajet pédagogique.
    '5,4',
];
const P2_TERRITORY = [
    FUSION_DEMO_ENEMY_BASE_ID,
    '5,3', '6,2', '6,1', '5,2',
    '3,0', FUSION_DEMO_SKELETON_ID,
];

const makeLeveledSoldier = (playerId, uid, level, settings) => ({
    ...makeSoldier(playerId, uid, settings),
    level,
    ...SOLDIER_LEVEL_STATS[level],
});

export function createFusionDemoState() {
    const state = createInitialState(
        FUSION_DEMO_MAP_ID,
        {
            players: PLAYERS,
            settings: {
                randomFirstPlayer: false,
                treeSpawnChance: 0,
                chestSpawnChance: 0,
                maxTurns: 0,
                turnTimer: 0,
            },
        },
        73421,
    );

    const recruitA = makeSoldier('p1', 1, state.settings);
    const recruitB = makeSoldier('p1', 2, state.settings);
    const scout = makeSoldier('p1', 3, state.settings);
    const explorer = makeSoldier('p1', 4, state.settings);
    const raider = makeLeveledSoldier('p1', 5, 3, state.settings);
    const enemyGuard = makeLeveledSoldier('p2', 6, 2, state.settings);
    const skeleton = makeUnit('skeleton', 'p2', 7);
    const goblin = makeUnit('goblin', 'p2', 8);
    const defenseTower = {
        type: 'defenseTower',
        playerId: 'p2',
        ...BUILDING_STATS.defenseTower,
    };

    return {
        ...state,
        ownership: new Map([
            ...P1_TERRITORY.map((id) => [id, 'p1']),
            ...P2_TERRITORY.map((id) => [id, 'p2']),
        ]),
        placements: new Map([
            [FUSION_DEMO_SOURCE_ID, recruitA],
            [FUSION_DEMO_TARGET_ID, recruitB],
            ['0,2', scout],
            [FUSION_DEMO_EXPLORER_ID, explorer],
            [FUSION_DEMO_RAIDER_ID, raider],
            [FUSION_DEMO_TREE_ID, {type: 'tree', kind: 'fire'}],
            ['3,1', {type: 'tree', kind: 'special5'}],
            ['3,3', {type: 'tree', kind: 'forest'}],
            [FUSION_DEMO_CHEST_ID, {type: 'chest'}],
            ['3,0', enemyGuard],
            [FUSION_DEMO_SKELETON_ID, skeleton],
            ['5,2', goblin],
            ['5,3', defenseTower],
        ]),
        gold: {p1: 75, p2: 75},
        // La base ennemie est déjà endommagée : le joueur peut découvrir le
        // siège sans devoir répéter seize attaques dans cette courte démo.
        baseHp: {[FUSION_DEMO_ENEMY_BASE_ID]: 4},
        movedSoldiers: new Set(),
        uidSeq: 8,
    };
}
