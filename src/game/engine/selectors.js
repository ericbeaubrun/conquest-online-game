// Sélecteurs : fonctions PURES qui dérivent des informations de l'état de jeu.
// Partagés entre l'affichage (surbrillances, économie) et le reducer (qui les
// réutilise pour valider les actions). Aucune dépendance à React ni au rendu.

import { getNeighbors, hexId } from '../hex.js';
import { MAX_MOVE, MERGE_MAX, BASE_INCOME } from './rules.js';

// Cases atteignables par le soldat `startId`.
// Règles : MAX_MOVE pas max, dont AU PLUS 1 case hors du territoire (conquête,
// terminale). On traverse son propre territoire et les autres soldats, mais
// jamais une maison / tour / base. On collecte aussi les fusions possibles
// (soldat allié non plein) et les structures alliées bloquantes (indicateur).
export function computeReachable(state, board, startId) {
    const moves = new Map(); // id -> { kind: 'move' | 'conquer' | 'merge' }
    const allies = []; // bâtiments / bases alliés bloquants
    if (!startId) return { moves, allies };
    const { cellMap, baseIds } = board;
    const start = cellMap.get(startId);
    if (!start) return { moves, allies };
    const { placements, ownership, activePlayerId } = state;

    const dist = new Map([[startId, 0]]);
    const queue = [startId];
    const seenAlly = new Set();
    while (queue.length) {
        const curId = queue.shift();
        const d = dist.get(curId);
        if (d >= MAX_MOVE) continue; // plus de pas disponibles
        const cur = cellMap.get(curId);
        for (const nb of getNeighbors(cur.q, cur.r)) {
            const nid = hexId(nb.q, nb.r);
            const ncell = cellMap.get(nid);
            if (!ncell || ncell.blocked) continue; // hors carte ou eau
            const placed = placements.get(nid);
            const isBase = baseIds.has(nid);
            const isBuilding = placed && placed.type !== 'soldier';
            if (isBase || isBuilding) {
                // Structure infranchissable : indicateur si elle est alliée.
                const owner = isBase ? ownership.get(nid) : placed.playerId;
                if (owner === activePlayerId && !seenAlly.has(nid)) {
                    seenAlly.add(nid);
                    allies.push(nid);
                }
                continue;
            }
            const owned = ownership.get(nid) === activePlayerId;
            const isSoldier = placed && placed.type === 'soldier';
            if (owned) {
                // On avance dans notre territoire (on traverse les soldats).
                if (!dist.has(nid)) {
                    dist.set(nid, d + 1);
                    queue.push(nid);
                }
                if (isSoldier) {
                    // Fusion possible sur un soldat allié non plein.
                    if (
                        placed.playerId === activePlayerId &&
                        (placed.level || 1) < MERGE_MAX &&
                        !moves.has(nid)
                    ) {
                        moves.set(nid, { kind: 'merge' });
                    }
                } else if (!moves.has(nid)) {
                    moves.set(nid, { kind: 'move' }); // repositionnement
                }
            } else if (!isSoldier) {
                // Case hors territoire : conquête (1 seule, terminale).
                if (!moves.has(nid)) moves.set(nid, { kind: 'conquer' });
            }
        }
    }
    moves.delete(startId);
    return { moves, allies };
}

// Nombre de cases possédées par un joueur.
export function ownedCount(state, playerId) {
    let n = 0;
    for (const owner of state.ownership.values()) if (owner === playerId) n += 1;
    return n;
}

// Revenu d'un joueur pour un tour : base + 1 or par case possédée.
export function incomeFor(state, playerId) {
    return BASE_INCOME + ownedCount(state, playerId);
}
