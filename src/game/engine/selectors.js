// Sélecteurs : fonctions PURES qui dérivent des informations de l'état de jeu.
// Partagés entre l'affichage (surbrillances, économie) et le reducer (qui les
// réutilise pour valider les actions). Aucune dépendance à React ni au rendu.

import { getNeighbors, hexId } from '../hex.js';
import {
    MAX_MOVE,
    BASE_INCOME,
    canMerge,
    isAttackable,
} from './rules.js';
import { upkeepFor } from '../soldier.js';

// Cases atteignables par le soldat `startId`.
// Règles : MAX_MOVE pas max, dont AU PLUS 1 case hors du territoire (conquête,
// terminale). On traverse son propre territoire et les autres soldats, mais
// jamais une maison / tour / base. On collecte aussi les fusions possibles
// (soldat allié non plein) et les structures alliées bloquantes (indicateur).
export function computeReachable(state, board, startId) {
    const moves = new Map(); // id -> { kind: 'move' | 'conquer' | 'merge' }
    const allies = []; // bâtiments / bases alliés bloquants
    const dist = new Map(); // id -> nombre de pas depuis `startId` (BFS)
    if (!startId) return { moves, allies, dist };
    const { cellMap, baseIds } = board;
    const start = cellMap.get(startId);
    if (!start) return { moves, allies, dist };
    const { placements, ownership, activePlayerId } = state;
    const mover = placements.get(startId); // soldat qui se déplace (pour la fusion)
    // Bonus « Coureur » : portée de déplacement doublée à l'intérieur du
    // territoire (la conquête reste limitée à 1 case hors territoire).
    const maxMove = mover?.bonus === 'runner' ? MAX_MOVE * 2 : MAX_MOVE;

    dist.set(startId, 0);
    const queue = [startId];
    const seenAlly = new Set();
    while (queue.length) {
        const curId = queue.shift();
        const d = dist.get(curId);
        if (d >= maxMove) continue; // plus de pas disponibles
        const cur = cellMap.get(curId);
        for (const nb of getNeighbors(cur.q, cur.r)) {
            const nid = hexId(nb.q, nb.r);
            const ncell = cellMap.get(nid);
            if (!ncell || ncell.blocked) continue; // hors carte ou eau
            const placed = placements.get(nid);
            // Arbre : infranchissable, mais abattable par un soldat adjacent.
            if (placed && placed.type === 'tree') {
                if (!moves.has(nid)) moves.set(nid, { kind: 'chop' });
                continue;
            }
            const isBase = baseIds.has(nid);
            const isBuilding = placed && placed.type !== 'soldier';
            if (isBase || isBuilding) {
                // Structure infranchissable : indicateur si elle est alliée,
                // cible de combat si c'est une tour ennemie attaquable.
                const owner = isBase ? ownership.get(nid) : placed.playerId;
                if (owner === activePlayerId) {
                    if (!seenAlly.has(nid)) {
                        seenAlly.add(nid);
                        allies.push(nid);
                    }
                } else if (isBuilding && isAttackable(placed) && !moves.has(nid)) {
                    moves.set(nid, { kind: 'combat' });
                }
                continue;
            }
            const isSoldier = placed && placed.type === 'soldier';
            // Soldat ennemi : cible de combat (terminale, infranchissable).
            if (isSoldier && placed.playerId !== activePlayerId) {
                if (!moves.has(nid)) moves.set(nid, { kind: 'combat' });
                continue;
            }
            const owned = ownership.get(nid) === activePlayerId;
            if (owned) {
                // On avance dans notre territoire (on traverse les soldats).
                if (!dist.has(nid)) {
                    dist.set(nid, d + 1);
                    queue.push(nid);
                }
                if (isSoldier) {
                    // Fusion possible sur un soldat allié de MÊME niveau.
                    if (
                        placed.playerId === activePlayerId &&
                        canMerge(mover, placed) &&
                        !moves.has(nid)
                    ) {
                        moves.set(nid, { kind: 'merge' });
                    } else if (
                        placed.playerId === activePlayerId &&
                        !canMerge(mover, placed) &&
                        !seenAlly.has(nid)
                    ) {
                        // Allié infusionnable : case occupée où l'on ne peut
                        // pas s'arrêter — indicateur de blocage (allié).
                        seenAlly.add(nid);
                        allies.push(nid);
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
    return { moves, allies, dist };
}

// Nombre de cases possédées par un joueur.
export function ownedCount(state, playerId) {
    let n = 0;
    for (const owner of state.ownership.values()) if (owner === playerId) n += 1;
    return n;
}

// Entretien total (or/tour) des unités d'un joueur. Somme du barème d'entretien
// (`upkeepFor`) sur toutes ses unités posées ; les maisons, d'entretien négatif,
// diminuent ce total (elles rapportent).
export function upkeepTotal(state, playerId) {
    let sum = 0;
    for (const placed of state.placements.values()) {
        if (placed.playerId === playerId) sum += upkeepFor(placed);
    }
    return sum;
}

// Revenu d'un joueur pour un tour : base + 1 or par case possédée, moins
// l'entretien de ses unités (jamais négatif). Les maisons ayant un entretien
// négatif, elles augmentent au contraire ce revenu.
export function incomeFor(state, playerId) {
    const gross = BASE_INCOME + ownedCount(state, playerId);
    return Math.max(0, gross - upkeepTotal(state, playerId));
}
