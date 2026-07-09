// Implémentation ONLINE de la session (socket.io). MÊME signature que
// `useLocalGame` : aucun composant d'affichage n'a à changer. Différence
// fondamentale — le SERVEUR fait autorité :
//   - l'état ne change QUE sur réception d'un 'game:state' (jamais en local) ;
//   - `dispatch(action)` n'applique rien localement, il ÉMET l'action au serveur ;
//   - `localPlayerId` est le siège attribué à CE client (fixe) ; `isMyTurn` en découle.
//
// Un état provisoire en LECTURE SEULE est affiché le temps de la connexion, pour
// ne jamais rendre sur un état nul ; il est remplacé par l'état autoritaire du
// serveur dès le premier 'game:state' (`ready` passe alors à vrai).

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { deserializeState } from '../engine/serialize.js';
import { createInitialState } from '../engine/board.js';
import { DEFAULT_MAP_ID } from '../maps.js';

// URL du serveur de jeu (surchargée par VITE_SERVER_URL en déploiement).
const SERVER_URL = import.meta.env?.VITE_SERVER_URL || 'http://localhost:3000';

export function useOnlineGame({ roomId = 'test', mapId = DEFAULT_MAP_ID, url = SERVER_URL } = {}) {
    // État provisoire tant que le serveur n'a pas répondu (jamais muté localement).
    const [state, setState] = useState(() => createInitialState(mapId));
    const [localPlayerId, setLocalPlayerId] = useState(null); // siège attribué (null = spectateur / en attente)
    const [ready, setReady] = useState(false); // premier état serveur reçu ?
    const [status, setStatus] = useState('connecting'); // 'connecting' | 'connected' | 'error'
    const [lastRejection, setLastRejection] = useState(null); // dernier refus serveur (debug/UI)
    const socketRef = useRef(null);

    useEffect(() => {
        const socket = io(url, { transports: ['websocket'] });
        socketRef.current = socket;

        socket.on('connect', () => {
            setStatus('connected');
            socket.emit('game:join', { roomId });
        });
        socket.on('connect_error', () => setStatus('error'));
        socket.on('disconnect', () => setStatus('error'));
        socket.on('game:assigned', ({ playerId }) => setLocalPlayerId(playerId ?? null));
        socket.on('game:state', (raw) => {
            setState(deserializeState(raw)); // Map/Set reconstruits
            setReady(true);
        });
        socket.on('game:rejected', (r) => setLastRejection(r));

        return () => {
            socket.close();
            socketRef.current = null;
        };
    }, [url, roomId]);

    // N'applique RIEN localement : émet l'intention au serveur, qui rediffusera
    // l'état autoritaire à toute la room.
    const dispatch = useCallback((action) => {
        socketRef.current?.emit('game:action', action);
    }, []);

    // Contrairement au hotseat local, un `localPlayerId` nul ici signifie
    // « pas (encore) de siège » (spectateur) : ce client ne peut donc pas agir.
    const isMyTurn = ready && localPlayerId != null && state.activePlayerId === localPlayerId;

    return { state, dispatch, mode: 'online', localPlayerId, isMyTurn, ready, status, lastRejection };
}
