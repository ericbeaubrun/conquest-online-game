// Petits utilitaires génériques, partagés par toutes les couches du bot.

import {getNeighbors, hexId} from '../../data/hex.js';
import {getLogicalBoard} from '../board.js';
import {computeReachable} from '../selectors.js';
import {soldierCostForLevel, purchasedSoldierStats} from '../../data/soldier.js';

export const cellQR = (id) => {
    const [q, r] = id.split(',').map(Number);
    return {q, r};
};

// Portée d'atteinte d'un joueur DONNÉ depuis une case (POV de ce joueur, et non
// du joueur actif). On réutilise telle quelle la reachabilité du moteur — donc
// TOUTES ses règles réelles (obstacles, ninja, `canFight`) — en la calculant sur
// un état où c'est ce joueur qui a la main.
export function reachableFor(state, ownerId, fromId) {
    const board = getLogicalBoard(state.mapId);
    return computeReachable({...state, activePlayerId: ownerId}, board, fromId);
}

// Valeur (or-équivalent) d'un soldat : le prix de son niveau. Sert d'unité de
// compte commune pour comparer les échanges — perdre un lvl 2 « coûte » deux fois
// plus que perdre un lvl 1.
export const soldierValue = (state, s) => soldierCostForLevel(s.level || 1, state.settings);

// Un soldat est-il plus fort qu'un autre (attaque d'abord, PV pour départager) ?
export const stronger = (a, b) => a.atk > b.atk || (a.atk === b.atk && a.hp > b.hp);

// Soldat « neuf » d'un niveau donné (stats de boutique) — pour simuler un achat.
export function freshSoldier(playerId, level, settings, affinity = null) {
    const st = purchasedSoldierStats(level, settings);
    return {type: 'soldier', playerId, level: st.level, hp: st.hp, atk: st.atk, bonus: null, affinity};
}

// Case libre, praticable et possédée par `ownerId` adjacente à `cellId` (pour y
// poser un soldat acheté avant de le fusionner). `null` si aucune.
export function freeOwnedNeighbor(state, board, ownerId, cellId) {
    const cell = board.cellMap.get(cellId);
    if (!cell) return null;
    for (const nb of getNeighbors(cell.q, cell.r)) {
        const nid = hexId(nb.q, nb.r);
        const nc = board.cellMap.get(nid);
        if (!nc || nc.blocked) continue;
        if (state.ownership.get(nid) !== ownerId) continue;
        if (state.placements.has(nid)) continue;
        if (board.baseIds.has(nid) && !state.destroyedBases?.has(nid)) continue;
        return nid;
    }
    return null;
}

// Tous les soldats vérifiant un prédicat, sous forme [cellId, unit], triés par
// case (déterminisme).
export function soldiersOf(state, predicate) {
    const out = [];
    for (const [id, u] of state.placements) {
        if (u.type === 'soldier' && predicate(u)) out.push([id, u]);
    }
    out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return out;
}

// Unités PRÉCIEUSES À PROTÉGER : le roi et le guerrier (renforts de départ des
// difficultés moyenne/difficile) et les soutiens économiques/passifs. Trop chères
// ou trop utiles sur la durée pour être risquées : elles fuient au moindre danger
// et ne sont jamais utilisées comme attaquantes ni sacrifiées dans une fusion
// (voir `protectPreciousUnits`, et les gardes dans les routines offensives).
const PROTECTED_BONUSES = new Set([
    'king', 'warrior', 'farmer', 'magician', 'alchemist', 'priest', 'druid', 'warlock',
]);
export const isProtectedUnit = (u) => !!u && u.type === 'soldier' && PROTECTED_BONUSES.has(u.bonus);

// État hypothétique où notre soldat a été déplacé de `fromId` vers `toId` (pour
// évaluer la menace sur une case de destination). La case de destination nous
// revient (invariant : un soldat se tient sur son territoire).
export function probeMoved(state, fromId, toId) {
    const placements = new Map(state.placements);
    const s = placements.get(fromId);
    if (!s) return state;
    placements.delete(fromId);
    placements.set(toId, s);
    const ownership = new Map(state.ownership);
    ownership.set(toId, s.playerId);
    return {...state, placements, ownership};
}
