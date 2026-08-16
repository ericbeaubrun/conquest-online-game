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
//     'lobby:leave'                                  quitte la salle et retourne à la liste
//     'lobby:identity' { name?, color? }             modifie SON nom / SA couleur
//     'lobby:configure' { mapId?, settings? }        (hôte) règle carte/paramètres avant le démarrage
//     'lobby:reorder' { playerId, direction }        (hôte) échange une position avec sa voisine (up/down)
//     'lobby:seatkind' { playerId, kind }            (hôte) bascule une place libre entre 'human'/'bot'
//     'lobby:botdifficulty' { playerId, difficulty } (hôte) change la difficulté d'un bot
//     'lobby:start'                                  (hôte) démarre la partie
//     'game:action'  action                          joue une action de jeu
//     'game:reset-turn'                              (joueur actif) recommence SON tour
//
//   SEUL 'lobby:join' désigne une salle par son `code` : partout ailleurs le
//   serveur agit sur la salle COURANTE du socket et ignore un `code` reçu (le
//   client peut donc continuer d'en envoyer un, il est sans effet).
//
//   Tous les évènements sont soumis à un plafond de débit par socket ; au-delà,
//   le serveur répond 'lobby:error' / 'game:rejected' avec `reason: 'rate-limited'`.
//   serveur -> client
//     'lobby:list'    [ résumés ]
//     'lobby:joined'  { code, memberId, playerId|null, lobby } (à l'émetteur qui rejoint)
//     'lobby:left'    confirmation de sortie de la salle (à l'émetteur)
//     'lobby:update'  { code, status, mapId, settings, hostMemberId, seats } (à toute la salle)
//     'lobby:error'   { reason }
//     'game:state'    <état sérialisé>               (à toute la salle)
//     'game:rejected' { reason, action? }            (au seul émetteur)

import { serializeState, serializeStateWire } from './exportEngine.js';
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
    evictLobby,
    saveLobby,
    resumeLobby,
    checkSavePassword,
    hasSavePassword,
    seatSummary,
    setMemberIdentity,
    filledCount,
    reorderSeat,
    setSeatKind,
    setBotDifficulty,
    configureLobby,
    startLobby,
    applyAction,
    resetTurn,
} from './lobbyStore.js';
import { runBotTurn } from './bot.js';
import { endTurn } from './exportEngine.js';

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
    'SET_BEHAVIOR',
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
        // Le mot de passe de sauvegarde n'est JAMAIS renvoyé — ni ici, ni dans
        // 'lobby:joined'. Il protège la reprise de la partie contre les
        // inconnus ; le diffuser à toute la salle le faisait connaître de
        // quiconque l'avait rejointe une fois, ce qui le vidait de son sens.
        // Seul l'INDICATEUR voyage, comme le fait déjà `listLobbies`.
        hasPassword: hasSavePassword(entry),
    });
}

// Diffuse l'état de jeu à toute la salle en n'envoyant QUE ce qui a pu changer :
// ni les champs constants de la partie, ni l'historique statistique tant qu'il
// n'a pas grandi (voir `serializeStateWire`). Le client recompose l'état complet
// à partir de sa base (voir `mergeStateWire`).
//
// `full: true` force la diffusion COMPLÈTE. Obligatoire au DÉMARRAGE : à ce
// moment aucun client de la salle ne possède encore de base de reconstruction.
// (Un joueur qui rejoint en cours de partie reçoit, lui, son état complet
// individuellement dans `enterLobby`.)
function emitState(io, entry, { full = false } = {}) {
    const payload = full
        ? serializeState(entry.state)
        : serializeStateWire(entry.state, entry.wireStatsLen);
    // Ce que la salle possède désormais, pour décider de la PROCHAINE diffusion.
    // Purement transport : ce champ ne va ni en base ni sur le fil.
    entry.wireStatsLen = entry.state.statsHistory?.length ?? 0;
    io.to(entry.code).emit('game:state', payload);
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

// --- Limitation de débit, par socket ---
// Aucun évènement n'était plafonné : un client pouvait enchaîner créations de
// parties et changements de configuration aussi vite que le réseau le permet,
// chacun déclenchant une écriture MongoDB. Fenêtre glissante volontairement
// LARGE — un joueur humain tient environ une action par seconde, même en jouant
// vite ; le plafond ne gêne donc que ce qui n'est pas un joueur.
const RATE_MAX_EVENTS = 120;
const RATE_WINDOW_MS = 10000;

function rateLimited(socket) {
    const now = Date.now();
    const d = socket.data;
    if (!d.rateStart || now - d.rateStart > RATE_WINDOW_MS) {
        d.rateStart = now;
        d.rateCount = 0;
    }
    d.rateCount += 1;
    return d.rateCount > RATE_MAX_EVENTS;
}

// Fait entrer un socket dans un lobby et l'abonne à la salle. Facteur commun de
// create et join.
//  - Salle d'ATTENTE : on attribue automatiquement la 1re place libre (le joueur
//    ajuste sa couleur dans la salle).
//  - Partie EN COURS : on N'ATTRIBUE PAS de place ; le joueur devra CHOISIR sa
//    couleur parmi les places libres (`seatOptions`) via un modal côté client.
//    S'il n'y a aucune place libre, il rejoint en simple spectateur.
async function enterLobby(io, socket, entry, identity = {}) {
    // Un socket n'appartient qu'à UNE salle à la fois. Sans cette sortie
    // préalable, `socket.join()` s'ajoutait à la précédente sans la quitter : le
    // socket restait membre ET occupant d'un siège de l'ancienne partie (qui
    // n'atteignait donc plus jamais « salle vide », n'était plus nettoyée, et
    // gardait ce siège bloqué pour les autres), tout en continuant d'en recevoir
    // toutes les diffusions.
    if (socket.data.code && socket.data.code !== entry.code) {
        await leaveCurrentLobby(io, socket, { leaveRoom: true });
    } else if (socket.data.code === entry.code) {
        // Ré-entrée dans la MÊME salle (re-jointure, reprise) : on libère
        // d'abord ce qu'on y détenait, pour ne pas occuper deux places. Surtout
        // pas `leaveCurrentLobby` ici — sur une salle dont on est le dernier
        // membre, elle supprimerait la partie qu'on est en train de rejoindre.
        releaseSeat(entry, socket.id);
    }
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
            hasPassword: hasSavePassword(entry), // jamais le mot de passe lui-même
        },
    });
    // Partie déjà en cours : envoie l'état courant au nouvel arrivant.
    if (entry.state) socket.emit('game:state', serializeState(entry.state));
    return playerId;
}

// Câblage d'un évènement 'lobby:*' portant sur un lobby EXISTANT. Factorise le
// préambule que tous ces handlers partageaient mot pour mot : résolution du
// lobby, gardes d'accès, et capture des erreurs en 'lobby:error'.
//  - `anyCode` : le code est lu dans le PAYLOAD. Réservé à 'lobby:join', seul
//    évènement qui a une raison légitime de désigner une salle où l'on n'est pas
//    encore. Partout ailleurs le code est celui de la salle COURANTE du socket
//    (`socket.data.code`) et le payload est ignoré : un client ne peut donc plus
//    faire charger en cache une partie quelconque en devinant son code — la
//    résolution précédait les gardes `hostOnly`/`waitingOnly`, si bien que même
//    un refus laissait l'entrée résidente.
//  - `hostOnly` : réservé à l'hôte ; `waitingOnly` : interdit une fois démarrée ;
//  - le motif d'erreur reste `<évènement>-failed` (ex. 'join-failed'), tel que
//    le client le libelle déjà.
function onLobby(
    socket,
    event,
    handler,
    { hostOnly = false, waitingOnly = false, anyCode = false } = {}
) {
    socket.on(event, async (payload = {}) => {
        try {
            if (rateLimited(socket)) {
                socket.emit('lobby:error', { reason: 'rate-limited' });
                return;
            }
            const raw = anyCode ? payload?.code || socket.data.code : socket.data.code;
            const code = String(raw || '').toUpperCase();
            const entry = await getLobby(code);
            if (!entry) {
                socket.emit('lobby:error', { reason: 'not-found' });
                return;
            }
            if (hostOnly && socket.id !== entry.hostMemberId) {
                socket.emit('lobby:error', { reason: 'not-host' });
                return;
            }
            if (waitingOnly && entry.status !== 'waiting') {
                socket.emit('lobby:error', { reason: 'already-started' });
                return;
            }
            await handler(entry, payload);
        } catch (e) {
            const reason = `${event.split(':')[1]}-failed`;
            socket.emit('lobby:error', { reason, message: String(e.message || e) });
        }
    });
}

// Un siège est-il tenu par un bot ?
function isBotSeat(entry, playerId) {
    return entry.seats.find((s) => s.playerId === playerId)?.kind === 'bot';
}

// Rend la main à la boucle d'événements. Node est mono-thread : tant qu'on ne
// lui rend pas la main, RIEN d'autre ne s'exécute sur le serveur — ni les
// diffusions déjà empilées, ni les autres parties.
const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

// Fait sortir un socket de sa salle, sans fermer sa connexion. Cette même
// opération est utilisée à la déconnexion et au retour volontaire vers la liste
// des parties : le siège est donc toujours libéré proprement.
async function leaveCurrentLobby(io, socket, { leaveRoom = false } = {}) {
    const code = socket.data.code;
    if (!code) return;

    const entry = await getLobby(code);
    if (entry) {
        releaseSeat(entry, socket.id);
        // Départ de l'hôte : priorité à un joueur encore assis, puis à un membre
        // restant qui observe la salle.
        if (socket.id === entry.hostMemberId) {
            const seated = entry.seats.find((s) => s.assignedMemberId)?.assignedMemberId;
            entry.hostMemberId = seated || entry.members.keys().next().value || null;
        }

        if (entry.members.size === 0) {
            if (entry.status === 'playing' && entry.autosave) {
                await saveLobby(entry);
            } else if (entry.status === 'waiting' || entry.status === 'playing') {
                await deleteLobby(entry);
            }
            // Salle vide : on libère l'état vif (plateau désérialisé + point de
            // retour) QUEL QUE SOIT le statut. Les deux branches ci-dessus ne
            // couvraient ni 'over' ni 'saved', dont les entrées restaient donc
            // résidentes jusqu'au redémarrage du serveur. Rien n'est perdu :
            // ce qui doit survivre est en base, et `getLobby` recharge à la
            // demande. Idempotent après `deleteLobby`.
            await evictLobby(entry);
        } else {
            syncSocketSeats(io, entry);
            broadcastLobby(io, entry);
        }
    }

    if (leaveRoom) socket.leave(code);
    socket.data.code = null;
    socket.data.playerId = null;
}

// Fait jouer les BOTS tant que c'est à leur tour. `runBotTurn` joue ses coups
// via `applyAction` (qui renvoie le nouvel état), puis on termine son tour
// nous-mêmes. On rediffuse à chaque tour pour que
// les humains voient la main passer, et un garde-fou évite toute boucle
// infinie (parties 100 % bots incluses).
async function advanceBots(io, entry) {
    let safety = 0;
    while (
        entry.state &&
        entry.state.status !== 'over' &&
        isBotSeat(entry, entry.state.activePlayerId) &&
        safety < 400
    ) {
        safety += 1;
        await yieldToLoop();
        try {
            runBotTurn(entry.state, (action) => applyAction(entry, action));
        } catch {
            // tour impossible à calculer : on passe directement à la fin de tour
        }
        if (entry.state.status !== 'over') applyAction(entry, endTurn());
        emitState(io, entry);
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
                if (rateLimited(socket)) {
                    socket.emit('lobby:error', { reason: 'rate-limited' });
                    return;
                }
                const entry = await createLobby({ mapId, settings });
                // `enterLobby` quitte d'abord la salle précédente : une partie
                // créée puis abandonnée se retrouve donc vide, et le nettoyage
                // habituel la supprime. Créer en boucle n'accumule plus rien.
                const playerId = await enterLobby(io, socket, entry, { name, color });
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
                if (rateLimited(socket)) {
                    socket.emit('lobby:error', { reason: 'rate-limited' });
                    return;
                }
                socket.emit('lobby:list', await listLobbies());
            } catch (e) {
                socket.emit('lobby:error', { reason: 'list-failed', message: String(e.message || e) });
            }
        });

        // --- Retour à la liste : quitte la salle tout en gardant la socket ---
        socket.on('lobby:leave', async () => {
            try {
                await leaveCurrentLobby(io, socket, { leaveRoom: true });
                socket.emit('lobby:left');
            } catch (e) {
                socket.emit('lobby:error', { reason: 'leave-failed', message: String(e.message || e) });
            }
        });

        // --- Rejoindre une partie ---
        onLobby(socket, 'lobby:join', async (entry, { name, color, password }) => {
            // Partie SAUVEGARDÉE : on vérifie le mot de passe puis on la reprend
            // (elle redevient 'playing' et réapparaît dans « parties en cours »).
            if (entry.status === 'saved') {
                if (!(await checkSavePassword(entry, password))) {
                    socket.emit('lobby:error', { reason: 'bad-password' });
                    return;
                }
                resumeLobby(entry);
            }
            const playerId = await enterLobby(io, socket, entry, { name, color });
            syncSocketSeats(io, entry);
            broadcastLobby(io, entry);
            // eslint-disable-next-line no-console
            console.log(`[lobby] ${socket.id} rejoint '${entry.code}' comme ${playerId || 'spectateur'}`);
        },
        // SEUL évènement à lire le code du payload : c'est sa raison d'être.
        { anyCode: true });

        // --- Choisir sa place (couleur) en rejoignant une partie EN COURS ---
        // Le joueur a reçu `seatOptions` à la jointure ; il en sélectionne une.
        onLobby(socket, 'lobby:claimseat', (entry, { playerId }) => {
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
        });

        // --- Configurer la partie en attente (hôte : carte + réglages) ---
        onLobby(
            socket,
            'lobby:configure',
            async (entry, { mapId, settings, autosave, savePassword }) => {
                await configureLobby(entry, { mapId, settings, autosave, savePassword });
                syncSocketSeats(io, entry);
                broadcastLobby(io, entry);
            },
            { hostOnly: true, waitingOnly: true }
        );

        // --- Modifier sa propre identité (nom / couleur) ---
        onLobby(socket, 'lobby:identity', (entry, { name, color }) => {
            if (setMemberIdentity(entry, socket.id, { name, color })) broadcastLobby(io, entry);
        });

        // --- Réordonner les positions (hôte) : échange l'occupant d'un siège
        // avec le siège voisin (haut/bas). Permet de choisir qui joue quel spawn. ---
        onLobby(
            socket,
            'lobby:reorder',
            (entry, { playerId, direction }) => {
                if (reorderSeat(entry, playerId, direction)) {
                    syncSocketSeats(io, entry);
                    broadcastLobby(io, entry);
                }
            },
            { hostOnly: true }
        );

        // --- Basculer une place libre entre « ouverte » et « bot » (hôte) ---
        onLobby(
            socket,
            'lobby:seatkind',
            (entry, { playerId, kind }) => {
                if (setSeatKind(entry, playerId, kind)) broadcastLobby(io, entry);
            },
            { hostOnly: true, waitingOnly: true }
        );

        // --- Choisir la difficulté d'un bot (hôte) ---
        onLobby(
            socket,
            'lobby:botdifficulty',
            (entry, { playerId, difficulty }) => {
                if (setBotDifficulty(entry, playerId, difficulty)) broadcastLobby(io, entry);
            },
            { hostOnly: true, waitingOnly: true }
        );

        // --- Démarrer la partie (hôte) ---
        onLobby(
            socket,
            'lobby:start',
            async (entry) => {
                // Au moins 2 participants. Le lobby n'a PAS besoin d'être plein :
                // les places libres restent des spawns neutres.
                if (filledCount(entry) < 2) {
                    socket.emit('lobby:error', { reason: 'not-enough-players' });
                    return;
                }
                await startLobby(entry);
                broadcastLobby(io, entry);
                // Premier état de la partie : COMPLET, il fonde la base de
                // reconstruction de tous les clients de la salle.
                emitState(io, entry, { full: true });
                // eslint-disable-next-line no-console
                console.log(`[lobby] '${entry.code}' démarrée par ${socket.id}`);
                // Si le premier tour revient à un bot (ex. partie 100 % bots).
                await advanceBots(io, entry);
            },
            { hostOnly: true }
        );

        // --- Jouer une action ---
        socket.on('game:action', async (action) => {
            try {
                if (rateLimited(socket)) {
                    socket.emit('game:rejected', { reason: 'rate-limited', action });
                    return;
                }
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
                emitState(io, entry);
                if (next.status === 'over') broadcastLobby(io, entry);
                // La fin de tour d'un humain peut donner la main à un ou des bots.
                else await advanceBots(io, entry);
            } catch (e) {
                socket.emit('game:rejected', { reason: 'server-error', message: String(e.message || e) });
            }
        });

        // --- Recommencer son tour ---
        // Mêmes contrôles d'autorité qu'une action de jeu : un siège, et la main.
        // Aucune charge utile — l'état à restituer est celui que le SERVEUR a figé
        // au début du tour (cf. `resetTurn`), jamais un état venu du client.
        // Le rejeu ne concerne que le joueur actif : la main ne change pas,
        // et aucune fin de partie n'est possible (on revient en arrière).
        socket.on('game:reset-turn', async () => {
            try {
                if (rateLimited(socket)) {
                    socket.emit('game:rejected', { reason: 'rate-limited' });
                    return;
                }
                const entry = await getLobby(socket.data.code);
                const playerId = socket.data.playerId;
                if (!entry || !entry.state) {
                    socket.emit('game:rejected', { reason: 'no-game' });
                    return;
                }
                if (playerId == null) {
                    socket.emit('game:rejected', { reason: 'spectator' });
                    return;
                }
                if (entry.state.activePlayerId !== playerId) {
                    socket.emit('game:rejected', { reason: 'not-your-turn' });
                    return;
                }
                const next = resetTurn(entry);
                if (!next) {
                    // Rien à restituer (tour intact, instantané absent ou périmé) :
                    // le client revient au dernier état faisant autorité.
                    socket.emit('game:rejected', { reason: 'nothing-to-reset' });
                    return;
                }
                emitState(io, entry);
            } catch (e) {
                socket.emit('game:rejected', { reason: 'server-error', message: String(e.message || e) });
            }
        });

        // --- Déconnexion : libère le siège et informe la salle ---
        socket.on('disconnect', async () => {
            try {
                await leaveCurrentLobby(io, socket);
            } catch {
                /* déconnexion : rien de critique si le nettoyage échoue */
            }
            // eslint-disable-next-line no-console
            console.log(`[socket] déconnecté : ${socket.id}`);
        });
    });
}
