// FILET DE SÉCURITÉ DU MOTEUR — verrouille le comportement OBSERVABLE du
// reducer avant refactorisation.
//
// Le moteur est rejoué à l'identique par le client ET par le serveur : deux
// exécutions d'une même graine et d'une même séquence d'actions DOIVENT produire
// un état identique, octet pour octet. Un simple changement d'ORDRE dans la
// consommation du générateur aléatoire suffit à briser cette propriété — sans
// aucune erreur visible, juste des parties online qui désynchronisent.
//
// D'où ces tests « en or » (golden) : ils photographient l'état final sous forme
// d'empreinte. Ils ne décrivent PAS ce que le moteur devrait faire — seulement ce
// qu'il fait AUJOURD'HUI. Un échec ne signale donc pas forcément un bug, mais
// toujours un changement de comportement à valider consciemment.
//
//   node --test shared-engine/test/
//
// Si un écart est INTENTIONNEL (règle modifiée), relancer avec :
//   UPDATE_GOLDEN=1 node --test shared-engine/test/
// puis relire attentivement le diff des empreintes dans golden.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { gameReducer } from '../engine/reducer.js';
import { createInitialState, getLogicalBoard } from '../engine/board.js';
import { serializeState } from '../engine/serialize.js';
import { computeReachable } from '../engine/selectors.js';
import { makeRng } from '../engine/rng.js';
import {
    moveSoldier,
    mergeSoldier,
    attackSoldier,
    chopTree,
    openChest,
    placeItem,
    buyBonus,
    endTurn,
} from '../engine/actions.js';
import { BONUS_OFFERS } from '../data/soldier.js';

const GOLDEN_PATH = fileURLToPath(new URL('./golden.json', import.meta.url));
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const golden = existsSync(GOLDEN_PATH) ? JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) : {};

// Empreinte stable d'un état : on sérialise avec des CLÉS TRIÉES pour que
// l'empreinte ne dépende pas de l'ordre d'insertion des propriétés (qui peut
// changer lors d'une refactorisation sans que le comportement change).
function fingerprint(state) {
    const stable = (v) => {
        if (Array.isArray(v)) return v.map(stable);
        if (v && typeof v === 'object') {
            return Object.fromEntries(
                Object.keys(v)
                    .sort()
                    .map((k) => [k, stable(v[k])])
            );
        }
        return v;
    };
    return createHash('sha256').update(JSON.stringify(stable(serializeState(state)))).digest('hex');
}

// Compare (ou enregistre) une empreinte de référence.
function assertGolden(name, value) {
    if (UPDATE || golden[name] === undefined) {
        golden[name] = value;
        writeFileSync(GOLDEN_PATH, `${JSON.stringify(golden, null, 4)}\n`);
        return;
    }
    assert.equal(
        value,
        golden[name],
        `empreinte '${name}' modifiée : le comportement du moteur a changé.\n` +
            `Si c'est VOULU, relancer avec UPDATE_GOLDEN=1 et relire le diff de golden.json.`
    );
}

// --- Pilote déterministe -----------------------------------------------------
// Joue une partie entière SANS Math.random : le choix des coups vient d'un
// générateur à graine fixe, indépendant de celui du moteur. Deux exécutions
// produisent donc rigoureusement la même séquence d'actions.
function playGame({ mapId = 'continent', seed = 123456789, driverSeed = 42, maxTurns = 40 } = {}) {
    const players = [
        { id: 'p1', name: 'Un', color: '#e11', kind: 'human', spawnIndex: 0 },
        { id: 'p2', name: 'Deux', color: '#11e', kind: 'human', spawnIndex: 1 },
        { id: 'p3', name: 'Trois', color: '#1e1', kind: 'human', spawnIndex: 2 },
    ];
    let state = createInitialState(mapId, { players, settings: {} }, seed);
    const board = getLogicalBoard(mapId);
    const rng = makeRng(driverSeed);
    const log = [];

    const apply = (action) => {
        const next = gameReducer(state, action);
        const changed = next !== state;
        if (changed) log.push(action.type);
        state = next;
        return changed;
    };

    while (state.turn <= maxTurns && state.status !== 'over') {
        const pid = state.activePlayerId;

        // 1. Dépenses : poser un item sur une case possédée et libre, puis tenter
        //    un bonus sur un soldat. Cellules TRIÉES = ordre reproductible.
        const ownedFree = [...state.ownership]
            .filter(([cid, owner]) => owner === pid && !state.placements.has(cid))
            .map(([cid]) => cid)
            .sort();
        if (ownedFree.length) {
            const item = ['soldier', 'house', 'attackTower', 'defenseTower'][rng.int(4)];
            apply(placeItem(ownedFree[rng.int(ownedFree.length)], item));
        }
        const mySoldiers = [...state.placements]
            .filter(([, u]) => u.type === 'soldier' && u.playerId === pid)
            .map(([cid]) => cid)
            .sort();
        if (mySoldiers.length) {
            const offer = BONUS_OFFERS[rng.int(BONUS_OFFERS.length)];
            apply(buyBonus(mySoldiers[rng.int(mySoldiers.length)], offer.id));
        }

        // 2. Coups : chaque soldat joue son coup, choisi parmi ses destinations
        //    atteignables (elles aussi triées).
        for (const fromId of mySoldiers) {
            const unit = state.placements.get(fromId);
            if (!unit || unit.playerId !== pid) continue; // mort ou fusionné entre-temps
            if (state.movedSoldiers.has(unit.uid)) continue;
            const { moves } = computeReachable(state, board, fromId);
            const options = [...moves].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
            if (!options.length) continue;
            const [toId, info] = options[rng.int(options.length)];
            if (info.kind === 'combat') apply(attackSoldier(fromId, toId));
            else if (info.kind === 'chop') apply(chopTree(fromId, toId));
            else if (info.kind === 'openChest') apply(openChest(fromId, toId));
            else if (info.kind === 'merge') apply(mergeSoldier(fromId, toId));
            else apply(moveSoldier(fromId, toId));
        }

        apply(endTurn());
    }
    return { state, log };
}

// --- 1. Rejeu à l'identique --------------------------------------------------
test('une même graine rejoue une partie strictement identique', () => {
    const a = playGame();
    const b = playGame();
    assert.equal(fingerprint(a.state), fingerprint(b.state));
    assert.deepEqual(a.log, b.log);
});

// --- 2. Empreinte de référence de la partie complète -------------------------
test('partie complète : empreinte de référence', () => {
    const { state, log } = playGame();
    // Garde-fou : si la partie s'arrête au 2e coup, l'empreinte ne prouve rien.
    assert.ok(log.length > 300, `partie trop courte (${log.length} actions appliquées)`);
    assertGolden('partieComplete', fingerprint(state));
    assertGolden('partieCompleteActions', createHash('sha256').update(log.join(',')).digest('hex'));
});

// --- 3. Aller-retour de sérialisation ----------------------------------------
test("l'état survit à un aller-retour réseau", async () => {
    const { state } = playGame({ maxTurns: 12 });
    const { deserializeState } = await import('../engine/serialize.js');
    const round = deserializeState(JSON.parse(JSON.stringify(serializeState(state))));
    assert.equal(fingerprint(round), fingerprint(state));
});

// --- 4. Pureté : le reducer ne mute jamais l'état reçu -----------------------
test('le reducer ne mute pas son état d’entrée', () => {
    const { state } = playGame({ maxTurns: 10 });
    const before = fingerprint(state);
    gameReducer(state, endTurn());
    assert.equal(fingerprint(state), before, 'END_TURN a muté l’état d’entrée');
});
