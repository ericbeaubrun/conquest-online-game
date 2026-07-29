// Store des lobbies/parties. Remplace l'ancien `rooms.js` statique.
//
// Deux couches :
//  - PERSISTANTE (MongoDB) : métadonnées du lobby + état de jeu SÉRIALISÉ. Écrite
//    en « write-through » à chaque changement, donc un redémarrage du serveur ne
//    perd aucune partie. C'est la source de vérité durable.
//  - VIVE (mémoire) : cache des lobbies chargés, dont l'état de jeu désérialisé
//    (Map/Set, prêt pour le reducer) et la PRÉSENCE. La présence est éphémère par
//    nature (elle suit les connexions) et n'est donc pas persistée.
//
// Modèle de présence (découplé) :
//  - `members`  : Set des socketId connectés à la salle (joueurs ET spectateurs).
//  - `seats`    : positions de la carte (une par spawn). Chaque siège porte
//    `assignedMemberId` = le membre qui l'occupe (ou null = libre). C'est ce
//    découplage « membre ↔ position » qui permet à l'hôte de RÉORDONNER les
//    joueurs (déplacer un membre d'une position à l'autre) sans changer d'identité.
//  - `hostMemberId` : le membre hôte (créateur, ou migré si l'hôte se déconnecte).
//    L'hôte est identifié par son membre, PAS par un siège : il peut donc changer
//    de position sans perdre ses droits.

import { lobbiesCol } from './db.js';
import {
    createInitialState,
    gameReducer,
    serializeState,
    deserializeState,
    randomSeed,
    restoreTurnStart,
    getPlayableMapById,
    playersForMap,
    PALETTE_VALUES,
    colorName,
    ownedCount,
} from './exportEngine.js';

// --- Identité d'un joueur (membre) : nom + couleur, CHOISIS par le joueur ---
// La couleur et le nom appartiennent au MEMBRE, pas au siège : quand l'hôte
// réordonne, ils voyagent avec le joueur vers le nouveau numéro de spawn.
const MAX_NAME_LEN = 16;

const sanitizeName = (name) => (typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LEN) : '');

// Couleurs déjà UTILISÉES dans le lobby : celles des membres (joueurs humains).
// Source unique pour garantir qu'aucun joueur ne partage une couleur.
// `exceptMember` exclut l'entité en cours d'édition (pour ne pas la considérer
// comme « en conflit avec elle-même »).
function usedColors(entry, { exceptMember = null } = {}) {
    const used = new Set();
    for (const [id, m] of entry.members) if (id !== exceptMember) used.add(m.color);
    return used;
}

// Première couleur de la palette libre (repli : la couleur préférée si donnée,
// sinon la 1re de la palette). `opts` est transmis à usedColors.
function firstFreeColor(entry, preferred, opts) {
    const used = usedColors(entry, opts);
    if (preferred && PALETTE_VALUES.includes(preferred) && !used.has(preferred)) return preferred;
    return PALETTE_VALUES.find((c) => !used.has(c)) || preferred || PALETTE_VALUES[0];
}

// Cache mémoire : code -> entrée vive.
const cache = new Map();

// --- Génération de code de partie (court, lisible, sans caractères ambigus) ---
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode(len = 4) {
    let s = '';
    for (let i = 0; i < len; i += 1) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return s;
}
async function uniqueCode() {
    for (let i = 0; i < 10; i += 1) {
        const code = randomCode();
        // eslint-disable-next-line no-await-in-loop
        if (!(await lobbiesCol().findOne({ _id: code }, { projection: { _id: 1 } }))) return code;
    }
    return randomCode(6); // repli très improbable
}

// --- Persistance différée (write-behind) ---
// On n'attend PLUS l'écriture Mongo pour rediffuser l'état : l'état vif en
// mémoire fait déjà autorité pendant la session. On regroupe donc les écritures
// (au plus une par PERSIST_DELAY ms) et on force une écriture immédiate sur les
// événements à ne pas perdre (fin de partie). La banque ne bloque plus le jeu.
const PERSIST_DELAY = 1000;
const persistTimers = new Map(); // code -> timeout en attente

// Écrit maintenant, sans bloquer l'appelant (fire-and-forget + log d'erreur).
function flushPersist(entry) {
    const t = persistTimers.get(entry.code);
    if (t) {
        clearTimeout(t);
        persistTimers.delete(entry.code);
    }
    persist(entry).catch((e) => {
        // eslint-disable-next-line no-console
        console.error(`[persist] échec pour '${entry.code}':`, e.message || e);
    });
}

// Planifie une écriture. `immediate` force le flush tout de suite ; sinon on
// coalesce : une seule écriture différée par fenêtre PERSIST_DELAY.
function schedulePersist(entry, { immediate = false } = {}) {
    if (immediate) {
        flushPersist(entry);
        return;
    }
    if (persistTimers.has(entry.code)) return; // écriture déjà planifiée
    const t = setTimeout(() => flushPersist(entry), PERSIST_DELAY);
    persistTimers.set(entry.code, t);
}

// Écrit l'entrée vive dans MongoDB (métadonnées + état sérialisé).
async function persist(entry) {
    await lobbiesCol().updateOne(
        { _id: entry.code },
        {
            $set: {
                name: entry.name,
                status: entry.status,
                mapId: entry.mapId,
                settings: entry.settings,
                seed: entry.seed,
                seats: entry.seats,
                state: entry.state ? serializeState(entry.state) : null,
                // Point de retour du tour en cours : persisté avec l'état, sans
                // quoi un redémarrage du serveur (ou la reprise d'une partie
                // sauvegardée) priverait le joueur actif de son retour arrière
                // jusqu'à la fin de son tour.
                turnStart: entry.turnStart ? serializeState(entry.turnStart) : null,
                autosave: entry.autosave,
                savePassword: entry.savePassword,
                emptiedAt: entry.emptiedAt,
                updatedAt: new Date(),
            },
        }
    );
}

// Construit une entrée vive à partir d'un document Mongo.
function entryFromDoc(doc) {
    return {
        code: doc._id,
        name: doc.name,
        status: doc.status,
        mapId: doc.mapId,
        settings: doc.settings || {},
        seed: doc.seed,
        // Présence remise à zéro : personne n'est (encore) reconnecté après
        // chargement, donc aucune assignation de siège n'est valide.
        seats: (doc.seats || []).map((s) => ({ ...s, assignedMemberId: null })),
        state: doc.state ? deserializeState(doc.state) : null,
        // Parties enregistrées avant l'ajout du retour arrière : pas d'instantané
        // (le bouton restera sans effet jusqu'au prochain changement de main).
        turnStart: doc.turnStart ? deserializeState(doc.turnStart) : null,
        members: new Map(), // memberId -> { name, color }
        hostMemberId: null,
        autosave: doc.autosave !== false, // défaut : activé
        savePassword: doc.savePassword || '',
        emptiedAt: doc.emptiedAt || null,
    };
}

// --- Création ---
export async function createLobby({ mapId, settings = {}, name } = {}) {
    const map = getPlayableMapById(mapId); // exclut cartes de démo et ids inconnus
    // Sièges dérivés de la carte : autant que de points de départ, avec les noms
    // et couleurs par défaut. Tous « humains ».
    const seats = playersForMap(map).map((p) => ({
        playerId: p.id,
        name: p.name,
        color: p.color,
        kind: 'human',
        assignedMemberId: null,
    }));
    const code = await uniqueCode();
    const entry = {
        code,
        name: name || `Partie ${code}`,
        status: 'waiting',
        mapId: map.id,
        settings,
        seed: randomSeed(),
        seats,
        state: null,
        turnStart: null, // point de retour du tour courant (posé au démarrage)
        members: new Map(), // memberId -> { name, color }
        hostMemberId: null,
        // Sauvegarde automatique : si activée, une partie EN COURS dont tous les
        // joueurs sortent est conservée (statut 'saved') au lieu d'être supprimée,
        // protégée par un mot de passe optionnel. `emptiedAt` = date/heure du dernier
        // départ (quand plus aucun joueur n'est présent).
        autosave: true,
        savePassword: '',
        emptiedAt: null,
    };
    cache.set(code, entry);
    await lobbiesCol().insertOne({
        _id: code,
        name: entry.name,
        status: entry.status,
        mapId: entry.mapId,
        settings: entry.settings,
        seed: entry.seed,
        seats: entry.seats,
        state: null,
        autosave: entry.autosave,
        savePassword: entry.savePassword,
        emptiedAt: entry.emptiedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return entry;
}

// --- Lecture ---
export async function getLobby(code) {
    if (!code) return null;
    if (cache.has(code)) return cache.get(code);
    const doc = await lobbiesCol().findOne({ _id: code });
    if (!doc) return null;
    const entry = entryFromDoc(doc);
    cache.set(code, entry);
    return entry;
}

// Liste des parties non terminées (joignables ou en cours), plus récentes d'abord.
export async function listLobbies(limit = 30) {
    const docs = await lobbiesCol()
        .find({ status: { $ne: 'over' } }, { projection: { state: 0 } })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();
    return docs.map((d) => {
        const live = cache.get(d._id);
        const taken = live ? live.seats.filter((s) => s.assignedMemberId).length : 0;
        // Partie EN COURS : reste-t-il une place (couleur) à REPRENDRE ? Détermine
        // si le bouton doit dire « Rejoindre » (place libre) ou « Observer » (complet).
        // Précis quand la partie est en mémoire ; sinon approximation (place non prise).
        let joinable = false;
        if (d.status === 'playing') {
            joinable =
                live && live.state
                    ? joinableSeats(live).length > 0
                    : taken < (d.seats?.length ?? 0);
        }
        return {
            code: d._id,
            name: d.name,
            mapId: d.mapId,
            status: d.status,
            seatsTotal: d.seats?.length ?? 0,
            seatsTaken: taken,
            joinable,
            // Métadonnées de sauvegarde (statut 'saved') : quand la partie a été
            // quittée et si elle est protégée. Le mot de passe lui-même n'est JAMAIS
            // exposé dans la liste publique — seul l'indicateur `hasPassword`.
            savedAt: d.emptiedAt || null,
            hasPassword: !!(d.savePassword && d.savePassword.length),
        };
    });
}

// --- Configuration d'un lobby en attente (carte + réglages) ---
// Réservée à l'hôte, tant que la partie n'a pas démarré. Changer de carte
// RE-DÉRIVE les sièges (leur nombre suit la capacité de la carte) : on préserve
// l'occupation des sièges qui existent encore (p1..pN) et on libère ceux qui
// disparaissent (leurs occupants redeviennent spectateurs). Persistance immédiate.
export function configureLobby(entry, { mapId, settings, autosave, savePassword } = {}) {
    if (entry.status !== 'waiting') return entry; // partie déjà démarrée : figé

    if (mapId && mapId !== entry.mapId) {
        const map = getPlayableMapById(mapId);
        // On PRÉSERVE l'ordre des membres assignés : on relit les occupants des
        // anciens sièges (dans l'ordre), on reconstruit les sièges de la nouvelle
        // carte, puis on ré-assigne ces membres aux nouveaux sièges humains dans le
        // même ordre. Le surplus (carte plus petite) repasse « non assigné »
        // (spectateur), sans jamais perdre le membre lui-même (il reste connecté).
        const assigned = entry.seats.filter((s) => s.assignedMemberId).map((s) => s.assignedMemberId);
        entry.mapId = map.id;
        entry.seats = playersForMap(map).map((p) => ({
            playerId: p.id,
            name: p.name,
            color: p.color,
            kind: 'human',
            assignedMemberId: null,
        }));
        let k = 0;
        for (const seat of entry.seats) {
            if (seat.kind === 'human' && k < assigned.length) seat.assignedMemberId = assigned[k++];
        }
    }

    if (settings && typeof settings === 'object') entry.settings = settings;
    if (typeof autosave === 'boolean') entry.autosave = autosave;
    if (typeof savePassword === 'string') entry.savePassword = savePassword.slice(0, 64);

    schedulePersist(entry, { immediate: true });
    return entry;
}

// --- Présence & sièges ---
// Fait entrer un membre avec son IDENTITÉ (nom + couleur choisis, souvent
// pré-remplis côté client). On lui attribue une couleur libre (sa préférée si
// possible) et un nom (le sien, ou le nom de sa couleur par défaut), puis on
// l'assigne au premier siège humain libre. Renvoie le playerId, ou null.
export function claimSeat(entry, socketId, identity = {}) {
    const color = firstFreeColor(entry, identity.color);
    const name = sanitizeName(identity.name) || colorName(color);
    entry.members.set(socketId, { name, color });
    for (const seat of entry.seats) {
        if (seat.kind === 'human' && !seat.assignedMemberId) {
            seat.assignedMemberId = socketId;
            return seat.playerId;
        }
    }
    return null; // partie pleine -> spectateur
}

// Enregistre un membre SANS lui attribuer de place (présence seule). Utilisé pour
// rejoindre une partie EN COURS : le joueur choisira ensuite sa place/couleur
// parmi les places libres (voir joinableSeats / claimSpecificSeat).
export function registerMember(entry, socketId, identity = {}) {
    const color = firstFreeColor(entry, identity.color);
    const name = sanitizeName(identity.name) || colorName(color);
    entry.members.set(socketId, { name, color });
}

// Places JOUEUR reprenables d'une partie EN COURS : sièges humains non pilotés
// (membre déconnecté) dont le joueur existe encore dans l'état ET est en vie
// (possède au moins une case). Renvoie [{ playerId, color, name }].
export function joinableSeats(entry) {
    if (!entry.state) return [];
    const byId = new Map((entry.state.players || []).map((p) => [p.id, p]));
    return entry.seats
        .filter(
            (s) =>
                s.kind === 'human' &&
                !s.assignedMemberId &&
                byId.has(s.playerId) &&
                ownedCount(entry.state, s.playerId) > 0
        )
        .map((s) => {
            const p = byId.get(s.playerId);
            return { playerId: s.playerId, color: p.color, name: p.name };
        });
}

// Attribue une place PRÉCISE à un membre (choix explicite en rejoignant une
// partie en cours). Vérifie que la place est bien humaine et libre. Aligne la
// couleur du membre sur celle de la place (résumés cohérents). Renvoie le
// playerId attribué, ou null si la place n'est pas (plus) disponible.
export function claimSpecificSeat(entry, socketId, playerId) {
    const seat = entry.seats.find((s) => s.playerId === playerId);
    if (!seat || seat.kind !== 'human' || seat.assignedMemberId) return null;
    seat.assignedMemberId = socketId;
    const member = entry.members.get(socketId);
    if (member) member.color = seat.color;
    return seat.playerId;
}

// Met à jour l'identité d'un membre (son propre nom / sa propre couleur). La
// couleur doit appartenir à la palette et n'être prise par AUCUN autre membre.
// Renvoie true si quelque chose a changé (pour décider de rediffuser).
export function setMemberIdentity(entry, socketId, { name, color } = {}) {
    const member = entry.members.get(socketId);
    if (!member) return false;
    let changed = false;
    if (name != null) {
        const clean = sanitizeName(name);
        if (clean && clean !== member.name) {
            member.name = clean;
            changed = true;
        }
    }
    if (color != null && PALETTE_VALUES.includes(color) && color !== member.color) {
        // Couleur libre uniquement (aucun autre membre ne l'utilise).
        if (!usedColors(entry, { exceptMember: socketId }).has(color)) {
            member.color = color;
            changed = true;
        }
    }
    if (changed) schedulePersist(entry, { immediate: true });
    return changed;
}

// Retire un membre : le sort de la présence et libère le siège qu'il occupait.
export function releaseSeat(entry, socketId) {
    entry.members.delete(socketId);
    for (const seat of entry.seats) {
        if (seat.assignedMemberId === socketId) seat.assignedMemberId = null;
    }
}

// Supprime définitivement un lobby : annule toute écriture différée en attente,
// le retire du cache mémoire ET de la base. Utilisé quand une partie EN ATTENTE
// se vide de tous ses membres (plus personne pour la reprendre).
export async function deleteLobby(entry) {
    const t = persistTimers.get(entry.code);
    if (t) {
        clearTimeout(t);
        persistTimers.delete(entry.code);
    }
    cache.delete(entry.code);
    await lobbiesCol().deleteOne({ _id: entry.code });
}

// Sauvegarde une partie EN COURS que tous les joueurs ont quittée : on bascule en
// statut 'saved', on note l'heure du dernier départ et on libère toute assignation
// de siège résiduelle (plus aucun membre présent). Persistance immédiate.
export async function saveLobby(entry) {
    entry.status = 'saved';
    entry.emptiedAt = new Date();
    for (const seat of entry.seats) seat.assignedMemberId = null;
    await persist(entry);
    return entry;
}

// Reprend une partie sauvegardée : dès qu'un joueur la rejoint, elle redevient
// 'playing' (elle réapparaît alors dans « parties en cours »). Persistance immédiate.
export function resumeLobby(entry) {
    if (entry.status !== 'saved') return entry;
    entry.status = 'playing';
    entry.emptiedAt = null;
    schedulePersist(entry, { immediate: true });
    return entry;
}

// Vérifie le mot de passe d'une partie sauvegardée. Un mot de passe vide côté
// serveur = pas de protection (jointure libre).
export function checkSavePassword(entry, password) {
    if (!entry.savePassword) return true;
    return String(password ?? '') === entry.savePassword;
}

// Nombre de sièges « pourvus » : occupés par un humain OU marqués bot. C'est
// le nombre de joueurs qui participeront réellement (seuil de démarrage).
export function filledCount(entry) {
    return entry.seats.filter((s) => s.assignedMemberId || s.kind === 'bot').length;
}

// Bascule un siège LIBRE entre « humain (ouvert) » et « bot ». Interdit sur un
// siège déjà occupé par un membre, et une fois la partie démarrée. Réservé à
// l'hôte (contrôlé par l'appelant). Renvoie true si changé.
export function setSeatKind(entry, playerId, kind) {
    if (entry.status !== 'waiting') return false;
    if (kind !== 'human' && kind !== 'bot') return false;
    const seat = entry.seats.find((s) => s.playerId === playerId);
    if (!seat || seat.assignedMemberId || seat.kind === kind) return false;
    seat.kind = kind;
    // En devenant bot, on lui garantit une difficulté par défaut.
    if (kind === 'bot') seat.botDifficulty = seat.botDifficulty || 'normal';
    schedulePersist(entry, { immediate: true });
    return true;
}

// Difficulté d'un bot (réservé à l'hôte). Renvoie true si changé.
const BOT_DIFFICULTIES = new Set(['easy', 'normal', 'hard']);
export function setBotDifficulty(entry, playerId, difficulty) {
    if (entry.status !== 'waiting') return false;
    if (!BOT_DIFFICULTIES.has(difficulty)) return false;
    const seat = entry.seats.find((s) => s.playerId === playerId);
    if (!seat || seat.kind !== 'bot' || seat.botDifficulty === difficulty) return false;
    seat.botDifficulty = difficulty;
    schedulePersist(entry, { immediate: true });
    return true;
}

// Réordonne : échange l'occupant du siège `playerId` avec le siège voisin
// (`up` = précédent, `down` = suivant), même si celui-ci est libre. Réservé à la
// salle d'attente. Renvoie true si l'échange a eu lieu.
export function reorderSeat(entry, playerId, direction) {
    if (entry.status !== 'waiting') return false;
    const i = entry.seats.findIndex((s) => s.playerId === playerId);
    const j = i + (direction === 'up' ? -1 : 1);
    if (i < 0 || j < 0 || j >= entry.seats.length) return false;
    const a = entry.seats[i];
    const b = entry.seats[j];
    // On échange TOUT l'occupant du siège : ainsi déplacer un joueur vers un
    // autre numéro de spawn « transporte » son identité, et le siège d'origine
    // hérite de ce qu'il y avait à la place.
    [a.assignedMemberId, b.assignedMemberId] = [b.assignedMemberId, a.assignedMemberId];
    // Le type de siège (humain/bot) et sa difficulté voyagent avec l'occupant
    // qu'ils caractérisent.
    [a.kind, b.kind] = [b.kind, a.kind];
    [a.botDifficulty, b.botDifficulty] = [b.botDifficulty, a.botDifficulty];
    // La couleur suit l'occupant (pour un humain, elle reste de toute façon
    // neutre — sa vraie couleur est portée par son membre).
    [a.color, b.color] = [b.color, a.color];
    schedulePersist(entry, { immediate: true });
    return true;
}

// Résumé public des sièges. Chaque siège expose sa POSITION (numéro de spawn),
// et — s'il est occupé — le NOM et la COULEUR du membre qui l'occupe. `name`/
// `color` retombent sur les valeurs par défaut de la position quand elle est
// libre (utile pour un rendu grisé côté client).
export function seatSummary(entry) {
    return entry.seats.map((s) => {
        const m = s.assignedMemberId ? entry.members.get(s.assignedMemberId) : null;
        const isBot = s.kind === 'bot';
        return {
            playerId: s.playerId,
            kind: s.kind,
            botDifficulty: isBot ? s.botDifficulty || 'normal' : null,
            assignedMemberId: s.assignedMemberId || null,
            taken: !!s.assignedMemberId || isBot,
            // Occupant : nom/couleur du membre, sinon « Bot » (siège bot), sinon
            // valeurs par défaut de la position (siège humain libre).
            name: m?.name ?? (isBot ? 'Bot' : s.name),
            color: m?.color ?? s.color,
        };
    });
}

// --- Démarrage : construit l'état de jeu et bascule en 'playing' ---
export async function startLobby(entry) {
    if (entry.status !== 'waiting') return entry; // déjà démarrée
    entry.state = createInitialState(
        entry.mapId,
        {
            // Nom et couleur de CHAQUE joueur = ceux du membre qui occupe le siège
            // (repli sur les valeurs par défaut de la position si elle est vide).
            // SEULES les places pourvues deviennent des joueurs : les places
            // libres restent des spawns neutres (partie non pleine). On conserve
            // `spawnIndex` = position du siège pour placer chacun au bon spawn
            // malgré les trous.
            players: entry.seats
                .map((s, idx) => {
                    const m = s.assignedMemberId ? entry.members.get(s.assignedMemberId) : null;
                    // SEULES les places pourvues (humain ou bot) deviennent des
                    // joueurs : les places libres restent des spawns neutres.
                    if (!m && s.kind !== 'bot') return null;
                    return {
                        id: s.playerId,
                        name: m?.name ?? 'Bot',
                        color: m?.color ?? s.color,
                        kind: s.kind,
                        botDifficulty: s.kind === 'bot' ? s.botDifficulty || 'normal' : null,
                        spawnIndex: idx,
                    };
                })
                .filter(Boolean),
            settings: entry.settings,
        },
        entry.seed
    );
    // Premier tour : son point de retour est l'état initial lui-même.
    entry.turnStart = entry.state;
    entry.status = 'playing';
    await persist(entry);
    return entry;
}

// --- Application d'une action de jeu (persistance différée) ---
// SYNCHRONE : applique le reducer en mémoire et renvoie le nouvel état tout de
// suite, pour que l'appelant puisse rediffuser SANS attendre la base. La
// persistance est planifiée en arrière-plan (write-behind), forcée en fin de
// partie. Renvoie null si l'action n'a rien changé (illégale/no-op).
export function applyAction(entry, action) {
    if (!entry.state) return null;
    const next = gameReducer(entry.state, action);
    if (next === entry.state) return null;
    // POINT DE RETOUR du tour : l'état figé au moment où la main change. Ce seul
    // endroit suffit à le tenir à jour — toutes les actions passent par ici.
    // L'état étant immuable, ça ne coûte qu'une référence (voir `resetTurn`).
    if (next.activePlayerId !== entry.state.activePlayerId) entry.turnStart = next;
    entry.state = next;
    const gameOver = next.status === 'over' && entry.status !== 'over';
    if (gameOver) entry.status = 'over';
    schedulePersist(entry, { immediate: gameOver });
    return next;
}

// --- Retour au début du tour courant (demande du joueur actif) ---
// Restitue l'instantané pris quand la main lui est revenue. L'instantané vit ICI
// et jamais chez le client : un état fourni par un client serait un plateau
// arbitraire, donc une triche en trois lignes de console.
//
// L'opération est ABSOLUE et idempotente (elle vise un état fixe, pas « le
// dernier coup ») : deux demandes consécutives, ou une demande croisant un coup
// encore en vol, donnent le même résultat. `restoreTurnStart` refuse d'elle-même
// de franchir une frontière de tour (instantané périmé, partie terminée).
//
// Renvoie le nouvel état, ou null s'il n'y avait rien à restituer.
export function resetTurn(entry) {
    if (!entry.state || !entry.turnStart) return null;
    const next = restoreTurnStart(entry.state, entry.turnStart);
    if (next === entry.state) return null;
    entry.state = next;
    schedulePersist(entry);
    return next;
}
