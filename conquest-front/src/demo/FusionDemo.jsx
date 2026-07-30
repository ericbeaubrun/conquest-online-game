import {useState} from 'react';
import HexBoard from '../game/HexBoard.jsx';
import {getLogicalBoard} from '@conquest/shared-engine/engine/board.js';
import {gameReducer} from '@conquest/shared-engine/engine/reducer.js';
import {
    ATTACK_SOLDIER,
    CHOP_TREE,
    MERGE_SOLDIER,
    MOVE_SOLDIER,
    OPEN_CHEST,
    endTurn,
} from '@conquest/shared-engine/engine/actions.js';
import {
    FUSION_DEMO_ENEMY_BASE_ID,
    createFusionDemoState,
} from '@conquest/shared-engine/demo/fusionScenario.js';
import './demo.scss';

const CONQUEST_GOAL = 3;

const OBJECTIVES = [
    {id: 'conquer', label: 'Conquérir 3 cases', detail: 'Étendre votre territoire'},
    {id: 'merge', label: 'Fusionner 2 soldats', detail: 'Créer une unité supérieure'},
    {id: 'chest', label: 'Ouvrir un coffre', detail: 'Révéler un butin aléatoire'},
    {id: 'tree', label: 'Détruire un arbre', detail: 'Récolter son or'},
    {id: 'attack', label: 'Attaquer un ennemi', detail: 'Engager un combat'},
    {id: 'kill', label: 'Éliminer sans mourir', detail: 'Survivre à votre victoire'},
    {id: 'base', label: 'Détruire la base', detail: 'Faire tomber la forteresse orange'},
    {id: 'allCells', label: 'Conquérir toutes les cases', detail: 'Prendre le contrôle de toute la carte'},
    {id: 'allEnemies', label: 'Tuer tous les ennemis', detail: 'Éliminer toutes les forces adverses'},
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
    const board = getLogicalBoard(game.mapId);
    const allCellsConquered = board.cells.every(
        (cell) => game.ownership.get(cell.id) === 'p1',
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

    const nextRound = () => {
        let next = gameReducer(game, endTurn());
        // La garde sert de cible et ne joue pas dans ce terrain d'entraînement :
        // on passe son tour avec la même action moteur, puis on rend la main.
        if (next.status === 'playing' && next.activePlayerId === 'p2') {
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
                                const detail =
                                    objective.id === 'conquer'
                                        ? `${Math.min(progress.conqueredIds.length, CONQUEST_GOAL)}/${CONQUEST_GOAL} cases prises`
                                        : objective.detail;
                                return (
                                    <li className={isDone ? 'done' : ''} key={objective.id}>
                                        <i aria-hidden="true">{isDone ? '✓' : index + 1}</i>
                                        <span>
                                            <strong>{objective.label}</strong>
                                            {detail}
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
                                    <span aria-hidden="true">↻</span>
                                    Recommencer
                                </button>
                                <button
                                    type="button"
                                    className="demo-player__next-turn"
                                    onClick={nextRound}
                                    disabled={game.status !== 'playing'}
                                >
                                    <span aria-hidden="true">»</span>
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
                                    <span aria-hidden="true">✓</span>
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
