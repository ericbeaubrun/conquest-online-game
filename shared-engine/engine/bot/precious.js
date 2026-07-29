// Protection des unités précieuses (roi, guerrier, soutiens)

import {getLogicalBoard} from '../board.js';
import {hexDistance} from '../../data/hex.js';
import {MAX_MOVE} from '../rules.js';
import {soldierCostForLevel} from '../../data/soldier.js';
import {moveSoldier} from '../actions.js';
import {cellQR, soldiersOf, isProtectedUnit, probeMoved} from './helpers.js';
import {inEnemyRange} from './threat.js';
import {distToNearestEnemy, stepCells} from './movement.js';
import {bestConquestAction, conquestActionCreator} from './conquest.js';

// Une case est-elle DANGEREUSE pour une unité précieuse ? Beaucoup plus prudent
// que `inEnemyRange` : on considère non seulement les soldats ennemis existants,
// mais aussi le fait que l'ennemi peut ACHETER un soldat et l'amener au contact
// (une unité précieuse est souvent fragile et vaut cher — c'est exactement ce que
// fait la chasse aux cibles de haute valeur). La case est dangereuse si un soldat
// ennemi peut l'attaquer ce tour, OU si une case ennemie LIBRE d'où l'ennemi
// pourrait poser puis amener un soldat (portée `MAX_MOVE + 1`, distance à vol
// d'oiseau, pessimiste) existe et que cet ennemi a de quoi acheter un soldat.
export function preciousCellUnsafe(state, cell, ownerId) {
    if (inEnemyRange(state, cell, ownerId)) return true;
    const board = getLogicalBoard(state.mapId);
    const from = board.cellMap.get(cell);
    if (!from) return true;
    const cost = soldierCostForLevel(1, state.settings);
    for (const c of board.cells) {
        if (c.blocked) continue;
        const owner = state.ownership.get(c.id);
        if (!owner || owner === ownerId) continue; // pas une case ennemie
        if (state.placements.has(c.id)) continue; // occupée : le soldat dessus est déjà couvert
        if (board.baseIds.has(c.id) && !state.destroyedBases?.has(c.id)) continue; // base
        if (hexDistance(from, c) > MAX_MOVE + 1) continue; // hors de portée d'un achat+déplacement
        if ((state.gold?.[owner] || 0) >= cost) return true; // cet ennemi peut acheter et frapper
    }
    return false;
}

// Joue une unité précieuse : elle ne se bat JAMAIS. La fuite n'est priorisée QUE
// si un ennemi semble vouloir s'en approcher (sa case est dangereuse — voir
// `preciousCellUnsafe`, portée d'attaque ou d'achat-frappe) ; elle recule alors
// vers la case la plus SÛRE atteignable. SANS ce signe de danger, elle n'est pas
// menacée : elle contribue normalement (conquête de cases neutres, récolte de
// coffres/arbres), en restant simplement à l'écart de toute case dangereuse.
function playPreciousUnit(state, fromId, apply) {
    const S = state.placements.get(fromId);
    if (!S || S.type !== 'soldier') return state;
    const owner = S.playerId;

    if (!preciousCellUnsafe(state, fromId, owner)) {
        // Aucun ennemi ne semble s'approcher : pas de danger, on avance librement
        // (conquête / récolte), en évitant toute case qui deviendrait dangereuse.
        const act = bestConquestAction(state, S, fromId, new Set(), {
            avoidRange: true,
            unsafeCheck: preciousCellUnsafe,
        });
        if (act) {
            const next = apply(conquestActionCreator(act.kind, fromId, act.toId));
            return next || state;
        }
        return state;
    }

    // Clé de sûreté d'une case (plus haut = plus sûr), par ordre lexicographique :
    //   1. hors de TOUT danger (soldat ennemi ET achat-frappe) — le plus important ;
    //   2. le plus loin possible de l'ennemi le plus proche (plus dur à atteindre) ;
    //   3. rester sur notre territoire (protection des structures/alliés).
    const safetyKey = (toId) => {
        const probe = toId === fromId ? state : probeMoved(state, fromId, toId);
        const safe = preciousCellUnsafe(probe, toId, owner) ? 0 : 1;
        const dist = distToNearestEnemy(state, toId, owner);
        const own = state.ownership.get(toId) === owner ? 1 : 0;
        return safe * 1e7 + Math.min(dist, 99) * 100 + own;
    };

    let best = fromId;
    let bestKey = safetyKey(fromId);
    for (const {toId} of stepCells(state, S, fromId)) {
        const k = safetyKey(toId);
        if (k > bestKey || (k === bestKey && toId < best)) {
            bestKey = k;
            best = toId;
        }
    }
    if (best !== fromId) return apply(moveSoldier(fromId, best)) || state;
    return state; // acculée : rester est déjà le moins pire
}

// Met à l'abri toutes nos unités précieuses AVANT le reste du tour. Chacune est
// ensuite ignorée par les autres phases (elles filtrent `isProtectedUnit`).
export function protectPreciousUnits(state, playerId, apply) {
    let cur = state;
    for (const [fromId] of soldiersOf(cur, (u) => u.playerId === playerId && isProtectedUnit(u))) {
        const s = cur.placements.get(fromId);
        if (!s || s.playerId !== playerId || cur.movedSoldiers.has(s.uid)) continue;
        cur = playPreciousUnit(cur, fromId, apply);
    }
    return cur;
}
