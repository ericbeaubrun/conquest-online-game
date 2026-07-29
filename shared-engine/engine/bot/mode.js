// Détection de mode

import {getNeighbors, hexId} from '../../data/hex.js';
import {getLogicalBoard} from '../board.js';
import {MAX_MOVE} from '../rules.js';
import {NINJA_MOVE_MULT} from '../../data/soldier.js';

// Un ennemi peut-il entrer sur notre territoire ? APPROXIMATION volontairement
// PESSIMISTE (obstacles ignorés) : ce n'est qu'une PORTE d'entrée du mode
// conflit — la vraie portée, obstacles compris, est recalculée soldat par soldat
// une fois dedans. Jamais un ennemi menaçant ne passe inaperçu ici.
function enemyCanReachTerritory(state, playerId) {
    const board = getLogicalBoard(state.mapId);
    for (const [id, placed] of state.placements) {
        if (placed.type !== 'soldier' || placed.playerId === playerId) continue;
        const range = placed.bonus === 'ninja' ? MAX_MOVE * NINJA_MOVE_MULT : MAX_MOVE;
        const seen = new Set([id]);
        let front = [id];
        for (let step = 0; step < range; step += 1) {
            const next = [];
            for (const curId of front) {
                const cur = board.cellMap.get(curId);
                if (!cur) continue;
                for (const nb of getNeighbors(cur.q, cur.r)) {
                    const nid = hexId(nb.q, nb.r);
                    const ncell = board.cellMap.get(nid);
                    if (!ncell || ncell.blocked || seen.has(nid)) continue;
                    seen.add(nid);
                    if (state.ownership.get(nid) === playerId) return true;
                    next.push(nid);
                }
            }
            front = next;
        }
    }
    return false;
}

// Mode du tour, déduit du seul terrain (aucune mémoire d'un tour à l'autre).
export function detectMode(state, playerId) {
    return enemyCanReachTerritory(state, playerId) ? 'conflit' : 'conquete';
}
