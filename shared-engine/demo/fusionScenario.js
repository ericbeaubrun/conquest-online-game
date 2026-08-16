// Premier micro-scénario interactif. L'état initial est fabriqué avec les mêmes
// usines et réglages qu'une vraie partie ; toutes les actions de l'utilisateur
// passent ensuite par le reducer normal. Aucune règle parallèle n'est introduite
// pour l'accueil.

import {createInitialState} from '../engine/board.js';
import {makeBonusSoldier, makeSoldier, makeUnit} from '../engine/factories.js';
import {BUILDING_STATS, SOLDIER_LEVEL_STATS} from '../engine/rules.js';

export const FUSION_DEMO_MAP_ID = 'demo-fusion-breach';
export const FUSION_DEMO_SOURCE_ID = '0,3';
export const FUSION_DEMO_TARGET_ID = '1,2';
export const FUSION_DEMO_CHEST_ID = '2,1';
export const FUSION_DEMO_TREE_ID = '2,0';
export const FUSION_DEMO_ENEMY_BASE_ID = '5,0';
export const FUSION_DEMO_EXPLORER_ID = '1,1';
export const FUSION_DEMO_RAIDER_ID = '0,1';

const PLAYERS = [
    {id: 'p1', name: 'Vous', color: '#3f6f9f', kind: 'human'},
    {id: 'p2', name: 'Ennemi', color: '#b85c36', kind: 'human'},
];

const P1_TERRITORY = [
    '0,2', '0,0', '0,1', '1,1', '1,2', '0,3',
];
const P2_TERRITORY = [
    FUSION_DEMO_ENEMY_BASE_ID,
    '5,-2', '4,-2', '5,-1', '4,-1', '4,0', '5,1', '4,1', '3,0',
];

// Exposé pour le front : sert à vérifier l'objectif « conquérir toutes les
// cases ennemies » sans dépendre de la totalité du plateau (qui inclut des
// cases neutres non liées au camp adverse).
export const FUSION_DEMO_ENEMY_TERRITORY = P2_TERRITORY;

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
    const veteran = makeLeveledSoldier('p1', 5, 3, state.settings);
    // Les ennemis regardent vers le joueur (à gauche) plutôt que vers leur
    // propre camp, comme le veut la convention « sprite dessiné à droite ».
    const goblinA = {...makeUnit('goblin', 'p2', 6), facing: 'left'};
    const goblinB = {...makeUnit('goblin', 'p2', 7), facing: 'left'};
    const skeletonB = {...makeUnit('skeleton', 'p2', 9), facing: 'left'};
    const warlock = {...makeBonusSoldier('p2', 10, 'warlock', state.settings), facing: 'left'};
    const warlockSkeletonA = {...makeUnit('skeleton2', 'p2', 11), facing: 'left'};
    const warlockSkeletonB = {...makeUnit('skeleton2', 'p2', 12), facing: 'left'};
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
            [FUSION_DEMO_RAIDER_ID, scout],
            [FUSION_DEMO_EXPLORER_ID, explorer],
            ['0,0', veteran],
            [FUSION_DEMO_TREE_ID, {type: 'tree', kind: 'forest'}],
            [FUSION_DEMO_CHEST_ID, {type: 'chest'}],
            ['5,-1', goblinA],
            ['4,-1', goblinB],
            ['5,1', skeletonB],
            ['5,-2', warlock],
            ['4,0', warlockSkeletonA],
            ['4,1', warlockSkeletonB],
            ['3,0', defenseTower],
        ]),
        gold: {p1: 75, p2: 75},
        // La base ennemie est déjà endommagée : le joueur peut découvrir le
        // siège sans devoir répéter seize attaques dans cette courte démo.
        baseHp: {[FUSION_DEMO_ENEMY_BASE_ID]: 4},
        movedSoldiers: new Set(),
        uidSeq: 12,
    };
}
