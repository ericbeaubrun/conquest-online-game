// Sauvegardes HORS-LIGNE persistées dans le `localStorage` du navigateur.
//
// Une sauvegarde fige l'état COMPLET d'une partie locale (plateau, joueurs,
// or, réglages, historique...) via `serializeState` — la même correspondance
// état interne ⇆ JSON que le mode online. Recharger une partie revient donc à
// réinjecter cet état tel quel dans le reducer (voir `useGameSession`), sans
// repasser par `createInitialState` : la partie reprend exactement où elle en
// était.
//
// Le format persistant est volontairement autonome (mapId, nom de carte,
// nombre de joueurs, tour, date) afin d'afficher la liste sans désérialiser
// chaque état.
//
// Capacité FIXE de `MAX_SAVE_SLOTS` emplacements, gérés en FILE : sauvegarder
// alors que les 10 slots sont pleins évince la sauvegarde la PLUS ANCIENNE.
// L'écran « Charger une partie » rend cette capacité visible en affichant
// toujours 10 slots (les libres en pointillés).

import { serializeState } from '@conquest/shared-engine/engine/serialize.js';
import { getMapById } from '@conquest/shared-engine/data/maps.js';

const STORAGE_KEY = 'conquest.savedGames.v1';

// Nombre d'emplacements de sauvegarde hors-ligne.
export const MAX_SAVE_SLOTS = 10;

// Lecture défensive : un `localStorage` indisponible (mode privé, quota) ou un
// contenu corrompu ne doit jamais faire planter le menu — on retombe sur [].
function readAll() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function writeAll(list) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        return true;
    } catch {
        return false;
    }
}

// Liste des sauvegardes, la plus récente d'abord (pour l'affichage du menu).
export function listSavedGames() {
    return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

// Enregistre l'état courant comme NOUVELLE sauvegarde et renvoie son entrée.
export function saveGame(state) {
    const map = getMapById(state.mapId);
    const entry = {
        id: `save_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        savedAt: Date.now(),
        mapId: state.mapId,
        mapName: map?.name ?? state.mapId,
        playerCount: state.players?.length ?? 0,
        turn: state.turn ?? 1,
        state: serializeState(state),
    };
    // File de `MAX_SAVE_SLOTS` : on ajoute en tête (la plus récente) et on
    // tronque la queue — la plus ancienne sauvegarde est perdue au-delà de 10.
    const list = [entry, ...readAll().sort((a, b) => b.savedAt - a.savedAt)].slice(0, MAX_SAVE_SLOTS);
    writeAll(list);
    return entry;
}

// État sérialisé d'une sauvegarde donnée (à désérialiser côté session), ou null.
export function getSavedState(id) {
    const entry = readAll().find((s) => s.id === id);
    return entry ? entry.state : null;
}

export function deleteSavedGame(id) {
    writeAll(readAll().filter((s) => s.id !== id));
}
