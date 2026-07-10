// Session de jeu HORS-LIGNE : expose l'état de la partie et un `dispatch`. C'est
// la frontière entre le jeu et son transport pour le mode local (hotseat).
//
//   { state, dispatch, mode, localPlayerId, isMyTurn, ready }
//
// Le mode ONLINE a sa propre session (`useOnlineSession`, socket.io) de MÊME
// forme : GameLayout consomme indifféremment l'une ou l'autre (injectée en prop).

import { useReducer } from 'react';
import { gameReducer } from '@shared/engine/reducer.js';
import { createInitialState } from '@shared/engine/board.js';
import { DEFAULT_MAP_ID } from '@shared/data/maps.js';

// Règle PURE partagée : ce client peut-il agir ? En hotseat (`localPlayerId ==
// null`), toujours ; en online, seulement quand le joueur actif est le joueur local.
export function isLocalPlayerTurn(state, localPlayerId) {
    return localPlayerId == null || state.activePlayerId === localPlayerId;
}

// Implémentation locale : reducer + état en mémoire. `setup` (optionnel) porte la
// configuration choisie sur la page hors-ligne (joueurs, réglages).
export function useLocalGame(mapId = DEFAULT_MAP_ID, setup = null) {
    const [state, dispatch] = useReducer(gameReducer, { mapId, setup }, (arg) =>
        createInitialState(arg.mapId, arg.setup)
    );
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
    const { mapId, setup } = options;
    return useLocalGame(mapId, setup);
}
