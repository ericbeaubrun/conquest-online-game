// Couche transport socket.io : gestion des LOBBIES (création, liste, rejoindre,
// démarrer) et du JEU (actions, synchronisation). Le serveur fait autorité et
// persiste tout via `lobbyStore` (MongoDB). Le client émet des intentions ; le
// serveur valide, applique le moteur partagé, persiste, puis rediffuse l'état.
//
// Protocole
//   client -> serveur
//     'lobby:create' { mapId?, settings?, name? }   crée une partie, l'émetteur devient hôte (siège p1)
//     'lobby:list'                                   demande la liste des parties ouvertes
//     'lobby:join'   { code }                        rejoint une partie (siège libre) ou l'observe
//     'lobby:start'  { code }                        (hôte) démarre la partie
//     'game:action'  action                          joue une action de jeu
//   serveur -> client
//     'lobby:list'    [ résumés ]
//     'lobby:joined'  { code, playerId|null, lobby } (à l'émetteur qui rejoint)
//     'lobby:update'  { code, status, seats }        (à toute la salle : présence/statut)
//     'lobby:error'   { reason }
//     'game:state'    <état sérialisé>               (à toute la salle)
//     'game:rejected' { reason, action? }            (au seul émetteur)

import { serializeState } from './exportEngine.js';
import {
    createLobby,
    getLobby,
    listLobbies,
    claimSeat,
    releaseSeat,
    seatSummary,
    startLobby,
    applyAction,
} from './lobbyStore.js';

// Seules les actions de JEU sont acceptées d'un client. La configuration de la
// partie (carte, réinitialisation) reste une prérogative du serveur.
const CLIENT_ALLOWED_ACTIONS = new Set([
    'MOVE_SOLDIER',
    'MERGE_SOLDIER',
    'ATTACK_SOLDIER',
    'CHOP_TREE',
    'PLACE_ITEM',
    'BUY_BONUS',
    'END_TURN',
]);

// Diffuse présence + statut d'un lobby à toute sa salle.
function broadcastLobby(io, entry) {
    io.to(entry.code).emit('lobby:update', {
        code: entry.code,
        status: entry.status,
        seats: seatSummary(entry),
    });
}

// Fait entrer un socket dans un lobby : lui attribue un siège et l'abonne à la
// salle. Facteur commun de create et join.
function enterLobby(socket, entry) {
    socket.data.code = entry.code;
    socket.join(entry.code);
    const playerId = claimSeat(entry, socket.id);
    socket.data.playerId = playerId;
    socket.emit('lobby:joined', {
        code: entry.code,
        playerId,
        lobby: {
            code: entry.code,
            name: entry.name,
            mapId: entry.mapId,
            status: entry.status,
            settings: entry.settings,
            seats: seatSummary(entry),
        },
    });
    // Partie déjà en cours : envoie l'état courant au nouvel arrivant.
    if (entry.state) socket.emit('game:state', serializeState(entry.state));
    return playerId;
}

export function attachGameServer(io) {
    io.on('connection', (socket) => {
        // eslint-disable-next-line no-console
        console.log(`[socket] connecté : ${socket.id}`);

        // --- Créer une partie ---
        socket.on('lobby:create', async ({ mapId, settings, name } = {}) => {
            try {
                const entry = await createLobby({ mapId, settings, name });
                const playerId = enterLobby(socket, entry);
                broadcastLobby(io, entry);
                // eslint-disable-next-line no-console
                console.log(`[lobby] ${socket.id} crée '${entry.code}' (${entry.mapId}) comme ${playerId}`);
            } catch (e) {
                socket.emit('lobby:error', { reason: 'create-failed', message: String(e.message || e) });
            }
        });

        // --- Lister les parties ouvertes ---
        socket.on('lobby:list', async () => {
            try {
                socket.emit('lobby:list', await listLobbies());
            } catch (e) {
                socket.emit('lobby:error', { reason: 'list-failed', message: String(e.message || e) });
            }
        });

        // --- Rejoindre une partie ---
        socket.on('lobby:join', async ({ code } = {}) => {
            try {
                const entry = await getLobby((code || '').toUpperCase());
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                const playerId = enterLobby(socket, entry);
                broadcastLobby(io, entry);
                // eslint-disable-next-line no-console
                console.log(`[lobby] ${socket.id} rejoint '${entry.code}' comme ${playerId || 'spectateur'}`);
            } catch (e) {
                socket.emit('lobby:error', { reason: 'join-failed', message: String(e.message || e) });
            }
        });

        // --- Démarrer la partie (hôte = titulaire du 1er siège) ---
        socket.on('lobby:start', async ({ code } = {}) => {
            try {
                const entry = await getLobby(code || socket.data.code);
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                if (socket.data.playerId !== entry.seats[0]?.playerId) {
                    socket.emit('lobby:error', { reason: 'not-host' });
                    return;
                }
                await startLobby(entry);
                broadcastLobby(io, entry);
                io.to(entry.code).emit('game:state', serializeState(entry.state));
                // eslint-disable-next-line no-console
                console.log(`[lobby] '${entry.code}' démarrée par ${socket.id}`);
            } catch (e) {
                socket.emit('lobby:error', { reason: 'start-failed', message: String(e.message || e) });
            }
        });

        // --- Jouer une action ---
        socket.on('game:action', async (action) => {
            try {
                const entry = await getLobby(socket.data.code);
                const playerId = socket.data.playerId;
                if (!entry || !entry.state) {
                    socket.emit('game:rejected', { reason: 'no-game', action });
                    return;
                }
                if (!action || !CLIENT_ALLOWED_ACTIONS.has(action.type)) {
                    socket.emit('game:rejected', { reason: 'action-not-allowed', action });
                    return;
                }
                if (playerId == null) {
                    socket.emit('game:rejected', { reason: 'spectator', action });
                    return;
                }
                // AUTORITÉ DE TOUR : seul le joueur actif peut agir.
                if (entry.state.activePlayerId !== playerId) {
                    socket.emit('game:rejected', { reason: 'not-your-turn', action });
                    return;
                }
                const next = await applyAction(entry, action); // applique + persiste
                if (!next) {
                    socket.emit('game:rejected', { reason: 'illegal-action', action });
                    return;
                }
                io.to(entry.code).emit('game:state', serializeState(next));
                if (next.status === 'over') broadcastLobby(io, entry);
            } catch (e) {
                socket.emit('game:rejected', { reason: 'server-error', message: String(e.message || e) });
            }
        });

        // --- Déconnexion : libère le siège et informe la salle ---
        socket.on('disconnect', async () => {
            try {
                if (socket.data.code) {
                    const entry = await getLobby(socket.data.code);
                    if (entry) {
                        releaseSeat(entry, socket.id);
                        broadcastLobby(io, entry);
                    }
                }
            } catch {
                /* déconnexion : rien de critique si le nettoyage échoue */
            }
            // eslint-disable-next-line no-console
            console.log(`[socket] déconnecté : ${socket.id}`);
        });
    });
}
