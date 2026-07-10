// Session ONLINE complète : possède UNE connexion socket.io qui vit du lobby
// jusqu'à la partie (elle ne doit surtout pas être recréée entre les deux, sinon
// le siège serait perdu). Le hook gère :
//   - la phase (connexion → navigation lobby → salle d'attente → jeu) ;
//   - l'état du lobby (liste, salle rejointe, sièges, siège local) ;
//   - la session de JEU exposée à GameLayout ({ state, dispatch, isMyTurn... }),
//     avec le SERVEUR pour autorité : l'état ne change que sur 'game:state' et
//     `dispatch` émet l'action au serveur.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { deserializeState } from '@conquest/shared-engine/engine/serialize.js';
import { gameReducer } from '@conquest/shared-engine/engine/reducer.js';

const SERVER_URL = import.meta.env?.VITE_SERVER_URL || 'http://localhost:3000';

export function useOnlineSession() {
    const socketRef = useRef(null);
    const [phase, setPhase] = useState('connecting'); // 'connecting'|'browsing'|'error'
    const [error, setError] = useState(null);
    const [lobbies, setLobbies] = useState([]); // parties ouvertes (navigation)
    const [lobby, setLobby] = useState(null); // salle rejointe { code, name, mapId, status, seats }
    const [localPlayerId, setLocalPlayerId] = useState(null); // siège attribué (null = spectateur)
    const [gameState, setGameState] = useState(null); // état de jeu (une fois la partie démarrée)
    const serverStateRef = useRef(null); // dernier état reçu du serveur (autorité), pour rollback

    useEffect(() => {
        const socket = io(SERVER_URL, { transports: ['websocket'] });
        socketRef.current = socket;

        socket.on('connect', () => {
            setPhase((p) => (p === 'connecting' ? 'browsing' : p));
            socket.emit('lobby:list');
        });
        socket.on('connect_error', () => {
            setError('Connexion au serveur impossible.');
            setPhase('error');
        });
        socket.on('lobby:list', setLobbies);
        socket.on('lobby:error', (e) => setError(e.reason || 'erreur lobby'));
        socket.on('lobby:joined', ({ playerId, lobby: joined }) => {
            setLocalPlayerId(playerId ?? null);
            setLobby(joined);
        });
        socket.on('lobby:update', ({ code, status, seats }) => {
            setLobby((prev) => (prev && prev.code === code ? { ...prev, status, seats } : prev));
        });
        // État serveur = autorité. Il remplace tout état optimiste local et sert
        // de point de retour en cas de coup refusé.
        socket.on('game:state', (raw) => {
            const s = deserializeState(raw);
            serverStateRef.current = s;
            setGameState(s);
        });
        // Coup refusé par le serveur : on annule l'optimisme en revenant au
        // dernier état faisant autorité.
        socket.on('game:rejected', () => {
            if (serverStateRef.current) setGameState(serverStateRef.current);
        });

        return () => {
            socket.close();
            socketRef.current = null;
        };
    }, []);

    // --- Actions lobby ---
    const createLobby = useCallback((mapId, settings) => {
        setError(null);
        socketRef.current?.emit('lobby:create', { mapId, settings });
    }, []);
    const refreshList = useCallback(() => socketRef.current?.emit('lobby:list'), []);
    const joinLobby = useCallback((code) => {
        setError(null);
        socketRef.current?.emit('lobby:join', { code: (code || '').trim().toUpperCase() });
    }, []);
    const startLobby = useCallback(() => {
        socketRef.current?.emit('lobby:start', { code: lobby?.code });
    }, [lobby?.code]);

    // --- Action de jeu : appliquée OPTIMISTE localement, puis émise au serveur ---
    // On rejoue le coup tout de suite avec le même moteur déterministe que le
    // serveur (même seed embarquée dans l'état) → ressenti instantané. Le serveur
    // reste l'autorité : son 'game:state' remplacera cet état, et 'game:rejected'
    // le fera revenir en arrière (voir serverStateRef).
    const dispatch = useCallback((action) => {
        const socket = socketRef.current;
        if (!socket) return;
        setGameState((prev) => {
            if (!prev) return prev;
            const next = gameReducer(prev, action);
            return next === prev ? prev : next; // no-op si le moteur juge le coup illégal
        });
        socket.emit('game:action', action);
    }, []);

    // Session de jeu au format attendu par GameLayout. `ready` vrai dès qu'un état
    // serveur est arrivé ; `isMyTurn` faux hors de son tour ou en spectateur.
    const session = useMemo(
        () => ({
            state: gameState,
            dispatch,
            mode: 'online',
            localPlayerId,
            ready: !!gameState,
            isMyTurn:
                !!gameState && localPlayerId != null && gameState.activePlayerId === localPlayerId,
        }),
        [gameState, dispatch, localPlayerId]
    );

    return { phase, error, lobbies, lobby, localPlayerId, gameState, session, createLobby, refreshList, joinLobby, startLobby };
}
