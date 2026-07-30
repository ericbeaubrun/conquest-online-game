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
import { restoreTurnStart } from '@conquest/shared-engine/engine/turnReset.js';

const SERVER_URL = import.meta.env?.VITE_SERVER_URL || 'http://localhost:3000';

// Identité du joueur (nom + couleur) MÉMORISÉE côté client : elle pré-remplit le
// nom à chaque création/jointure de partie. Stockée en localStorage.
const IDENTITY_KEY = 'conquest.identity';
function loadIdentity() {
    try {
        return JSON.parse(localStorage.getItem(IDENTITY_KEY)) || {};
    } catch {
        return {};
    }
}
function saveIdentity(patch) {
    const next = { ...loadIdentity(), ...patch };
    try {
        localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
    } catch {
        /* stockage indisponible : on ignore, la mémorisation est un bonus */
    }
    return next;
}

export function useOnlineSession() {
    const socketRef = useRef(null);
    const [phase, setPhase] = useState('connecting'); // 'connecting'|'browsing'|'error'
    const [error, setError] = useState(null);
    const [lobbies, setLobbies] = useState([]); // parties ouvertes (navigation)
    const [lobby, setLobby] = useState(null); // salle rejointe { code, name, mapId, status, hostMemberId, seats }
    const [memberId, setMemberId] = useState(null); // identité stable de CE client dans la salle
    const [gameState, setGameState] = useState(null); // état de jeu (une fois la partie démarrée)
    // Choix de place en rejoignant une partie EN COURS : liste des couleurs libres
    // à reprendre. `null` = aucun choix en attente (salle d'attente, ou déjà placé).
    const [seatOptions, setSeatOptions] = useState(null);
    const serverStateRef = useRef(null); // dernier état reçu du serveur (autorité), pour rollback
    // Point de retour du tour courant, pris sur les états FAISANT AUTORITÉ (jamais
    // sur un état optimiste). Le serveur garde le sien — seul valable — ; celui-ci
    // ne sert qu'à afficher la restitution sans attendre l'aller-retour.
    const turnStartRef = useRef(null);
    // Un coup a-t-il été joué depuis le début du tour ? Pilote l'activation du
    // bouton (un retour arrière « à vide » n'aurait rien à restituer).
    const [turnDirty, setTurnDirty] = useState(false);

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
        socket.on('lobby:joined', ({ memberId: mid, lobby: joined, needsSeat, seatOptions: opts }) => {
            setMemberId(mid ?? null);
            setLobby(joined);
            // Partie en cours à rejoindre : on doit choisir sa couleur parmi les
            // places libres (modal). Sinon rien à choisir.
            setSeatOptions(needsSeat ? opts || [] : null);
        });
        // Place confirmée après un choix : on referme le modal (la position est
        // désormais déduite des sièges via lobby:update).
        socket.on('lobby:seat-confirmed', () => setSeatOptions(null));
        // Place prise entre-temps : on réaffiche les options restantes.
        socket.on('lobby:seat-taken', ({ seatOptions: opts }) => {
            setError('seat-taken');
            setSeatOptions(opts || []);
        });
        socket.on('lobby:left', () => {
            setLobby(null);
            setMemberId(null);
            setSeatOptions(null);
            setGameState(null);
            serverStateRef.current = null;
            turnStartRef.current = null;
            setTurnDirty(false);
            socket.emit('lobby:list');
        });
        socket.on('lobby:update', ({ code, status, mapId, settings, hostMemberId, seats, autosave, savePassword }) => {
            setLobby((prev) =>
                prev && prev.code === code
                    ? { ...prev, status, mapId, settings, hostMemberId, seats, autosave, savePassword }
                    : prev
            );
        });
        // État serveur = autorité. Il remplace tout état optimiste local et sert
        // de point de retour en cas de coup refusé.
        socket.on('game:state', (raw) => {
            const s = deserializeState(raw);
            serverStateRef.current = s;
            // Nouveau tour (la main a changé) ou nouvelle partie (le compteur de
            // tours est reparti) : cet état devient le point de retour. Sinon on
            // conserve celui du tour en cours — y compris quand l'état reçu est
            // justement une restitution, qui ne doit pas se prendre elle-même
            // pour un nouveau départ.
            const prev = turnStartRef.current;
            if (!prev || prev.activePlayerId !== s.activePlayerId || prev.turn !== s.turn) {
                turnStartRef.current = s;
                setTurnDirty(false);
            }
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
        // On envoie l'identité mémorisée : le serveur pré-attribue ce nom/couleur.
        const { name, color } = loadIdentity();
        socketRef.current?.emit('lobby:create', { mapId, settings, name, color });
    }, []);
    const refreshList = useCallback(() => socketRef.current?.emit('lobby:list'), []);
    const leaveLobby = useCallback(() => {
        setError(null);
        // Le retour vers la liste doit être immédiat : le nettoyage du salon et
        // sa persistance peuvent prendre un peu de temps côté serveur.
        setLobby(null);
        setMemberId(null);
        setSeatOptions(null);
        setGameState(null);
        serverStateRef.current = null;
        turnStartRef.current = null;
        setTurnDirty(false);
        socketRef.current?.emit('lobby:leave');
    }, []);
    // Configuration de la partie en attente (hôte) : carte et/ou réglages.
    const configureLobby = useCallback((patch) => {
        setError(null);
        socketRef.current?.emit('lobby:configure', { code: lobby?.code, ...patch });
    }, [lobby?.code]);
    // Réordonnancement des positions (hôte) : déplace un siège vers le haut/bas.
    const reorderSeat = useCallback((playerId, direction) => {
        socketRef.current?.emit('lobby:reorder', { code: lobby?.code, playerId, direction });
    }, [lobby?.code]);
    // Bascule une place LIBRE entre « ouverte » et « bot » (hôte).
    const setSeatKind = useCallback((playerId, kind) => {
        socketRef.current?.emit('lobby:seatkind', { code: lobby?.code, playerId, kind });
    }, [lobby?.code]);
    // Change la difficulté d'un siège bot (hôte).
    const setBotDifficulty = useCallback((playerId, difficulty) => {
        socketRef.current?.emit('lobby:botdifficulty', { code: lobby?.code, playerId, difficulty });
    }, [lobby?.code]);
    // Position (playerId) de CE client, DÉDUITE des sièges : elle suit le membre,
    // donc elle change automatiquement quand l'hôte réordonne les joueurs.
    const localPlayerId = useMemo(() => {
        const seat = lobby?.seats?.find((s) => s.assignedMemberId === memberId);
        return seat?.playerId ?? null;
    }, [lobby?.seats, memberId]);
    const joinLobby = useCallback((code, password) => {
        setError(null);
        const { name, color } = loadIdentity();
        socketRef.current?.emit('lobby:join', {
            code: (code || '').trim().toUpperCase(),
            name,
            color,
            password,
        });
    }, []);
    // Modifie SON identité (nom / couleur) : mémorise côté client ET informe le
    // serveur (qui rediffuse aux autres joueurs de la salle).
    const setIdentity = useCallback((patch) => {
        saveIdentity(patch);
        socketRef.current?.emit('lobby:identity', { code: lobby?.code, ...patch });
    }, [lobby?.code]);
    const startLobby = useCallback(() => {
        socketRef.current?.emit('lobby:start', { code: lobby?.code });
    }, [lobby?.code]);
    // Choisir sa place (couleur) en rejoignant une partie en cours.
    const chooseSeat = useCallback((playerId) => {
        setError(null);
        socketRef.current?.emit('lobby:claimseat', { code: lobby?.code, playerId });
    }, [lobby?.code]);
    // Renoncer au choix et rester simple spectateur (referme le modal).
    const spectate = useCallback(() => setSeatOptions(null), []);

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
        setTurnDirty(true);
        socket.emit('game:action', action);
    }, []);

    // --- Retour au début de son tour ---
    // Contrairement à une action de jeu, ce n'est PAS une action du moteur : le
    // serveur détient l'instantané (un client ne peut donc pas injecter un état
    // arbitraire) et rediffusera l'état restauré. On l'applique quand même
    // localement d'abord : la restitution étant déterministe et notre instantané
    // venant du serveur, l'état diffusé sera le même — aucun clignotement.
    //
    // L'opération est ABSOLUE (elle vise un état fixe, pas « le dernier coup ») :
    // deux demandes consécutives, ou une demande croisant un coup encore en vol,
    // aboutissent au même résultat.
    const resetTurn = useCallback(() => {
        const socket = socketRef.current;
        if (!socket) return;
        setGameState((prev) => restoreTurnStart(prev, turnStartRef.current));
        setTurnDirty(false);
        socket.emit('game:reset-turn');
    }, []);

    // Session de jeu au format attendu par GameLayout. `ready` vrai dès qu'un état
    // serveur est arrivé ; `isMyTurn` faux hors de son tour ou en spectateur.
    const session = useMemo(() => {
        const isMyTurn =
            !!gameState && localPlayerId != null && gameState.activePlayerId === localPlayerId;
        return {
            state: gameState,
            dispatch,
            mode: 'online',
            localPlayerId,
            ready: !!gameState,
            isMyTurn,
            resetTurn,
            // Jamais hors de son tour : on ne rejoue que SON propre tour.
            canResetTurn: turnDirty && isMyTurn && gameState?.status === 'playing',
        };
    }, [gameState, dispatch, localPlayerId, resetTurn, turnDirty]);

    return { phase, error, lobbies, lobby, memberId, localPlayerId, gameState, session, seatOptions, chooseSeat, spectate, createLobby, refreshList, leaveLobby, joinLobby, setIdentity, configureLobby, reorderSeat, setSeatKind, setBotDifficulty, startLobby };
}
