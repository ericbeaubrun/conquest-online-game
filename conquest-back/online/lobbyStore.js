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
    getMapById,
    playersForMap,
    PALETTE_VALUES,
    colorName,
} from './exportEngine.js';

// --- Identité d'un joueur (membre) : nom + couleur, CHOISIS par le joueur ---
// La couleur et le nom appartiennent au MEMBRE, pas au siège : quand l'hôte
// réordonne, ils voyagent avec le joueur vers le nouveau numéro de spawn.
const MAX_NAME_LEN = 16;

const sanitizeName = (name) => (typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LEN) : '');

// Couleurs déjà UTILISÉES dans le lobby : celles des membres (joueurs humains) ET
// celles des sièges bot. Source unique pour garantir qu'aucun joueur/bot ne
// partage une couleur. `exceptMember` / `exceptSeat` excluent l'entité en cours
// d'édition (pour ne pas la considérer comme « en conflit avec elle-même »).
function usedColors(entry, { exceptMember = null, exceptSeat = null } = {}) {
    const used = new Set();
    for (const [id, m] of entry.members) if (id !== exceptMember) used.add(m.color);
    for (const seat of entry.seats) {
        if (seat.kind === 'bot' && seat.playerId !== exceptSeat) used.add(seat.color);
    }
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
        members: new Map(), // memberId -> { name, color }
        hostMemberId: null,
    };
}

// --- Création ---
export async function createLobby({ mapId, settings = {}, name } = {}) {
    const map = getMapById(mapId); // repli sur la 1re carte si mapId inconnu
    // Sièges dérivés de la carte : autant que de points de départ, avec les noms
    // et couleurs par défaut. Tous « humains » pour l'instant (bots à venir).
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
        members: new Map(), // memberId -> { name, color }
        hostMemberId: null,
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
        return {
            code: d._id,
            name: d.name,
            mapId: d.mapId,
            status: d.status,
            seatsTotal: d.seats?.length ?? 0,
            seatsTaken: taken,
        };
    });
}

// --- Configuration d'un lobby en attente (carte + réglages) ---
// Réservée à l'hôte, tant que la partie n'a pas démarré. Changer de carte
// RE-DÉRIVE les sièges (leur nombre suit la capacité de la carte) : on préserve
// l'occupation des sièges qui existent encore (p1..pN) et on libère ceux qui
// disparaissent (leurs occupants redeviennent spectateurs). Persistance immédiate.
export function configureLobby(entry, { mapId, settings } = {}) {
    if (entry.status !== 'waiting') return entry; // partie déjà démarrée : figé

    if (mapId && mapId !== entry.mapId) {
        const map = getMapById(mapId);
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
        // Couleur libre uniquement (aucun autre membre NI bot ne l'utilise).
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

// Bascule un siège LIBRE entre « humain (ouvert) » et « bot ». Interdit sur un
// siège occupé par un joueur (on ne kicke personne) et hors salle d'attente.
// Un siège 'bot' n'accueille plus d'humain (voir claimSeat) et sera joué par
// l'IA du serveur. Renvoie true si le type a changé.
export function setSeatKind(entry, playerId, kind) {
    if (entry.status !== 'waiting') return false;
    if (kind !== 'human' && kind !== 'bot') return false;
    const seat = entry.seats.find((s) => s.playerId === playerId);
    if (!seat || seat.assignedMemberId) return false; // occupé par un humain : figé
    if (seat.kind === kind) return false;
    seat.kind = kind;
    // En devenant bot, on lui garantit une couleur LIBRE (sa couleur par défaut de
    // position pourrait être déjà prise par un joueur/bot) et une difficulté.
    if (kind === 'bot') {
        seat.color = firstFreeColor(entry, seat.color, { exceptSeat: seat.playerId });
        seat.botDifficulty = seat.botDifficulty || 'normal';
    }
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

// Change la couleur d'un siège BOT (réservé à l'hôte). La couleur doit être de la
// palette et n'être utilisée par aucun autre joueur/bot. Renvoie true si changé.
export function setBotColor(entry, playerId, color) {
    if (entry.status !== 'waiting') return false;
    const seat = entry.seats.find((s) => s.playerId === playerId);
    if (!seat || seat.kind !== 'bot') return false;
    if (!PALETTE_VALUES.includes(color) || color === seat.color) return false;
    if (usedColors(entry, { exceptSeat: playerId }).has(color)) return false;
    seat.color = color;
    schedulePersist(entry, { immediate: true });
    return true;
}

// Nombre de sièges « pourvus » : occupés par un humain OU marqués bot. C'est le
// nombre de joueurs qui participeront réellement (seuil de démarrage).
export function filledCount(entry) {
    return entry.seats.filter((s) => s.assignedMemberId || s.kind === 'bot').length;
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
    // On échange TOUT l'occupant (membre humain OU type bot) : ainsi déplacer un
    // joueur ou un bot vers un autre numéro de spawn « transporte » son identité,
    // et le siège d'origine hérite de ce qu'il y avait à la place.
    [a.assignedMemberId, b.assignedMemberId] = [b.assignedMemberId, a.assignedMemberId];
    [a.kind, b.kind] = [b.kind, a.kind];
    // La couleur ET la difficulté suivent l'occupant : ainsi tout ce qui
    // caractérise un bot voyage avec lui (pour un humain, couleur/difficulté de
    // siège sont neutres, sa vraie couleur étant portée par son membre).
    [a.color, b.color] = [b.color, a.color];
    [a.botDifficulty, b.botDifficulty] = [b.botDifficulty, a.botDifficulty];
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
            taken: !!s.assignedMemberId,
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
            // SEULES les places pourvues (humain ou bot) deviennent des joueurs :
            // les places libres restent des spawns neutres (partie non pleine). On
            // conserve `spawnIndex` = position du siège pour placer chacun au bon
            // spawn malgré les trous.
            players: entry.seats
                .map((s, idx) => {
                    const m = s.assignedMemberId ? entry.members.get(s.assignedMemberId) : null;
                    const isBot = s.kind === 'bot';
                    if (!m && !isBot) return null; // place libre : pas de joueur
                    return {
                        id: s.playerId,
                        name: m?.name ?? 'Bot',
                        color: m?.color ?? s.color,
                        kind: s.kind,
                        botDifficulty: isBot ? s.botDifficulty || 'normal' : null,
                        spawnIndex: idx,
                    };
                })
                .filter(Boolean),
            settings: entry.settings,
        },
        entry.seed
    );
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
    entry.state = next;
    const gameOver = next.status === 'over' && entry.status !== 'over';
    if (gameOver) entry.status = 'over';
    schedulePersist(entry, { immediate: gameOver });
    return next;
}
