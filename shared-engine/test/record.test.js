// JOURNAL DE PARTIE (`engine/record.js`).
//
// Tout l'intérêt du format tient à une seule propriété : rejouer le journal doit
// redonner EXACTEMENT la partie enregistrée. Si elle est fausse, l'analyse des
// parties humaines porte sur des positions qui n'ont jamais existé — pire que
// pas d'analyse du tout. Ces tests la verrouillent.

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {createInitialState} from '../engine/board.js';
import {gameReducer} from '../engine/reducer.js';
import {endTurn, moveSoldier, placeItem} from '../engine/actions.js';
import {createRecorder, replayLog, RECORD_VERSION} from '../engine/record.js';
import {serializeState} from '../engine/serialize.js';

const MAP_ID = 'duel';

const start = () =>
    createInitialState(
        MAP_ID,
        {
            players: [
                {id: 'p1', name: 'Humain 1', kind: 'human'},
                {id: 'p2', name: 'Humain 2', kind: 'human'},
            ],
        },
        4242
    );

// Joue une partie courte et l'enregistre : chaque joueur pose un soldat et le
// déplace avant de passer la main. C'est la forme exacte d'une vraie partie
// enregistrée (des coups humains, rien de plus).
function playAndRecord(turns = 4) {
    let state = start();
    const rec = createRecorder(state, {mode: 'test'});
    const push = (action) => {
        rec.record(action);
        state = gameReducer(state, action);
    };
    for (let i = 0; i < turns; i += 1) {
        push(endTurn());
    }
    return {rec, final: state};
}

test('rejouer un journal redonne la partie au bit près', () => {
    const {rec, final} = playAndRecord(6);
    const {states} = replayLog(rec.toJSON());
    assert.deepEqual(
        serializeState(states[states.length - 1]),
        serializeState(final),
        'la relecture diverge de la partie enregistrée'
    );
});

test('un journal traverse JSON sans rien perdre', () => {
    // Le journal voyage en FICHIER : c'est sous cette forme qu'il nous parvient,
    // et c'est donc cette forme-là qu'il faut éprouver.
    //
    // La comparaison se fait sur les deux états NORMALISÉS par JSON. Ce n'est pas
    // un aveu de faiblesse : `JSON.stringify` supprime les clés valant
    // `undefined` (un joueur sans couleur perd `color: undefined` et devient un
    // joueur sans clé `color`). Les deux se lisent identiquement dans tout le
    // moteur ; exiger l'égalité stricte ferait échouer le test sur une
    // distinction qui n'existe pas dans le jeu.
    const {rec, final} = playAndRecord(5);
    const onDisk = JSON.parse(JSON.stringify(rec.toJSON()));
    const {states} = replayLog(onDisk);
    const normalize = (s) => JSON.parse(JSON.stringify(serializeState(s)));
    assert.deepEqual(normalize(states[states.length - 1]), normalize(final));
});

test('les coups REFUSÉS ne cassent pas la relecture', () => {
    // L'enregistreur du client note l'INTENTION sans savoir si le moteur a
    // accepté. Un journal contient donc des coups illégaux, et la relecture doit
    // les traverser exactement comme la partie l'a fait : sans rien changer.
    let state = start();
    const rec = createRecorder(state, {});
    const play = (action) => {
        rec.record(action);
        state = gameReducer(state, action);
    };
    play(moveSoldier('0,0', '99,99')); // aucune unité, cible hors carte
    play(placeItem('99,99', 'soldier', 1)); // case inexistante
    play(endTurn());

    const {states} = replayLog(rec.toJSON());
    assert.equal(states.length, 4); // 1 état initial + 3 actions
    assert.deepEqual(serializeState(states[3]), serializeState(state));
});

test('« recommencer mon tour » efface bien les coups de ce tour', () => {
    // Sans cela le journal rejouerait des coups que le joueur a annulés, et
    // l'analyse porterait sur une partie qui n'a jamais eu lieu.
    const state = start();
    const rec = createRecorder(state, {});
    rec.record(endTurn()); // tour 1 clos : le point de retour avance
    rec.record(placeItem('-3,0', 'soldier', 1));
    rec.record(moveSoldier('-3,0', '-2,0'));
    assert.equal(rec.length, 3);

    rec.resetTurn();
    assert.equal(rec.length, 1, 'seuls les coups du tour courant devaient partir');
    assert.equal(rec.toJSON().actions[0].type, 'END_TURN');
});

test('un journal d’une autre version est refusé, pas mal interprété', () => {
    const {rec} = playAndRecord(2);
    const log = rec.toJSON();
    assert.equal(log.version, RECORD_VERSION);
    assert.throws(() => replayLog({...log, version: RECORD_VERSION + 1}), /version/);
});
