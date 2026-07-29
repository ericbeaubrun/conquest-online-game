// Amorçage du bonus « Mort-vivant »
//
// Le mort-vivant est un excellent PREMIER bonus : un soldat qui tue un ennemi de
// niveau ≥ 2 accomplit son défi, et il peut l'équiper DANS LA FOULÉE (même tour —
// l'achat de bonus ne consomme pas l'action). Il laisse alors un squelette allié
// à sa mort. On saisit donc en priorité toute occasion de finir un ennemi de
// niveau ≥ 2 VULNÉRABLE avec un de nos soldats de niveau 2 (amené, fusionné ou
// acheté), puis on achète le mort-vivant sur le tueur survivant.

import {getLogicalBoard} from '../../board.js';
import {canMerge, mergedSoldier, combatResult} from '../../rules.js';
import {soldierCostForLevel, BONUS_OFFERS, bonusPriceOf} from '../../../data/soldier.js';
import {placeItem, mergeSoldier, attackSoldier, buyBonus} from '../../actions.js';
import {reachableFor, freshSoldier} from '../helpers.js';
import {killTrapsUs, buyCellReaching, killValue} from '../hunt.js';

// Plan le moins cher pour tuer `E` (niveau ≥ 2, case `ec`) avec un tueur de
// niveau EXACTEMENT 2 (condition d'éligibilité du mort-vivant) qui survit.
// `null` si aucune amorce n'est possible. `price` = prix du mort-vivant.
function planUndeadKill(state, playerId, ec, E, price) {
    const board = getLogicalBoard(state.mapId);
    const gold = state.gold?.[playerId] || 0;

    // 1) AMENÉ : un soldat lvl 2 déjà en jeu, sans bonus, non joué, à portée.
    if (gold >= price) {
        let best = null;
        for (const [aid, a] of state.placements) {
            if (a.type !== 'soldier' || a.playerId !== playerId) continue;
            if ((a.level || 1) !== 2 || a.bonus) continue;
            if (state.movedSoldiers.has(a.uid)) continue;
            if (reachableFor(state, playerId, aid).moves.get(ec)?.kind !== 'combat') continue;
            const res = combatResult(a, E);
            if (!res.defender.dead || res.attacker.dead) continue;
            if (killTrapsUs(state, a, aid, ec, res, E, playerId)) continue;
            if (!best || aid < best.killerCell) best = {kind: 'existing', killerCell: aid, killerUid: a.uid};
        }
        if (best) return best;
    }

    // 2) FUSIONNÉ : deux soldats lvl 1 à nous fusionnent en lvl 2, qui tue `E`.
    if (gold >= price) {
        const lvl1 = [];
        for (const [aid, a] of state.placements) {
            if (a.type === 'soldier' && a.playerId === playerId && (a.level || 1) === 1 &&
                !a.bonus && !state.movedSoldiers.has(a.uid)) {
                lvl1.push([aid, a]);
            }
        }
        lvl1.sort((x, y) => (x[0] < y[0] ? -1 : 1));
        for (const [toId, to] of lvl1) {
            for (const [fromId, from] of lvl1) {
                if (fromId === toId || !canMerge(from, to)) continue;
                if (reachableFor(state, playerId, fromId).moves.get(toId)?.kind !== 'merge') continue;
                const merged = mergedSoldier(from, to); // lvl 2, sur `toId`, garde l'uid de `to`
                const probe = {...state, placements: new Map(state.placements).set(toId, merged)};
                if (reachableFor(probe, playerId, toId).moves.get(ec)?.kind !== 'combat') continue;
                const res = combatResult(merged, E);
                if (!res.defender.dead || res.attacker.dead) continue;
                if (killTrapsUs(probe, merged, toId, ec, res, E, playerId)) continue;
                return {kind: 'fuse', fromCell: fromId, toCell: toId, killerUid: to.uid};
            }
        }
    }

    // 3) ACHETÉ : acheter un lvl 2, le poser à portée de `E`, l'attaquer.
    const buyCost = soldierCostForLevel(2, state.settings);
    if (gold >= buyCost + price) {
        const fresh = freshSoldier(playerId, 2, state.settings);
        const res = combatResult(fresh, E);
        if (res.defender.dead && !res.attacker.dead) {
            const buyCell = buyCellReaching(state, board, playerId, ec, fresh);
            if (buyCell && !killTrapsUs(state, fresh, buyCell, ec, res, E, playerId)) {
                return {kind: 'buy', buyCell};
            }
        }
    }
    return null;
}

// Exécute un plan d'amorçage : amène/fusionne/achète le tueur lvl 2, l'attaque,
// puis équipe le mort-vivant sur le survivant. Renvoie le nouvel état.
function executeUndeadKill(state, playerId, ec, plan, apply) {
    let cur = state;
    let killerUid = plan.killerUid;
    let attackFrom;

    if (plan.kind === 'existing') {
        attackFrom = plan.killerCell;
    } else if (plan.kind === 'fuse') {
        const merged = apply(mergeSoldier(plan.fromCell, plan.toCell));
        if (!merged) return cur;
        cur = merged;
        attackFrom = plan.toCell;
    } else {
        const bought = apply(placeItem(plan.buyCell, 'soldier', 2));
        if (!bought) return cur;
        cur = bought;
        const placed = cur.placements.get(plan.buyCell);
        if (!placed) return cur;
        killerUid = placed.uid; // uid du soldat fraîchement acheté
        attackFrom = plan.buyCell;
    }

    const after = apply(attackSoldier(attackFrom, ec));
    if (!after) return cur;
    cur = after;

    // Le tueur a pu avancer sur la case de la cible : on le retrouve par son uid.
    let killerCell = null;
    for (const [id, u] of cur.placements) {
        if (u.uid === killerUid && u.playerId === playerId) {
            killerCell = id;
            break;
        }
    }
    if (!killerCell) return cur; // tueur mort (imprévu) : rien à équiper

    const equipped = apply(buyBonus(killerCell, 'undead'));
    if (equipped) {
        cur = equipped;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   amorçage mort-vivant : ${killerCell} abat ${ec} puis s'équipe (${plan.kind})`);
    }
    return cur;
}

// Boucle d'amorçage : tant qu'un ennemi lvl ≥ 2 vulnérable est finissable par un
// lvl 2 à nous et qu'on peut payer le bonus, on le fait (le plateau change à
// chaque fois, d'où la reprise).
export function huntUndead(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.undead === false) return state;
    const undead = BONUS_OFFERS.find((b) => b.id === 'undead');
    if (!undead) return state;
    const price = bonusPriceOf(undead, state.settings);

    let cur = state;
    for (let guard = 0; guard < 6; guard += 1) {
        if ((cur.gold?.[playerId] || 0) < price) break; // même le bonus seul est hors de portée
        const targets = [];
        for (const [id, u] of cur.placements) {
            if (u.type !== 'soldier' || u.playerId === playerId) continue;
            if ((u.level || 1) < 2) continue; // seul un lvl ≥ 2 débloque le défi
            targets.push({id, unit: u, val: killValue(cur, u)});
        }
        targets.sort((a, b) => b.val - a.val || (a.id < b.id ? -1 : 1));

        let acted = false;
        for (const {id: ec, unit: E} of targets) {
            const plan = planUndeadKill(cur, playerId, ec, E, price);
            if (!plan) continue;
            const next = executeUndeadKill(cur, playerId, ec, plan, apply);
            if (next && next !== cur) {
                cur = next;
                acted = true;
                break;
            }
        }
        if (!acted) break;
    }
    return cur;
}
