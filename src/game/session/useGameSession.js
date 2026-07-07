// Session de jeu : point d'entrée unique qui expose l'état de la partie et un
// `dispatch` pour agir dessus. C'est LA frontière entre le jeu et son transport.
//
//   { state, dispatch, mode }
//
// - Mode « local » (hors-ligne, actuel) : l'état vit dans un reducer côté
//   client, chaque action est appliquée immédiatement.
// - Mode « online » (à venir) : un hook `useOnlineGame` de MÊME signature
//   enverra les actions au serveur (socket.io) et appliquera l'état renvoyé.
//   Aucun composant d'affichage n'aura à changer — il suffira de brancher
//   l'autre implémentation ci-dessous.

import { useReducer } from 'react';
import { gameReducer } from '../engine/reducer.js';
import { createInitialState } from '../engine/board.js';
import { DEFAULT_MAP_ID } from '../maps.js';

// Implémentation locale : reducer + état en mémoire.
export function useLocalGame(mapId = DEFAULT_MAP_ID) {
    const [state, dispatch] = useReducer(gameReducer, mapId, createInitialState);
    return { state, dispatch, mode: 'local' };
}

// Sélecteur d'implémentation. `options.mode` pilotera plus tard local/online.
export function useGameSession(options = {}) {
    const { mapId } = options;
    // if (options.mode === 'online') return useOnlineGame(options);
    return useLocalGame(mapId);
}
