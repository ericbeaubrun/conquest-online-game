// Effets de fin de tour : REVENU, TERRITOIRE et suivi des défis.

import {getNeighbors, hexId} from '../../data/hex.js';
import {
    CHALLENGE_METRICS,
    PALADIN_IDLE_TURNS,
    isSummonedUnit,
    unlockedBonusIds,
} from '../../data/soldier.js';
import {kingHouseIncomeBonus} from '../selectors.js';
import {soldiersWithBonus} from './helpers.js';

// Bonus « Roi » : tant qu'un soldat-roi du joueur est en vie, ses maisons
// rapportent KING_HOUSE_INCOME_MULT fois plus. Le surplus est DÉJÀ compris dans
// `ctx.income` (calculé par `incomeFor`, source unique lue aussi par
// l'interface) : cet effet ne fait que le NOTIFIER.
// Premier effet du pipeline — son évènement ouvre donc le journal du tour.
export function applyKingIncome(ctx) {
    const {state, events} = ctx;
    const pid = state.activePlayerId;
    const amount = kingHouseIncomeBonus(state, pid);
    if (amount <= 0) return ctx;
    events.push({kind: 'bonusKing', playerId: pid, amount});
    return ctx;
}

// Défi « Paladin » : un soldat qui termine son tour SANS AVOIR AGI (ni déplacé,
// ni fusionné, ni attaqué, ni abattu — absent de `movedSoldiers`) progresse ;
// agir remet son compteur à zéro. Le défi se débloque après PALADIN_IDLE_TURNS
// tours consécutifs d'inactivité, puis reste acquis (comme le défi « Druide »).
//
// DOIT s'exécuter AVANT la réinitialisation de `movedSoldiers` : c'est le seul
// défi qui mesure une inaction sur la DURÉE d'un tour, qu'aucune lecture
// instantanée ne peut reconstituer.
export function trackPaladinChallenge(ctx) {
    const {state, placements: placementsIn} = ctx;
    const pid = state.activePlayerId;
    const metric = CHALLENGE_METRICS.PALADIN_IDLE_TURNS;
    let placements = null; // copié à la volée seulement si un compteur change
    for (const [id, p] of placementsIn) {
        if (p.type !== 'soldier' || p.playerId !== pid || isSummonedUnit(p)) continue;
        const cur = p.progress?.[metric] || 0;
        let next;
        if (cur >= PALADIN_IDLE_TURNS) next = cur; // déjà accompli : reste acquis
        else if (!state.movedSoldiers.has(p.uid)) next = cur + 1; // resté immobile
        else next = 0; // a agi : série interrompue
        if (next === cur) continue;
        if (!placements) placements = new Map(placementsIn);
        placements.set(id, {...p, progress: {...p.progress, [metric]: next}});
    }
    return placements ? {...ctx, placements} : ctx;
}

// Acquittement des notifications de bonus : les bonus débloqués et réclamables
// des soldats du joueur qui vient de jouer rejoignent leur `bonusSeen`. La
// notification ne réapparaîtra donc plus, même si le bonus reste non réclamé.
//
// DOIT s'exécuter AVANT « Conquérant » : les défis d'état se lisent sur le
// plateau tel qu'il est à cet instant, et l'annexion ne prend que des cases
// VIDES, sans arbre ni maison à recompter.
export function ackBonusNotifications(ctx) {
    const {state, placements: placementsIn, ownership} = ctx;
    const pid = state.activePlayerId;
    const world = {placements: placementsIn, ownership};
    let placements = null;
    for (const [id, p] of placementsIn) {
        if (p.type !== 'soldier' || p.playerId !== pid) continue;
        const ids = unlockedBonusIds(p, state.settings, state.settings?.bonusesEnabled !== false, world);
        const fresh = ids.filter((bid) => !p.bonusSeen?.includes(bid));
        if (!fresh.length) continue;
        if (!placements) placements = new Map(placementsIn);
        placements.set(id, {...p, bonusSeen: [...(p.bonusSeen || []), ...fresh]});
    }
    return placements ? {...ctx, placements} : ctx;
}

// Bonus « Conquérant » : chaque conquérant annexe toutes les cases VIDES
// adjacentes — libres (aucune unité ni structure), non bloquées, hors base —
// qu'elles soient neutres OU déjà possédées par un adversaire. Modifie la carte
// des propriétés (`ownership`), pas celle des items.
export function applyConquerors(ctx) {
    const {state, board, events, placements, ownership: ownershipIn} = ctx;
    const pid = state.activePlayerId;
    let ownership = null; // copié à la volée seulement si une case est annexée
    let annexed = 0;
    for (const [id] of soldiersWithBonus(placements, pid, 'conqueror')) {
        const cell = board.cellMap.get(id);
        if (!cell) continue;
        for (const n of getNeighbors(cell.q, cell.r)) {
            const nid = hexId(n.q, n.r);
            const ncell = board.cellMap.get(nid);
            if (!ncell || ncell.blocked || board.baseIds.has(nid)) continue; // hors carte / eau / base
            if (placements.has(nid)) continue; // case occupée (non vide) : pas d'annexion
            if ((ownership || ownershipIn).get(nid) === pid) continue; // déjà à nous
            if (!ownership) ownership = new Map(ownershipIn);
            ownership.set(nid, pid);
            annexed += 1;
        }
    }
    if (!annexed) return ctx;
    events.push({kind: 'bonusConqueror', playerId: pid, count: annexed});
    return {...ctx, ownership};
}
