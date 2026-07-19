// Couche transport socket.io : gestion des LOBBIES (création, liste, rejoindre,
// démarrer) et du JEU (actions, synchronisation). Le serveur fait autorité et
// persiste tout via `lobbyStore` (MongoDB). Le client émet des intentions ; le
// serveur valide, applique le moteur partagé, persiste, puis rediffuse l'état.
//
// Protocole
//   client -> serveur
//     'lobby:create' { mapId?, settings?, name?, color? }  crée une partie, l'émetteur devient hôte
//     'lobby:list'                                   demande la liste des parties ouvertes
//     'lobby:join'   { code, name?, color? }         rejoint une partie (siège libre) ou l'observe
//     'lobby:identity' { name?, color? }             modifie SON nom / SA couleur
//     'lobby:configure' { code, mapId?, settings? }  (hôte) règle carte/paramètres avant le démarrage
//     'lobby:seatkind' { code, playerId, kind }      (hôte) bascule une place libre entre 'human'/'bot'
//     'lobby:botcolor' { code, playerId, color }     (hôte) change la couleur d'un bot
//     'lobby:botdifficulty' { code, playerId, difficulty }  (hôte) change la difficulté d'un bot
//     'lobby:reorder' { code, playerId, direction }  (hôte) échange une position avec sa voisine (up/down)
//     'lobby:start'  { code }                        (hôte) démarre la partie
//     'game:action'  action                          joue une action de jeu
//   serveur -> client
//     'lobby:list'    [ résumés ]
//     'lobby:joined'  { code, memberId, playerId|null, lobby } (à l'émetteur qui rejoint)
//     'lobby:update'  { code, status, mapId, settings, hostMemberId, seats } (à toute la salle)
//     'lobby:error'   { reason }
//     'game:state'    <état sérialisé>               (à toute la salle)
//     'game:rejected' { reason, action? }            (au seul émetteur)

import { serializeState } from './exportEngine.js';
import { endTurn } from '@conquest/shared-engine/engine/actions.js';
import {
    createLobby,
    getLobby,
    listLobbies,
    claimSeat,
    registerMember,
    joinableSeats,
    claimSpecificSeat,
    releaseSeat,
    deleteLobby,
    saveLobby,
    resumeLobby,
    checkSavePassword,
    seatSummary,
    setMemberIdentity,
    setSeatKind,
    setBotColor,
    setBotDifficulty,
    filledCount,
    reorderSeat,
    configureLobby,
    startLobby,
    applyAction,
} from './lobbyStore.js';
import { pickBotAction } from './bot.js';

// Seules les actions de JEU sont acceptées d'un client. La configuration de la
// partie (carte, réinitialisation) reste une prérogative du serveur.
const CLIENT_ALLOWED_ACTIONS = new Set([
    'MOVE_SOLDIER',
    'MERGE_SOLDIER',
    'ATTACK_SOLDIER',
    'CHOP_TREE',
    'OPEN_CHEST',
    'PLACE_ITEM',
    'BUY_BONUS',
    'END_TURN',
]);

// Diffuse présence + statut + configuration d'un lobby à toute sa salle. On y
// inclut la carte et les réglages pour que le paramétrage de l'hôte (salle
// d'attente) soit répercuté en direct chez les autres joueurs.
function broadcastLobby(io, entry) {
    io.to(entry.code).emit('lobby:update', {
        code: entry.code,
        status: entry.status,
        mapId: entry.mapId,
        settings: entry.settings,
        hostMemberId: entry.hostMemberId,
        seats: seatSummary(entry),
        autosave: entry.autosave,
        savePassword: entry.savePassword,
    });
}

// Réaligne `socket.data.playerId` (autorité serveur des actions de jeu) sur
// l'assignation courante des sièges. À rappeler après tout changement de sièges
// (arrivée, réordonnancement, changement de carte, départ) pour qu'un joueur
// déplacé agisse bien avec sa NOUVELLE position.
function syncSocketSeats(io, entry) {
    const seated = new Set();
    for (const seat of entry.seats) {
        if (!seat.assignedMemberId) continue;
        seated.add(seat.assignedMemberId);
        const s = io.sockets.sockets.get(seat.assignedMemberId);
        if (s) s.data.playerId = seat.playerId;
    }
    // Membres présents mais non assis : (re)deviennent spectateurs.
    for (const mid of entry.members) {
        if (seated.has(mid)) continue;
        const s = io.sockets.sockets.get(mid);
        if (s) s.data.playerId = null;
    }
}

// Fait entrer un socket dans un lobby et l'abonne à la salle. Facteur commun de
// create et join.
//  - Salle d'ATTENTE : on attribue automatiquement la 1re place libre (le joueur
//    ajuste sa couleur dans la salle).
//  - Partie EN COURS : on N'ATTRIBUE PAS de place ; le joueur devra CHOISIR sa
//    couleur parmi les places libres (`seatOptions`) via un modal côté client.
//    S'il n'y a aucune place libre, il rejoint en simple spectateur.
function enterLobby(socket, entry, identity = {}) {
    socket.data.code = entry.code;
    socket.join(entry.code);
    let playerId = null;
    let seatOptions = [];
    if (entry.status === 'playing') {
        registerMember(entry, socket.id, identity);
        seatOptions = joinableSeats(entry);
    } else {
        playerId = claimSeat(entry, socket.id, identity);
    }
    socket.data.playerId = playerId;
    // Le client s'identifie désormais par son MEMBRE (socket.id) et déduit sa
    // position (playerId) des sièges — car l'hôte peut la changer par la suite.
    socket.emit('lobby:joined', {
        code: entry.code,
        memberId: socket.id,
        playerId,
        // Partie en cours : la liste des places (couleurs) que le joueur peut
        // reprendre. Vide = pas de choix à faire (salle d'attente ou aucune place).
        needsSeat: seatOptions.length > 0,
        seatOptions,
        lobby: {
            code: entry.code,
            name: entry.name,
            mapId: entry.mapId,
            status: entry.status,
            settings: entry.settings,
            hostMemberId: entry.hostMemberId,
            seats: seatSummary(entry),
            autosave: entry.autosave,
            savePassword: entry.savePassword,
        },
    });
    // Partie déjà en cours : envoie l'état courant au nouvel arrivant.
    if (entry.state) socket.emit('game:state', serializeState(entry.state));
    return playerId;
}

// Un siège est-il tenu par un bot ?
function isBotSeat(entry, playerId) {
    return entry.seats.find((s) => s.playerId === playerId)?.kind === 'bot';
}

// Fait jouer les BOTS tant que c'est à leur tour. Chaque tour de bot : on
// applique ses meilleurs coups (via l'IA) puis on termine son tour ; on rediffuse
// l'état à chaque tour pour que les humains voient l'action. Le garde-fou évite
// toute boucle infinie (parties 100 % bots incluses).
function advanceBots(io, entry) {
    let safety = 0;
    while (
        entry.state &&
        entry.state.status !== 'over' &&
        isBotSeat(entry, entry.state.activePlayerId) &&
        safety < 400
    ) {
        safety += 1;
        let moves = 0;
        while (moves < 200) {
            moves += 1;
            let action = null;
            try {
                action = pickBotAction(entry.state);
            } catch {
                action = null; // coup impossible à calculer : on termine le tour
            }
            if (!action) break;
            if (!applyAction(entry, action)) break; // coup rejeté : on s'arrête
        }
        applyAction(entry, endTurn());
        io.to(entry.code).emit('game:state', serializeState(entry.state));
        if (entry.state.status === 'over') {
            broadcastLobby(io, entry);
            break;
        }
    }
}

export function attachGameServer(io) {
    io.on('connection', (socket) => {
        // eslint-disable-next-line no-console
        console.log(`[socket] connecté : ${socket.id}`);

        // --- Créer une partie ---
        socket.on('lobby:create', async ({ mapId, settings, name, color } = {}) => {
            try {
                const entry = await createLobby({ mapId, settings });
                const playerId = enterLobby(socket, entry, { name, color });
                entry.hostMemberId = socket.id; // le créateur est l'hôte (stable)
                syncSocketSeats(io, entry);
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
        socket.on('lobby:join', async ({ code, name, color, password } = {}) => {
            try {
                const entry = await getLobby((code || '').toUpperCase());
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                // Partie SAUVEGARDÉE : on vérifie le mot de passe puis on la reprend
                // (elle redevient 'playing' et réapparaît dans « parties en cours »).
                if (entry.status === 'saved') {
                    if (!checkSavePassword(entry, password)) {
                        socket.emit('lobby:error', { reason: 'bad-password' });
                        return;
                    }
                    resumeLobby(entry);
                }
                const playerId = enterLobby(socket, entry, { name, color });
                syncSocketSeats(io, entry);
                broadcastLobby(io, entry);
                // eslint-disable-next-line no-console
                console.log(`[lobby] ${socket.id} rejoint '${entry.code}' comme ${playerId || 'spectateur'}`);
            } catch (e) {
                socket.emit('lobby:error', { reason: 'join-failed', message: String(e.message || e) });
            }
        });

        // --- Choisir sa place (couleur) en rejoignant une partie EN COURS ---
        // Le joueur a reçu `seatOptions` à la jointure ; il en sélectionne une.
        socket.on('lobby:claimseat', async ({ code, playerId } = {}) => {
            try {
                const entry = await getLobby(code || socket.data.code);
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                const claimed = claimSpecificSeat(entry, socket.id, playerId);
                if (!claimed) {
                    // Place prise entre-temps : on renvoie les options à jour pour que
                    // le joueur en choisisse une autre.
                    socket.emit('lobby:seat-taken', { seatOptions: joinableSeats(entry) });
                    return;
                }
                socket.data.playerId = claimed;
                socket.emit('lobby:seat-confirmed', { playerId: claimed });
                syncSocketSeats(io, entry);
                broadcastLobby(io, entry);
                // eslint-disable-next-line no-console
                console.log(`[lobby] ${socket.id} prend la place ${claimed} dans '${entry.code}'`);
            } catch (e) {
                socket.emit('lobby:error', { reason: 'claimseat-failed', message: String(e.message || e) });
            }
        });

        // --- Configurer la partie en attente (hôte : carte + réglages) ---
        socket.on('lobby:configure', async ({ code, mapId, settings, autosave, savePassword } = {}) => {
            try {
                const entry = await getLobby(code || socket.data.code);
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                if (socket.id !== entry.hostMemberId) {
                    socket.emit('lobby:error', { reason: 'not-host' });
                    return;
                }
                if (entry.status !== 'waiting') {
                    socket.emit('lobby:error', { reason: 'already-started' });
                    return;
                }
                configureLobby(entry, { mapId, settings, autosave, savePassword });
                syncSocketSeats(io, entry);
                broadcastLobby(io, entry);
            } catch (e) {
                socket.emit('lobby:error', { reason: 'configure-failed', message: String(e.message || e) });
            }
        });

        // --- Modifier sa propre identité (nom / couleur) ---
        socket.on('lobby:identity', async ({ code, name, color } = {}) => {
            try {
                const entry = await getLobby(code || socket.data.code);
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                if (setMemberIdentity(entry, socket.id, { name, color })) {
                    broadcastLobby(io, entry);
                }
            } catch (e) {
                socket.emit('lobby:error', { reason: 'identity-failed', message: String(e.message || e) });
            }
        });

        // --- Basculer une place libre entre « ouverte » et « bot » (hôte) ---
        socket.on('lobby:seatkind', async ({ code, playerId, kind } = {}) => {
            try {
                const entry = await getLobby(code || socket.data.code);
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                if (socket.id !== entry.hostMemberId) {
                    socket.emit('lobby:error', { reason: 'not-host' });
                    return;
                }
                if (setSeatKind(entry, playerId, kind)) broadcastLobby(io, entry);
            } catch (e) {
                socket.emit('lobby:error', { reason: 'seatkind-failed', message: String(e.message || e) });
            }
        });

        // --- Choisir la couleur d'un bot (hôte) ---
        socket.on('lobby:botcolor', async ({ code, playerId, color } = {}) => {
            try {
                const entry = await getLobby(code || socket.data.code);
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                if (socket.id !== entry.hostMemberId) {
                    socket.emit('lobby:error', { reason: 'not-host' });
                    return;
                }
                if (setBotColor(entry, playerId, color)) broadcastLobby(io, entry);
            } catch (e) {
                socket.emit('lobby:error', { reason: 'botcolor-failed', message: String(e.message || e) });
            }
        });

        // --- Choisir la difficulté d'un bot (hôte) ---
        socket.on('lobby:botdifficulty', async ({ code, playerId, difficulty } = {}) => {
            try {
                const entry = await getLobby(code || socket.data.code);
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                if (socket.id !== entry.hostMemberId) {
                    socket.emit('lobby:error', { reason: 'not-host' });
                    return;
                }
                if (setBotDifficulty(entry, playerId, difficulty)) broadcastLobby(io, entry);
            } catch (e) {
                socket.emit('lobby:error', { reason: 'botdifficulty-failed', message: String(e.message || e) });
            }
        });

        // --- Réordonner les positions (hôte) : échange l'occupant d'un siège
        // avec le siège voisin (haut/bas). Permet de choisir qui joue quel spawn. ---
        socket.on('lobby:reorder', async ({ code, playerId, direction } = {}) => {
            try {
                const entry = await getLobby(code || socket.data.code);
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                if (socket.id !== entry.hostMemberId) {
                    socket.emit('lobby:error', { reason: 'not-host' });
                    return;
                }
                if (reorderSeat(entry, playerId, direction)) {
                    syncSocketSeats(io, entry);
                    broadcastLobby(io, entry);
                }
            } catch (e) {
                socket.emit('lobby:error', { reason: 'reorder-failed', message: String(e.message || e) });
            }
        });

        // --- Démarrer la partie (hôte) ---
        socket.on('lobby:start', async ({ code } = {}) => {
            try {
                const entry = await getLobby(code || socket.data.code);
                if (!entry) {
                    socket.emit('lobby:error', { reason: 'not-found' });
                    return;
                }
                if (socket.id !== entry.hostMemberId) {
                    socket.emit('lobby:error', { reason: 'not-host' });
                    return;
                }
                // Au moins 2 participants (humains et/ou bots). Le lobby n'a PAS
                // besoin d'être plein : les places libres restent des spawns neutres.
                if (filledCount(entry) < 2) {
                    socket.emit('lobby:error', { reason: 'not-enough-players' });
                    return;
                }
                await startLobby(entry);
                broadcastLobby(io, entry);
                io.to(entry.code).emit('game:state', serializeState(entry.state));
                // eslint-disable-next-line no-console
                console.log(`[lobby] '${entry.code}' démarrée par ${socket.id}`);
                // Si le premier tour revient à un bot (ex. partie 100 % bots).
                advanceBots(io, entry);
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
                // Applique en mémoire (synchrone) puis DIFFUSE AUSSITÔT : le
                // broadcast n'attend plus l'écriture Mongo (planifiée en arrière-plan
                // par applyAction). C'est ce qui supprime la latence DB du jeu.
                const next = applyAction(entry, action);
                if (!next) {
                    socket.emit('game:rejected', { reason: 'illegal-action', action });
                    return;
                }
                io.to(entry.code).emit('game:state', serializeState(next));
                if (next.status === 'over') broadcastLobby(io, entry);
                // La fin de tour d'un humain peut donner la main à un ou des bots.
                else advanceBots(io, entry);
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
                        // Départ de l'hôte : on migre le rôle vers un membre restant,
                        // en PRIORISANT un joueur assis (repli : le plus ancien membre,
                        // sinon plus d'hôte). NB : on lit les CLÉS de la Map (socketId),
                        // pas les valeurs (l'identité { name, color }).
                        if (socket.id === entry.hostMemberId) {
                            const seated = entry.seats.find((s) => s.assignedMemberId)?.assignedMemberId;
                            entry.hostMemberId = seated || entry.members.keys().next().value || null;
                        }
                        // Plus aucun membre présent : selon le statut, on nettoie.
                        //  - EN ATTENTE : supprimée (personne pour la reprendre).
                        //  - EN COURS + autosave : SAUVEGARDÉE (statut 'saved', on note
                        //    l'heure du départ) pour pouvoir la reprendre plus tard.
                        //  - EN COURS sans autosave : supprimée, comme une salle vidée.
                        // Sinon (il reste des membres), on rediffuse l'état à la salle.
                        if (entry.members.size === 0) {
                            if (entry.status === 'playing' && entry.autosave) {
                                await saveLobby(entry);
                            } else if (entry.status === 'waiting' || entry.status === 'playing') {
                                await deleteLobby(entry);
                            }
                        } else {
                            syncSocketSeats(io, entry);
                            broadcastLobby(io, entry);
                        }
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
