// Store des lobbies/parties. Remplace l'ancien `rooms.js` statique.
//
// Deux couches :
//  - PERSISTANTE (MongoDB) : métadonnées du lobby + état de jeu SÉRIALISÉ. Écrite
//    en « write-through » à chaque changement, donc un redémarrage du serveur ne
//    perd aucune partie. C'est la source de vérité durable.
//  - VIVE (mémoire) : cache des lobbies chargés, dont l'état de jeu désérialisé
//    (Map/Set, prêt pour le reducer) et l'OCCUPATION des sièges (playerId ->
//    socketId). L'occupation est éphémère par nature (elle suit les connexions)
//    et n'est donc pas persistée.

import { lobbiesCol } from './db.js';
import {
    createInitialState,
    gameReducer,
    serializeState,
    deserializeState,
    randomSeed,
    getMapById,
    playersForMap,
} from './exportEngine.js';

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
        seats: doc.seats,
        state: doc.state ? deserializeState(doc.state) : null,
        occupancy: new Map(), // vide : personne n'est (encore) reconnecté après chargement
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
        occupancy: new Map(),
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
        const taken = live ? live.occupancy.size : 0;
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

// --- Sièges (occupation vive) ---
export function claimSeat(entry, socketId) {
    for (const seat of entry.seats) {
        if (seat.kind === 'human' && !entry.occupancy.has(seat.playerId)) {
            entry.occupancy.set(seat.playerId, socketId);
            return seat.playerId;
        }
    }
    return null; // partie pleine -> spectateur
}

export function releaseSeat(entry, socketId) {
    for (const [pid, sid] of entry.occupancy) {
        if (sid === socketId) entry.occupancy.delete(pid);
    }
}

export function seatSummary(entry) {
    return entry.seats.map((s) => ({
        playerId: s.playerId,
        name: s.name,
        color: s.color,
        taken: entry.occupancy.has(s.playerId),
    }));
}

// --- Démarrage : construit l'état de jeu et bascule en 'playing' ---
export async function startLobby(entry) {
    if (entry.status !== 'waiting') return entry; // déjà démarrée
    entry.state = createInitialState(
        entry.mapId,
        {
            players: entry.seats.map((s) => ({ id: s.playerId, name: s.name, color: s.color, kind: s.kind })),
            settings: entry.settings,
        },
        entry.seed
    );
    entry.status = 'playing';
    await persist(entry);
    return entry;
}

// --- Application d'une action de jeu (avec persistance write-through) ---
// Renvoie le nouvel état, ou null si l'action n'a rien changé (illégale/no-op).
export async function applyAction(entry, action) {
    if (!entry.state) return null;
    const next = gameReducer(entry.state, action);
    if (next === entry.state) return null;
    entry.state = next;
    if (next.status === 'over' && entry.status !== 'over') entry.status = 'over';
    await persist(entry);
    return next;
}
