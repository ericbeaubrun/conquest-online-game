import {useState} from 'react';
import HexBoard from '../game/HexBoard.jsx';
import {getLogicalBoard} from '@conquest/shared-engine/engine/board.js';
import {gameReducer} from '@conquest/shared-engine/engine/reducer.js';
import {computeReachable} from '@conquest/shared-engine/engine/selectors.js';
import {
    ATTACK_SOLDIER,
    CHOP_TREE,
    MERGE_SOLDIER,
    MOVE_SOLDIER,
    OPEN_CHEST,
    endTurn,
    moveSoldier,
} from '@conquest/shared-engine/engine/actions.js';
import {
    FUSION_DEMO_ENEMY_BASE_ID,
    FUSION_DEMO_ENEMY_TERRITORY,
    createFusionDemoState,
} from '@conquest/shared-engine/demo/fusionScenario.js';
import './demo.scss';

const CONQUEST_GOAL = 3;

const OBJECTIVES = [
    {id: 'conquer', label: 'Conquérir 3 cases'},
    {id: 'merge', label: 'Fusionner 2 soldats'},
    {id: 'chest', label: 'Ouvrir un coffre'},
    {id: 'tree', label: 'Détruire un arbre'},
    {id: 'attack', label: 'Attaquer un ennemi'},
    {id: 'kill', label: 'Éliminer sans mourir'},
    {id: 'base', label: 'Détruire la base'},
    {id: 'allCells', label: 'Conquérir toutes les cases ennemies'},
    {id: 'allEnemies', label: 'Tuer tous les ennemis'},
];

const createProgress = () => ({
    conqueredIds: [],
    merged: false,
    chestOpened: false,
    treeDestroyed: false,
    enemyAttacked: false,
    enemyKilledAlive: false,
    baseDestroyed: false,
});

const objectiveState = (progress, game) => {
    const allCellsConquered = FUSION_DEMO_ENEMY_TERRITORY.every(
        (id) => game.ownership.get(id) === 'p1',
    );
    const allEnemiesKilled = [...game.placements.values()].every(
        (placed) => placed.playerId !== 'p2',
    );

    return {
        conquer: progress.conqueredIds.length >= CONQUEST_GOAL,
        merge: progress.merged,
        chest: progress.chestOpened,
        tree: progress.treeDestroyed,
        attack: progress.enemyAttacked,
        kill: progress.enemyKilledAlive,
        base: progress.baseDestroyed,
        allCells: allCellsConquered,
        allEnemies: allEnemiesKilled,
    };
};

const completedCount = (progress, game) =>
    Object.values(objectiveState(progress, game)).filter(Boolean).length;

const soldierByUid = (game, uid) =>
    [...game.placements.values()].find(
        (placed) => placed.type === 'soldier' && placed.uid === uid,
    );

const FusionDemo = () => {
    const [game, setGame] = useState(createFusionDemoState);
    const [progress, setProgress] = useState(createProgress);
    const [selection, setSelection] = useState(null);
    const done = objectiveState(progress, game);
    const completed = completedCount(progress, game);
    const allCompleted = completed === OBJECTIVES.length;

    const handleDispatch = (action) => {
        const beforeTarget = game.placements.get(action.toId);
        const beforeAttacker = game.placements.get(action.fromId);
        const beforeOwner = game.ownership.get(action.toId);
        const next = gameReducer(game, action);

        if (next === game) {
            return;
        }

        const updated = {
            ...progress,
            conqueredIds: [...progress.conqueredIds],
        };

        const conqueredThisAction =
            action.type === MOVE_SOLDIER &&
            beforeOwner !== 'p1' &&
            next.ownership.get(action.toId) === 'p1' &&
            !updated.conqueredIds.includes(action.toId);
        if (conqueredThisAction) {
            updated.conqueredIds.push(action.toId);
        }
        if (action.type === MERGE_SOLDIER) updated.merged = true;
        if (action.type === OPEN_CHEST && beforeTarget?.type === 'chest') {
            updated.chestOpened = true;
        }
        if (action.type === CHOP_TREE && beforeTarget?.type === 'tree') {
            updated.treeDestroyed = true;
        }
        if (
            action.type === ATTACK_SOLDIER &&
            beforeTarget?.type === 'soldier' &&
            beforeTarget.playerId === 'p2'
        ) {
            updated.enemyAttacked = true;
            const attackerAfter = soldierByUid(next, beforeAttacker?.uid);
            const defenderAfter = soldierByUid(next, beforeTarget.uid);
            if (attackerAfter && !defenderAfter && attackerAfter.hp > 0) {
                updated.enemyKilledAlive = true;
            }
        }
        if (next.destroyedBases.has(FUSION_DEMO_ENEMY_BASE_ID)) {
            updated.baseDestroyed = true;
        }

        setProgress(updated);
        setGame(next);
    };

    const handleSelect = (nextSelection) => {
        setSelection(nextSelection);
    };

    // La garde se déplace pour donner vie au terrain d'entraînement, mais
    // n'attaque jamais : seuls les déplacements/conquêtes de case sont
    // retenus (les cibles de combat renvoyées par computeReachable sont
    // ignorées), pour laisser l'apprenant mener toutes les offensives.
    const moveEnemies = (state) => {
        const board = getLogicalBoard(state.mapId);
        let next = state;
        const soldierIds = [...next.placements.entries()]
            .filter(([, placed]) => placed.type === 'soldier' && placed.playerId === 'p2')
            .map(([id]) => id);

        for (const id of soldierIds) {
            const placed = next.placements.get(id);
            if (!placed || placed.type !== 'soldier' || placed.playerId !== 'p2') continue;
            if (next.movedSoldiers?.has(id)) continue;

            const {moves} = computeReachable(next, board, id);
            const target = [...moves.entries()].find(
                ([, move]) => move.kind === 'move' || move.kind === 'conquer',
            );
            if (target) {
                next = gameReducer(next, moveSoldier(id, target[0]));
            }
        }
        return next;
    };

    const nextRound = () => {
        let next = gameReducer(game, endTurn());
        if (next.status === 'playing' && next.activePlayerId === 'p2') {
            next = moveEnemies(next);
            next = gameReducer(next, endTurn());
        }
        setGame(next);
        setSelection(null);
    };

    const resetChallenge = () => {
        setGame(createFusionDemoState());
        setProgress(createProgress());
        setSelection(null);
    };

    return (
        <section className="demo-showcase" aria-labelledby="demo-title">
            <div className="demo-showcase__glow" aria-hidden="true" />
            <div className="demo-showcase__inner">
                <header className="demo-showcase__heading">
                    <div>
                        <span>TERRAIN D’ENTRAÎNEMENT INTERACTIF</span>
                        <h2 id="demo-title">Explorez. Testez. Conquérez.</h2>
                    </div>
                </header>

                <div className="demo-player demo-player--sandbox">
                    <div className="demo-player__story">
                        <div className="demo-player__copy" key={allCompleted ? 'done' : 'play'}>
                            <span>{allCompleted ? 'MAÎTRISE ACCOMPLIE' : 'VOS MISSIONS'}</span>
                            <h3>
                                {allCompleted
                                    ? 'Le front vous appartient'
                                    : `${completed} / ${OBJECTIVES.length} objectifs`}
                            </h3>
                        </div>

                        <ol className="demo-player__objectives" aria-label="Objectifs du terrain d’entraînement">
                            {OBJECTIVES.map((objective, index) => {
                                const isDone = done[objective.id];
                                const label =
                                    objective.id === 'conquer'
                                        ? `${objective.label} (${Math.min(progress.conqueredIds.length, CONQUEST_GOAL)}/${CONQUEST_GOAL})`
                                        : objective.label;
                                return (
                                    <li className={isDone ? 'done' : ''} key={objective.id}>
                                        <i aria-hidden="true">{isDone ? 'OK' : index + 1}</i>
                                        <span>
                                            <strong>{label}</strong>
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>

                    </div>

                    <div className={`demo-player__board${allCompleted ? ' demo-player__board--success' : ''}`}>
                        <div className="demo-player__boardtop">
                            <div className="demo-player__legend">
                                <span><i className="demo-player__ally" /> Alliés</span>
                                <span><i className="demo-player__enemy" /> Ennemi</span>
                                <span><img src="/characters/chest.png" alt="" /> Coffre</span>
                                <span><img src="/trees/forestTree.png" alt="" /> Ressource</span>
                                <span><img src="/base.png" alt="" /> Base à détruire</span>
                            </div>
                            <div className="demo-player__challenge-actions">
                                <button
                                    type="button"
                                    className="demo-player__reset"
                                    onClick={resetChallenge}
                                >
                                    Recommencer
                                </button>
                                <button
                                    type="button"
                                    className="demo-player__next-turn"
                                    onClick={nextRound}
                                    disabled={game.status !== 'playing'}
                                >
                                    <img src="/skip.png" alt="" aria-hidden="true" />
                                    Tour suivant
                                </button>
                            </div>
                        </div>
                        <div className="demo-player__viewport">
                            <HexBoard
                                game={game}
                                dispatch={handleDispatch}
                                interactive={game.status === 'playing'}
                                selectedItem={null}
                                onDeselectItem={() => setSelection(null)}
                                selection={selection}
                                onSelect={handleSelect}
                                onHoverTarget={() => {}}
                                showAllStats
                                showControls={false}
                                cameraEnabled={false}
                            />
                            {allCompleted && (
                                <div className="demo-player__success" role="status">
                                    <span aria-hidden="true">OK</span>
                                    <strong>FRONT MAÎTRISÉ</strong>
                                    <small>{OBJECTIVES.length} objectifs accomplis</small>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
};

export default FusionDemo;
