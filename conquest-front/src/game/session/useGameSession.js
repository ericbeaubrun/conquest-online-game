// Session de jeu HORS-LIGNE : expose l'état de la partie et un `dispatch`. C'est
// la frontière entre le jeu et son transport pour le mode local (hotseat).
//
//   { state, dispatch, mode, localPlayerId, isMyTurn, ready }
//
// Le mode ONLINE a sa propre session (`useOnlineSession`, socket.io) de MÊME
// forme : GameLayout consomme indifféremment l'une ou l'autre (injectée en prop).

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { gameReducer } from '@conquest/shared-engine/engine/reducer.js';
import { createInitialState } from '@conquest/shared-engine/engine/board.js';
import { deserializeState } from '@conquest/shared-engine/engine/serialize.js';
import { DEFAULT_MAP_ID } from '@conquest/shared-engine/data/maps.js';
import { SET_MAP, RESET_GAME, endTurn } from '@conquest/shared-engine/engine/actions.js';
import { restoreTurnStart } from '@conquest/shared-engine/engine/turnReset.js';
import { runBotTurn, isBotTurn } from '@conquest/shared-engine/engine/bot/index.js';
import { startRecording, recordAction, recordResetTurn } from './recorder.js';

// Règle PURE partagée : ce client peut-il agir ? En hotseat (`localPlayerId ==
// null`), c'est vrai quand le joueur actif est un humain (jamais pendant le
// tour d'un bot) ; en online, seulement quand le joueur actif est le joueur
// local.
export function isLocalPlayerTurn(state, localPlayerId) {
    if (localPlayerId == null) return !isBotTurn(state);
    return state.activePlayerId === localPlayerId;
}

// Fait jouer le bot actif dès que la main lui revient, puis termine son tour.
// L'effet ne dépend que du COUPLE (tour, joueur actif) : il ne se relance pas à
// chaque coup.
//
// `runBotTurn` a besoin de l'état APRÈS chaque coup pour décider du suivant, or
// `dispatch` est asynchrone (le nouvel état n'arrive qu'au rendu suivant). On
// tient donc un miroir local calculé avec le MÊME reducer : les actions étant
// rejouées dans le même ordre par le vrai état, les deux restent identiques.
//
// GARDE-FOU d'idempotence (indispensable) : on mémorise l'état déjà joué, par
// identité d'objet. En développement, `StrictMode` invoque l'effet DEUX FOIS sur
// le même montage (setup → cleanup → setup, même instance, même `state`). Sans
// cette garde, le second passage rejoue le tour : ses coups sont refusés (le
// joueur actif a changé) MAIS son `endTurn` s'applique et termine le tour du
// JOUEUR SUIVANT — l'humain était donc « sauté » et le bot rejouait aussitôt
// (le fameux « le bot joue 2× » quand il commence). L'état du jeu étant immuable,
// chaque tour est un objet `state` distinct : la comparaison par référence suffit,
// et un nouvel objet (nouveau tour, nouvelle partie) relance bien le bot.
function useLocalBotDriver(state, dispatch) {
    const { turn, activePlayerId, status } = state;
    const playedState = useRef(null);
    useEffect(() => {
        if (status !== 'playing' || !isBotTurn(state)) return;
        if (playedState.current === state) return; // même état déjà joué (double invocation StrictMode)
        playedState.current = state;
        let mirror = state;
        runBotTurn(state, (action) => {
            const next = gameReducer(mirror, action);
            if (next === mirror) return null; // action refusée : rien n'a bougé
            mirror = next;
            dispatch(action);
            return next;
        });
        dispatch(endTurn());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turn, activePlayerId, status, dispatch]);
}

// Action de SESSION (hors moteur) : demande de retour au début du tour. Elle est
// interceptée par l'enveloppe ci-dessous et n'atteint jamais `gameReducer` — le
// moteur ignore cette notion, faute de mémoire du passé (cf. `turnReset.js`).
const RESET_TURN = '@session/RESET_TURN';

// ENVELOPPE du reducer de jeu. À l'état s'ajoutent le point de retour du tour
// courant (`turnStart`) et un drapeau « quelque chose a été joué depuis »
// (`dirty`, qui pilote l'activation du bouton).
//
// L'instantané est repris à chaque changement de main — et aussi à chaque
// NOUVELLE PARTIE : `RESET_GAME` / `SET_MAP` peuvent rendre la main au même
// joueur au même numéro de tour, un instantané conservé ressusciterait alors la
// partie précédente.
//
// L'état du jeu restant immuable (le reducer recopie systématiquement ses
// structures), garder ce point de retour ne coûte qu'une référence.
function withTurnStart(store, action) {
    if (action.type === RESET_TURN) {
        const present = restoreTurnStart(store.present, store.turnStart);
        return present === store.present ? store : { ...store, present, dirty: false };
    }
    const present = gameReducer(store.present, action);
    if (present === store.present) return store; // coup refusé : rien ne bouge
    const fresh =
        action.type === SET_MAP ||
        action.type === RESET_GAME ||
        present.activePlayerId !== store.present.activePlayerId;
    return fresh
        ? { present, turnStart: present, dirty: false }
        : { present, turnStart: store.turnStart, dirty: true };
}

function initStore(arg) {
    const present = arg.savedState
        ? deserializeState(arg.savedState)
        : createInitialState(arg.mapId, arg.setup);
    // Enregistrement de développement : le journal part de CET état, ce qui rend
    // la partie rejouable au coup près hors ligne (voir `recorder.js`). Inerte —
    // et éliminé à la compilation — en production.
    startRecording(present, { mode: 'local', resumed: !!arg.savedState });
    return { present, turnStart: present, dirty: false };
}

// Implémentation locale : reducer + état en mémoire. `setup` (optionnel) porte la
// configuration choisie sur la page hors-ligne (joueurs, réglages). `savedState`
// (optionnel, prioritaire) est un état sérialisé issu d'une sauvegarde : on le
// désérialise et on reprend la partie exactement où elle en était.
export function useLocalGame(mapId = DEFAULT_MAP_ID, setup = null, savedState = null) {
    const [store, rawDispatch] = useReducer(withTurnStart, { mapId, setup, savedState }, initStore);

    // ENREGISTREMENT (développement uniquement). Le journal se remplit ICI et non
    // dans le reducer : celui-ci est invoqué DEUX FOIS par React en mode strict,
    // ce qui doublerait chaque coup. `dispatch`, lui, ne l'est pas.
    //
    // `SET_MAP` / `RESET_GAME` ne sont pas journalisés mais RELANCENT
    // l'enregistrement : ils reconstruisent une partie sur une graine que
    // l'action ne porte pas toujours, donc les rejouer ne redonnerait pas le
    // même plateau. Repartir de l'état frais supprime le problème.
    const pendingRestart = useRef(false);
    const dispatch = useCallback((action) => {
        if (action.type === RESET_TURN) recordResetTurn();
        else if (action.type === SET_MAP || action.type === RESET_GAME) pendingRestart.current = true;
        else recordAction(action);
        rawDispatch(action);
    }, [rawDispatch]);

    const state = store.present;
    useEffect(() => {
        if (!pendingRestart.current) return;
        pendingRestart.current = false;
        startRecording(state, { mode: 'local', restarted: true });
    }, [state]);

    useLocalBotDriver(state, dispatch);

    // Hotseat : aucun joueur local fixe, le contrôle passe de main en main.
    const localPlayerId = null;
    const isMyTurn = isLocalPlayerTurn(state, localPlayerId);
    const resetTurn = useCallback(() => dispatch({ type: RESET_TURN }), [dispatch]);
    return {
        state,
        dispatch,
        mode: 'local',
        localPlayerId,
        isMyTurn,
        ready: true, // l'état local est disponible immédiatement
        resetTurn,
        // Rien à annuler tant que le joueur n'a rien fait, ni sur une partie
        // terminée.
        canResetTurn: store.dirty && isMyTurn && state.status === 'playing',
    };
}

// Point d'entrée de la session locale.
export function useGameSession(options = {}) {
    const { mapId, setup, savedState } = options;
    return useLocalGame(mapId, setup, savedState);
}
