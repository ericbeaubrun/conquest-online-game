// Effets de fin de tour : REVENU, TERRITOIRE et suivi des défis.

import {getNeighbors, hexId} from '../../data/hex.js';
import {
    CHALLENGE_METRICS,
    MONK_IDLE_REWARD,
    PALADIN_IDLE_HEAL,
    PALADIN_IDLE_TURNS,
    isSummonedUnit,
    unlockedBonusIds,
} from '../../data/soldier.js';
import {SOLDIER_HP_MAX} from '../rules.js';
import {kingIncomeBonus} from '../selectors.js';
import {soldiersWithBonus} from './helpers.js';

// Bonus « Roi » : tant qu'un soldat-roi du joueur est en vie, ses maisons ET son
// territoire rapportent KING_INCOME_MULT fois plus. Le surplus est DÉJÀ compris
// dans `ctx.income` (calculé par `incomeFor`, source unique lue aussi par
// l'interface) : cet effet ne fait que le NOTIFIER.
// Premier effet du pipeline — son évènement ouvre donc le journal du tour.
export function applyKingIncome(ctx) {
    const {state, events} = ctx;
    const pid = state.activePlayerId;
    const amount = kingIncomeBonus(state, pid);
    if (amount <= 0) return ctx;
    events.push({kind: 'bonusKing', playerId: pid, amount});
    return ctx;
}

// Bonus « Moine » : chaque moine qui termine le tour SANS AVOIR AGI (absent de
// `movedSoldiers`, exactement le même critère que le défi du « Paladin »)
// rapporte MONK_IDLE_REWARD or. Le gain passe par `ctx.income`, comme celui du
// « Magicien » : c'est le revenu de fin de tour qui le verse, pas une écriture
// directe sur la bourse.
//
// DOIT s'exécuter AVANT la réinitialisation de `movedSoldiers`, pour la même
// raison que `trackPaladinChallenge` : l'inaction ne se lit que sur le tour
// écoulé, aucune lecture instantanée ne la reconstitue.
export function applyMonks(ctx) {
    const {state, events, placements} = ctx;
    const pid = state.activePlayerId;
    let gold = 0;
    for (const [, p] of soldiersWithBonus(placements, pid, 'monk')) {
        if (state.movedSoldiers.has(p.uid)) continue; // il a agi : rien
        gold += MONK_IDLE_REWARD;
    }
    if (!gold) return ctx;
    events.push({kind: 'bonusMonk', playerId: pid, gold});
    return {...ctx, income: ctx.income + gold};
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
        const idle = !state.movedSoldiers.has(p.uid);
        const cur = p.progress?.[metric] || 0;
        let next;
        if (cur >= PALADIN_IDLE_TURNS) next = cur; // déjà accompli : reste acquis
        else if (idle) next = cur + 1; // resté immobile
        else next = 0; // a agi : série interrompue

        // Effet « Paladin » : son immobilité le SOIGNE (plafonné au maximum d'un
        // soldat) — la même inaction que mesure son défi, récompensée une fois le
        // bonus porté.
        const hp =
            p.bonus === 'paladin' && idle
                ? Math.min((p.hp || 0) + PALADIN_IDLE_HEAL, SOLDIER_HP_MAX)
                : p.hp;

        if (next === cur && hp === p.hp) continue;
        if (!placements) placements = new Map(placementsIn);
        placements.set(id, {...p, hp, progress: {...p.progress, [metric]: next}});
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
