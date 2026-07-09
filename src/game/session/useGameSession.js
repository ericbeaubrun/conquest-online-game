// Session de jeu : point d'entrée unique qui expose l'état de la partie et un
// `dispatch` pour agir dessus. C'est LA frontière entre le jeu et son transport.
//
//   { state, dispatch, mode, localPlayerId, isMyTurn }
//
// - Mode « local » (hors-ligne, actuel) : l'état vit dans un reducer côté
//   client, chaque action est appliquée immédiatement. C'est du hotseat : il n'y
//   a PAS de joueur local fixe (`localPlayerId === null`), le contrôle suit le
//   joueur actif — d'où `isMyTurn` toujours vrai.
// - Mode « online » (à venir) : un hook `useOnlineGame` de MÊME signature
//   enverra les actions au serveur (socket.io) et appliquera l'état renvoyé. Il
//   renseignera `localPlayerId` avec l'identité de CE client (fixe) ; `isMyTurn`
//   deviendra alors faux hors de son tour, ce que l'interface exploite déjà pour
//   verrouiller les actions. Aucun composant d'affichage n'aura à changer.

import { useReducer } from 'react';
import { gameReducer } from '../engine/reducer.js';
import { createInitialState } from '../engine/board.js';
import { DEFAULT_MAP_ID } from '../maps.js';
import { useOnlineGame } from './useOnlineGame.js';

// Règle PURE partagée par toutes les implémentations de session : ce client
// peut-il agir maintenant ? En hotseat (`localPlayerId == null`), toujours ; en
// online, seulement quand le joueur actif est bien le joueur local.
export function isLocalPlayerTurn(state, localPlayerId) {
    return localPlayerId == null || state.activePlayerId === localPlayerId;
}

// Implémentation locale : reducer + état en mémoire. `setup` (optionnel) porte
// la configuration choisie sur la page hors-ligne (joueurs, réglages) ; sans lui,
// la partie démarre avec les joueurs/valeurs par défaut de la carte.
export function useLocalGame(mapId = DEFAULT_MAP_ID, setup = null) {
    // On passe l'init au reducer via une action paresseuse : la fabrique reçoit
    // { mapId, setup } et construit l'état de départ correspondant.
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
        ready: true, // l'état local est disponible immédiatement (aucune connexion)
    };
}

// Sélecteur d'implémentation : choisit le transport selon `options.mode`. Le mode
// est FIXE pour la durée de vie du composant (on ne bascule pas local⇆online sans
// remonter l'écran), donc l'appel conditionnel de hook ci-dessous est sûr.
/* eslint-disable react-hooks/rules-of-hooks -- le mode est FIXE par montage :
   un seul des deux hooks est appelé, toujours le même, pour la durée de vie du
   composant. L'ordre des hooks est donc stable entre rendus (garantie exigée). */
export function useGameSession(options = {}) {
    const { mode, mapId, setup } = options;
    if (mode === 'online') {
        return useOnlineGame(options);
    }
    return useLocalGame(mapId, setup);
}
/* eslint-enable react-hooks/rules-of-hooks */
