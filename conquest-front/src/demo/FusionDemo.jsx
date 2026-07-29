/* eslint-disable react/prop-types */

import {useState} from 'react';
import HexBoard from '../game/HexBoard.jsx';
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

const CONQUEST_GOAL = 5;

const OBJECTIVES = [
    {id: 'conquer', label: 'Conquérir 5 cases', detail: 'Étendre votre territoire'},
    {id: 'merge', label: 'Fusionner 2 soldats', detail: 'Créer une unité supérieure'},
    {id: 'chest', label: 'Ouvrir un coffre', detail: 'Révéler un butin aléatoire'},
    {id: 'tree', label: 'Détruire un arbre', detail: 'Récolter son or'},
    {id: 'attack', label: 'Attaquer un ennemi', detail: 'Engager un combat'},
    {id: 'kill', label: 'Éliminer sans mourir', detail: 'Survivre à votre victoire'},
    {id: 'base', label: 'Détruire la base', detail: 'Faire tomber la forteresse orange'},
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

const objectiveState = (progress) => ({
    conquer: progress.conqueredIds.length >= CONQUEST_GOAL,
    merge: progress.merged,
    chest: progress.chestOpened,
    tree: progress.treeDestroyed,
    attack: progress.enemyAttacked,
    kill: progress.enemyKilledAlive,
    base: progress.baseDestroyed,
});

const completedCount = (progress) =>
    Object.values(objectiveState(progress)).filter(Boolean).length;

const soldierByUid = (game, uid) =>
    [...game.placements.values()].find(
        (placed) => placed.type === 'soldier' && placed.uid === uid,
    );

const actionMessage = (action, progress, conqueredThisAction) => {
    switch (action.type) {
        case MOVE_SOLDIER:
            return conqueredThisAction
                ? `Territoire étendu : ${Math.min(progress.conqueredIds.length, CONQUEST_GOAL)}/${CONQUEST_GOAL} cases conquises.`
                : 'Unité repositionnée sur votre territoire.';
        case MERGE_SOLDIER:
            return 'Fusion réussie : votre nouvelle unité cumule la puissance des deux soldats.';
        case OPEN_CHEST:
            return 'Coffre ouvert ! Son butin est maintenant visible sur le plateau.';
        case CHOP_TREE:
            return 'Arbre détruit : la case est conquise et sa récompense ajoutée à votre trésor.';
        case ATTACK_SOLDIER:
            return progress.baseDestroyed
                ? 'La base ennemie s’effondre. La forteresse orange est tombée !'
                : progress.enemyKilledAlive
                    ? 'Victoire : votre soldat a éliminé sa cible et survécu.'
                    : 'Combat engagé. Les deux unités ont appliqué leurs dégâts.';
        default:
            return 'Action réussie.';
    }
};

const FusionDemo = ({onPlay}) => {
    const [game, setGame] = useState(createFusionDemoState);
    const [progress, setProgress] = useState(createProgress);
    const [selection, setSelection] = useState(null);
    const [hint, setHint] = useState(
        'Explorez librement : sélectionnez une unité bleue pour afficher toutes ses actions possibles.',
    );

    const done = objectiveState(progress);
    const completed = completedCount(progress);
    const allCompleted = completed === OBJECTIVES.length;

    const handleDispatch = (action) => {
        const beforeTarget = game.placements.get(action.toId);
        const beforeAttacker = game.placements.get(action.fromId);
        const beforeOwner = game.ownership.get(action.toId);
        const next = gameReducer(game, action);

        if (next === game) {
            setHint(
                'Action impossible : cette unité a peut-être déjà joué ce tour, ou la cible est hors de portée.',
            );
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
        setHint(actionMessage(action, updated, conqueredThisAction));
        setGame(next);
    };

    const handleSelect = (nextSelection) => {
        setSelection(nextSelection);
        if (!nextSelection) return;

        const placed = game.placements.get(nextSelection.id);
        if (placed?.type === 'soldier' && placed.playerId === 'p1') {
            setHint(
                'Unité sélectionnée : les cases éclairées indiquent déplacements, conquêtes et actions possibles.',
            );
        } else if (placed?.type === 'tree') {
            setHint('Pour abattre cet arbre, sélectionnez d’abord un soldat bleu à portée.');
        } else if (placed?.type === 'chest' || placed?.type === 'loot') {
            setHint('Sélectionnez un soldat bleu, puis le coffre ou son butin.');
        } else if (placed?.playerId === 'p2') {
            setHint('Cible ennemie repérée. Sélectionnez un soldat bleu capable de l’atteindre.');
        }
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
        setHint(
            next.status === 'playing'
                ? `Tour ${next.turn} : toutes vos unités peuvent agir de nouveau.`
                : 'La bataille est terminée. Recommencez pour explorer d’autres possibilités.',
        );
    };

    const resetChallenge = () => {
        setGame(createFusionDemoState());
        setProgress(createProgress());
        setSelection(null);
        setHint(
            'Terrain réinitialisé. Les sept objectifs peuvent être tentés dans l’ordre de votre choix.',
        );
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
                    <p>
                        Sept objectifs, aucun ordre imposé. Expérimentez les
                        mécaniques du vrai jeu et recommencez quand vous le souhaitez.
                    </p>
                </header>

                <div className="demo-player demo-player--sandbox">
                    <div className="demo-player__story">
                        <div className="demo-player__scenario">
                            <span>SCÉNARIO LIBRE</span>
                            <strong>Le siège de la Brèche</strong>
                        </div>

                        <div className="demo-player__copy" key={allCompleted ? 'done' : 'play'}>
                            <span>{allCompleted ? 'MAÎTRISE ACCOMPLIE' : 'VOS MISSIONS'}</span>
                            <h3>
                                {allCompleted
                                    ? 'Le front vous appartient'
                                    : `${completed} / ${OBJECTIVES.length} objectifs`}
                            </h3>
                            <p>
                                {allCompleted
                                    ? 'Vous avez exploré toutes les mécaniques de ce terrain. Vous êtes prêt pour une vraie conquête.'
                                    : 'Tentez ce qui vous attire. Un objectif manqué ne bloque jamais les autres.'}
                            </p>
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

                        <div className="demo-player__stats" aria-live="polite">
                            <div>
                                <span>CONQUÊTES</span>
                                <strong>{Math.min(progress.conqueredIds.length, CONQUEST_GOAL)} / {CONQUEST_GOAL}</strong>
                            </div>
                            <div>
                                <span>OBJECTIFS</span>
                                <strong>{completed} / {OBJECTIVES.length}</strong>
                            </div>
                            <div>
                                <span>TOUR</span>
                                <strong>{game.turn}</strong>
                            </div>
                        </div>

                        <p className={`demo-player__hint${allCompleted ? ' demo-player__hint--success' : ''}`} aria-live="polite">
                            <span aria-hidden="true">{allCompleted ? '★' : '?'}</span>
                            {hint}
                        </p>

                        <div className="demo-player__challenge-actions">
                            <button
                                type="button"
                                className="demo-player__next-turn"
                                onClick={nextRound}
                                disabled={game.status !== 'playing'}
                            >
                                <span aria-hidden="true">»</span>
                                Nouveau tour
                            </button>
                            <button
                                type="button"
                                className="demo-player__reset"
                                onClick={resetChallenge}
                            >
                                <span aria-hidden="true">↻</span>
                                Recommencer
                            </button>
                        </div>
                    </div>

                    <div className={`demo-player__board${allCompleted ? ' demo-player__board--success' : ''}`}>
                        <div className="demo-player__boardtop">
                            <div>
                                <span className="demo-player__live" />
                                À VOUS DE JOUER · TOUR {game.turn}
                            </div>
                            <span>LA BRÈCHE · 49 CASES</span>
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
                                    <small>7 objectifs accomplis</small>
                                </div>
                            )}
                        </div>
                        <div className="demo-player__legend">
                            <span><i className="demo-player__ally" /> Vos forces</span>
                            <span><i className="demo-player__enemy" /> La garde</span>
                            <span><img src="/characters/chest.png" alt="" /> Coffre</span>
                            <span><img src="/base.png" alt="" /> Base</span>
                        </div>
                    </div>
                </div>

                <div className="demo-showcase__cta">
                    <p>
                        Une stratégie différente naît à chaque partie.
                        <span> Écrivez maintenant la vôtre.</span>
                    </p>
                    <button type="button" className="menu-btn menu-btn--demo" onClick={onPlay}>
                        LANCER UNE VRAIE PARTIE
                        <span aria-hidden="true">→</span>
                    </button>
                </div>
            </div>
        </section>
    );
};

export default FusionDemo;
