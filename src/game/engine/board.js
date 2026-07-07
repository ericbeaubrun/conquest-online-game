// Modèle *logique* du plateau : uniquement ce dont les règles ont besoin
// (adjacence, cases bloquées, cases-bases, possession de départ). Aucune donnée
// de rendu (pixels, points SVG) ici — voir `render/geometry.js`. Cette
// séparation permettra au serveur du mode « online » de raisonner sur l'état
// sans jamais connaître la géométrie d'affichage.

import { getMapById, DEFAULT_MAP_ID } from '../maps.js';
import { playersForMap } from '../players.js';
import { hexId, getNeighbors } from '../hex.js';
import { BLOCKED_TERRAIN } from '../terrain.js';
import { STARTING_GOLD } from './rules.js';

// Le modèle logique ne dépend que de l'identifiant de carte : on le mémoïse
// une fois pour toutes (le reducer comme le rendu le réutilisent).
const boardCache = new Map();

export function getLogicalBoard(mapId) {
    if (boardCache.has(mapId)) return boardCache.get(mapId);
    const map = getMapById(mapId);
    const cells = map.cells.map((c) => ({
        id: hexId(c.q, c.r),
        q: c.q,
        r: c.r,
        type: c.type,
        blocked: BLOCKED_TERRAIN.has(c.type),
    }));
    const cellMap = new Map(cells.map((c) => [c.id, c]));
    const baseIds = new Set();
    map.spawns.forEach((s) => {
        const id = hexId(s.q, s.r);
        if (cellMap.has(id)) baseIds.add(id);
    });
    const board = { mapId, map, cells, cellMap, baseIds };
    boardCache.set(mapId, board);
    return board;
}

// Possession de départ : chaque base + ses voisines reviennent à son joueur.
export function buildInitialOwnership(mapId, players) {
    const { map, cellMap } = getLogicalBoard(mapId);
    const ownership = new Map();
    map.spawns.forEach((spawn, i) => {
        const player = players[i];
        if (!player) return;
        const baseId = hexId(spawn.q, spawn.r);
        if (cellMap.has(baseId)) ownership.set(baseId, player.id);
        getNeighbors(spawn.q, spawn.r).forEach((n) => {
            const id = hexId(n.q, n.r);
            if (cellMap.has(id)) ownership.set(id, player.id);
        });
    });
    return ownership;
}

// État de jeu initial pour une carte. C'est la *seule* source de vérité de la
// partie : tour, joueur actif, possession, items posés, soldats ayant joué, or.
export function createInitialState(mapId = DEFAULT_MAP_ID) {
    const map = getMapById(mapId);
    const players = playersForMap(map);
    return {
        mapId,
        players,
        turn: 1,
        activePlayerId: players[0].id,
        ownership: buildInitialOwnership(mapId, players),
        placements: new Map(),
        movedSoldiers: new Set(),
        gold: Object.fromEntries(players.map((p) => [p.id, STARTING_GOLD])),
        uidSeq: 0, // compteur d'identifiants de soldats (déterministe, sérialisable)
    };
}
