// JOURNAL DE PARTIE — format d'enregistrement et relecture.
//
// À QUOI ÇA SERT. Analyser une partie (bug, déséquilibre, défaite surprenante)
// demande de revoir les positions exactes où les choses ont tourné. Rejouer une
// partie à la main est impossible ; l'enregistrer l'est.
//
// CE QU'ON ENREGISTRE, ET POURQUOI SI PEU. Le moteur est DÉTERMINISTE : un état
// de départ plus une suite d'actions reproduit la partie au bit près (c'est déjà
// ce sur quoi repose tout le mode en ligne). Un journal n'a donc pas à stocker
// les plateaux successifs — l'état INITIAL et la LISTE DES ACTIONS suffisent, et
// tiennent en quelques dizaines de kilo-octets pour une partie entière.
//
// L'état initial est stocké SÉRIALISÉ (`serialize.js`) plutôt que reconstruit
// depuis `(mapId, setup, graine)`. C'est délibéré : `createInitialState` consomme
// éventuellement un tirage (premier joueur au hasard) avant de figer la graine,
// si bien qu'on ne peut pas la retrouver après coup. Repartir de l'état
// sérialisé supprime toute cette subtilité et réutilise un format déjà éprouvé.
//
// TOLÉRANCE AUX COUPS REFUSÉS. Le journal peut contenir des actions que le
// moteur a rejetées (l'enregistreur du client note l'INTENTION, sans attendre de
// savoir si elle a été acceptée). Ce n'est pas un défaut : le reducer ignore un
// coup illégal en renvoyant l'état inchangé, donc la relecture les traverse sans
// bruit. Le journal reste ainsi trivial à produire côté client.

import {serializeState, deserializeState} from './serialize.js';
import {gameReducer} from './reducer.js';
import {END_TURN} from './actions.js';

// Version du format. À incrémenter si la forme change, pour que l'outil
// d'analyse refuse proprement un journal qu'il ne sait plus lire.
export const RECORD_VERSION = 1;

// ENREGISTREUR. Purement accumulateur : aucune écriture de fichier, aucun accès
// réseau — c'est à l'appelant (navigateur ou serveur) de décider où déposer le
// résultat de `toJSON()`.
//
// `meta` accueille tout ce qui aide à retrouver la partie ensuite : date, mode,
// mode de jeu, pseudo de l'adversaire… Rien n'y est obligatoire.
export function createRecorder(initialState, meta = {}) {
    const actions = [];
    // Rang auquel commence le tour courant : c'est là que `resetTurn` ramène.
    let turnStart = 0;

    return {
        // Note une action TENTÉE. On n'exige pas qu'elle ait été acceptée.
        record(action) {
            if (!action || typeof action.type !== 'string') return;
            actions.push(action);
            // Une fin de tour ouvre le tour suivant : le point de retour avance.
            if (action.type === END_TURN) turnStart = actions.length;
        },
        // Le joueur a demandé « recommencer mon tour » : les coups de ce tour
        // n'ont plus eu lieu, on les retire du journal. Sans cela le journal
        // rejouerait des coups que la partie réelle a annulés.
        resetTurn() {
            actions.length = turnStart;
        },
        get length() {
            return actions.length;
        },
        toJSON() {
            return {
                version: RECORD_VERSION,
                meta: {recordedAt: new Date().toISOString(), ...meta},
                initialState: serializeState(initialState),
                actions: actions.slice(),
            };
        },
    };
}

// RELECTURE. Rejoue le journal et livre la suite complète des états, l'état de
// départ compris — `states[i]` est la position AVANT `actions[i]`.
//
// Les coups refusés par le moteur sont conservés dans la liste des états (la
// position ne bouge simplement pas), afin que les rangs restent alignés sur ceux
// du journal : un outil d'analyse peut ainsi citer « action n° 42 » sans avoir à
// corriger un décalage.
export function replayLog(log) {
    if (!log || log.version !== RECORD_VERSION) {
        throw new Error(`journal illisible : version ${log?.version} (attendu ${RECORD_VERSION})`);
    }
    let state = deserializeState(log.initialState);
    const states = [state];
    for (const action of log.actions) {
        state = gameReducer(state, action);
        states.push(state);
    }
    return {states, actions: log.actions, meta: log.meta ?? {}};
}
