// Chasse aux cibles ennemies VULNÉRABLES (occasions d'achat/attaque). Utilisé en
// mode conflit (`conflict.js`) et par l'amorçage du mort-vivant
// (`bonuses/undead.js`, qui réutilise `killTrapsUs`/`buyCellReaching`/`killValue`).

import {getLogicalBoard} from '../board.js';
import {computeReachable} from '../selectors.js';
import {hexDistance} from '../../data/hex.js';
import {MAX_MOVE, MERGE_MAX, combatResult, canFight} from '../rules.js';
import {soldierCostForLevel} from '../../data/soldier.js';
import {placeItem, attackSoldier} from '../actions.js';
import {reachableFor, soldierValue, isProtectedUnit, freshSoldier} from './helpers.js';
import {worstIncomingAttack} from './threat.js';

// Bonus qui RAPPORTENT de l'or : leurs porteurs sont les cibles les plus
// rentables à abattre (on coupe une source de revenu adverse).
const GOLD_BONUSES = new Set([
    'king', 'warrior', 'thief', 'adventurer', 'farmer', 'lumberjack', 'monk', 'magician', 'blackKnight',
]);

// Priorité de mise à mort (plus haut = plus urgent) : bonus économique > autre
// bonus > soldat/creature nu.
function targetPriority(E) {
    if (E.bonus) return GOLD_BONUSES.has(E.bonus) ? 3 : 2;
    return 1;
}

// Valeur d'une mise à mort : prix du niveau + prime de bonus (forte pour les
// bonus économiques). Sert au tri et de repère (pas de plafond de dépense strict :
// fusionner/acheter conserve la valeur sur le plateau — voir `bestOffense`).
export function killValue(state, E) {
    let v = soldierValue(state, E);
    if (E.bonus) v += GOLD_BONUSES.has(E.bonus) ? 300 : 120;
    return v;
}

// Notre survivant serait-il aussitôt puni ? (même filet anti-piège que l'offensive,
// mais généralisé à un attaquant ACHETÉ pas encore posé.)
export function killTrapsUs(state, attacker, fromId, ec, res, E, owner) {
    const survivor = {...attacker, hp: res.attacker.hp, playerId: owner};
    const undeadLeft = res.defender.dead && E.bonus === 'undead';
    const advances = res.defender.dead && !undeadLeft;
    const finalCell = advances ? ec : fromId;
    const placements = new Map(state.placements);
    placements.delete(fromId);
    if (advances) placements.delete(ec);
    placements.set(finalCell, {...survivor, uid: survivor.uid || '__hunt'});
    const ownership = new Map(state.ownership);
    ownership.set(finalCell, owner);
    const w = worstIncomingAttack({...state, placements, ownership}, survivor, finalCell);
    return !!w && w.killsD && w.theirLoss < soldierValue(state, survivor);
}

// Case libre possédée d'où un soldat neuf `fresh` pourrait atteindre `ec` au
// combat (achat + attaque le même tour). La plus proche d'abord. `null` sinon.
export function buyCellReaching(state, board, owner, ec, fresh) {
    const target = board.cellMap.get(ec);
    const cands = [];
    for (const cell of board.cells) {
        if (cell.blocked || state.ownership.get(cell.id) !== owner) continue;
        if (state.placements.has(cell.id)) continue;
        if (board.baseIds.has(cell.id) && !state.destroyedBases?.has(cell.id)) continue;
        if (hexDistance(cell, target) > MAX_MOVE + 1) continue;
        cands.push(cell);
    }
    cands.sort((a, b) => hexDistance(a, target) - hexDistance(b, target) || (a.id < b.id ? -1 : 1));
    for (const cell of cands) {
        const placements = new Map(state.placements).set(cell.id, {...fresh, uid: '__buy'});
        const reach = computeReachable({...state, placements, activePlayerId: owner}, board, cell.id);
        if (reach.moves.get(ec)?.kind === 'combat') return cell.id;
    }
    return null;
}

// Plan le MOINS cher pour tuer l'ennemi `E` (case `ec`) en le survivant ce tour :
// d'abord un soldat déjà présent (gratuit), sinon l'achat d'un soldat neuf du plus
// bas niveau suffisant. `null` si aucune mise à mort propre n'est possible.
export function planKill(state, playerId, ec, E) {
    const board = getLogicalBoard(state.mapId);

    // Option gratuite : un de nos soldats non joués peut l'atteindre et le tuer en
    // survivant, sans se faire piéger juste après.
    let free = null;
    for (const [aid, a] of state.placements) {
        if (a.type !== 'soldier' || a.playerId !== playerId || state.movedSoldiers.has(a.uid)) continue;
        if (isProtectedUnit(a)) continue; // une unité précieuse ne part jamais à l'assaut
        if (reachableFor(state, playerId, aid).moves.get(ec)?.kind !== 'combat') continue;
        const res = combatResult(a, E);
        if (!res.defender.dead || res.attacker.dead) continue;
        if (killTrapsUs(state, a, aid, ec, res, E, playerId)) continue;
        if (!free || (aid < free.fromId)) free = {kind: 'existing', fromId: aid};
    }
    if (free) return {...free, cost: 0};

    // Sinon : acheter le soldat neuf le moins cher qui tue `E` en survivant, posé
    // sur une case d'où il peut l'atteindre.
    for (let L = 1; L <= MERGE_MAX; L += 1) {
        const cost = soldierCostForLevel(L, state.settings);
        if ((state.gold?.[playerId] || 0) < cost) break; // trop cher (et les suivants aussi)
        const fresh = freshSoldier(playerId, L, state.settings);
        if (!canFight(fresh, E)) continue;
        const res = combatResult(fresh, E);
        if (!res.defender.dead || res.attacker.dead) continue;
        const buyCell = buyCellReaching(state, board, playerId, ec, fresh);
        if (!buyCell) continue;
        if (killTrapsUs(state, fresh, buyCell, ec, res, E, playerId)) continue;
        return {kind: 'buy', buyCell, buyLevel: L, cost};
    }
    return null;
}

// Chasse les cibles vulnérables d'un PALIER donné : 'high' = porteurs de bonus
// (économiques en tête), 'low' = soldats/créatures nus de la frontière. On tue la
// plus prioritaire atteignable, puis on recommence (le plateau a changé).
export function huntVulnerable(state, playerId, apply, tier) {
    let cur = state;
    for (let guard = 0; guard < 30; guard += 1) {
        const targets = [];
        for (const [id, u] of cur.placements) {
            if (u.type !== 'soldier' || u.playerId === playerId) continue;
            const isBonus = !!u.bonus;
            if (tier === 'high' && !isBonus) continue;
            if (tier === 'low' && isBonus) continue;
            targets.push({id, unit: u, prio: targetPriority(u), val: killValue(cur, u)});
        }
        targets.sort((a, b) => b.prio - a.prio || b.val - a.val || (a.id < b.id ? -1 : 1));

        let acted = false;
        for (const {id: ec, unit: E} of targets) {
            const plan = planKill(cur, playerId, ec, E);
            if (!plan) continue;
            let next = cur;
            if (plan.kind === 'buy') {
                const bought = apply(placeItem(plan.buyCell, 'soldier', plan.buyLevel));
                if (bought) next = bought;
                const after = apply(attackSoldier(plan.buyCell, ec));
                if (!after) continue; // attaque refusée : on garde le soldat acheté, on n'insiste pas
                next = after;
            } else {
                const after = apply(attackSoldier(plan.fromId, ec));
                if (!after) continue;
                next = after;
            }
            /* eslint-disable-next-line no-console */
            console.log(`[bot]   chasse ${tier} : abat ${ec}${E.bonus ? ` (${E.bonus})` : ''} via ${plan.kind}`);
            cur = next;
            acted = true;
            break;
        }
        if (!acted) break;
    }
    return cur;
}
