// Session de jeu HORS-LIGNE : expose l'état de la partie et un `dispatch`. C'est
// la frontière entre le jeu et son transport pour le mode local (hotseat).
//
//   { state, dispatch, mode, localPlayerId, isMyTurn, ready }
//
// Le mode ONLINE a sa propre session (`useOnlineSession`, socket.io) de MÊME
// forme : GameLayout consomme indifféremment l'une ou l'autre (injectée en prop).

import { useEffect, useReducer } from 'react';
import { gameReducer } from '@conquest/shared-engine/engine/reducer.js';
import { createInitialState } from '@conquest/shared-engine/engine/board.js';
import { deserializeState } from '@conquest/shared-engine/engine/serialize.js';
import { DEFAULT_MAP_ID } from '@conquest/shared-engine/data/maps.js';
import { endTurn } from '@conquest/shared-engine/engine/actions.js';
import { runBotTurn, isBotTurn } from '@conquest/shared-engine/engine/bot.js';

// Règle PURE partagée : ce client peut-il agir ? En hotseat (`localPlayerId ==
// null`), quand le joueur actif est un humain (jamais pendant le tour d'un
// bot) ; en online, seulement quand le joueur actif est le joueur local.
export function isLocalPlayerTurn(state, localPlayerId) {
    if (localPlayerId == null) return !isBotTurn(state);
    return state.activePlayerId === localPlayerId;
}

// Cadence des coups d'un bot local (ms) : assez lent pour que l'humain VOIE le
// bot jouer coup par coup, assez rapide pour ne pas traîner.
const BOT_STEP_MS = 100;

// PILOTE DES BOTS LOCAUX. Quand le tour passe à un bot, on calcule son tour
// complet (mêmes règles que les joueurs : chaque coup passe par le reducer) puis
// on REJOUE ses actions une à une, à intervalle régulier, sur le vrai store —
// le reducer étant déterministe, la relecture reproduit exactement la
// simulation. L'effet ne dépend que du COUPLE (tour, joueur actif) : il ne se
// relance pas à chaque coup du bot, et son nettoyage coupe la cadence si la
// partie est quittée/réinitialisée en cours de tour.
function useLocalBotDriver(state, dispatch) {
    const { turn, activePlayerId, status } = state;
    useEffect(() => {
        if (status !== 'playing' || !isBotTurn(state)) return undefined;

        // Simulation du tour : on collecte les actions ACCEPTÉES par le reducer.
        const actions = [];
        let cur = state;
        runBotTurn(cur, (action) => {
            const next = gameReducer(cur, action);
            if (next === cur) return null; // coup rejeté : le bot n'insiste pas
            actions.push(action);
            cur = next;
            return next;
        });
        actions.push(endTurn());

        // Relecture cadencée sur le store réel.
        let i = 0;
        const timer = setInterval(() => {
            if (i >= actions.length) {
                clearInterval(timer);
                return;
            }
            dispatch(actions[i]);
            i += 1;
        }, BOT_STEP_MS);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turn, activePlayerId, status, dispatch]);
}

// Implémentation locale : reducer + état en mémoire. `setup` (optionnel) porte la
// configuration choisie sur la page hors-ligne (joueurs, réglages). `savedState`
// (optionnel, prioritaire) est un état sérialisé issu d'une sauvegarde : on le
// désérialise et on reprend la partie exactement où elle en était.
export function useLocalGame(mapId = DEFAULT_MAP_ID, setup = null, savedState = null) {
    const [state, dispatch] = useReducer(gameReducer, { mapId, setup, savedState }, (arg) =>
        arg.savedState ? deserializeState(arg.savedState) : createInitialState(arg.mapId, arg.setup)
    );
    useLocalBotDriver(state, dispatch);
    // Hotseat : aucun joueur local fixe, le contrôle passe de main en main.
    const localPlayerId = null;
    return {
        state,
        dispatch,
        mode: 'local',
        localPlayerId,
        isMyTurn: isLocalPlayerTurn(state, localPlayerId),
        ready: true, // l'état local est disponible immédiatement
    };
}

// Point d'entrée de la session locale.
export function useGameSession(options = {}) {
    const { mapId, setup, savedState } = options;
    return useLocalGame(mapId, setup, savedState);
}
