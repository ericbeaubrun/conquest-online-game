// Offensive : notre meilleure attaque depuis un soldat, en s'autorisant à le
// renforcer d'abord (fusion gratuite, ou achat + fusion) quand cela rend
// l'échange gagnant. Utilisé par le mode conflit (`conflict.js`) et par la
// conquête pure quand elle croise une occasion (`conquest.js`, garde de coffre).

import {getLogicalBoard} from '../board.js';
import {computeReachable} from '../selectors.js';
import {MERGE_MAX, canMerge, mergedSoldier, combatResult} from '../rules.js';
import {soldierCostForLevel} from '../../data/soldier.js';
import {placeItem, mergeSoldier, attackSoldier} from '../actions.js';
import {reachableFor, soldierValue, freshSoldier, freeOwnedNeighbor, isProtectedUnit} from './helpers.js';
import {nextReinforcement, worstIncomingAttack} from './threat.js';

// Menace qui pèserait sur notre soldat APRÈS avoir porté une attaque : on place
// le survivant (PV à jour) sur sa case finale (il avance sur la case de la cible
// tuée si elle se libère, sinon il reste sur sa case) et on regarde la pire
// riposte ennemie. Sert à débusquer les attaques-pièges (voir `bestOffense`).
function threatAfterAttack(state, variant, fromId, toId, res, target) {
    const survivor = {...variant.unit, hp: res.attacker.hp};
    const undeadLeftover = res.defender.dead && target.bonus === 'undead'; // laisse un squelette
    const advances = res.defender.dead && !undeadLeftover;
    const finalCell = advances ? toId : fromId;
    const placements = new Map(state.placements);
    placements.delete(fromId);
    for (const r of variant.reinforcements) {
        if (r.type === 'merge') placements.delete(r.fromCell);
    }
    if (advances) placements.delete(toId);
    placements.set(finalCell, survivor);
    const ownership = new Map(state.ownership);
    ownership.set(finalCell, survivor.playerId);
    return worstIncomingAttack({...state, placements, ownership}, survivor, finalCell);
}

// Cherche le meilleur coup d'attaque pour notre soldat `S` (case `fromId`), en
// s'autorisant à d'abord RENFORCER l'attaquant quand cela rend l'échange gagnant :
//   - FUSION avec un allié adjacent (gratuite) ;
//   - ACHAT + FUSION : on pose un soldat neuf de même niveau sur une case libre
//     voisine puis on le fusionne — l'attaquant monte d'un niveau (coûte de l'or).
// On ne retient qu'un échange PROFITABLE (on détruit plus de valeur qu'on n'en
// risque). Renvoie un plan exécutable, ou null.
//
// Le PREMIER renfort est branché sur CHAQUE allié éligible plutôt que réduit au
// plus fort : deux alliés différents peuvent porter des affinités différentes,
// or c'est l'affinité finale qui décide quelles cibles restent combattables
// (`canFight`) — un allié numériquement plus faible peut donc débloquer un coup
// qu'un allié plus fort empêche. Chaque premier choix est ensuite prolongé par
// une chaîne GRÉDIQUE (`nextReinforcement`, fusion gratuite d'abord) jusqu'à
// `MERGE_MAX - 1` renforts au total — capture les empilements à 3 renforts et
// plus qu'un seul pas ne voyait pas.
//
// L'or dépensé pour l'achat n'est PAS retranché du gain : fusionner conserve la
// valeur (un lvl 2 vaut deux lvl 1), l'achat ne fait que convertir de l'or en
// valeur sur le plateau. On PRÉFÈRE néanmoins les variantes les moins chères à
// gain égal (départage), pour ne payer que quand ça débloque réellement un coup.
// (Charger le coût sur le gain serait le premier bouton à tourner si le bot
// dépense trop.)
export function bestOffense(state, S, fromId) {
    const board = getLogicalBoard(state.mapId);
    const owner = S.playerId;

    // Variantes de premier renfort : sans renfort, fusion avec chaque allié
    // éligible, ou achat+fusion. `unit` est la forme finale de l'attaquant à ce
    // stade, `reinforcements` la liste ordonnée des coups exécutables pour y
    // arriver, `cost` l'or déjà engagé.
    const firstSteps = [{unit: S, reinforcements: [], cost: 0}];
    for (const [aid, a] of state.placements) {
        if (a.type !== 'soldier' || a.playerId !== owner || aid === fromId) continue;
        if (isProtectedUnit(a)) continue; // ne pas consumer une unité précieuse dans une fusion
        if (!canMerge(a, S)) continue;
        if (reachableFor(state, owner, aid).moves.get(fromId)?.kind !== 'merge') continue;
        firstSteps.push({unit: mergedSoldier(a, S), reinforcements: [{type: 'merge', fromCell: aid}], cost: 0});
    }
    // Achat + fusion : impossible si `S` porte un bonus (un soldat acheté n'en a
    // pas → fusion refusée) ou s'il est déjà au niveau max.
    if (!S.bonus && (S.level || 1) < MERGE_MAX) {
        const cost = soldierCostForLevel(S.level || 1, state.settings);
        const buyCell = freeOwnedNeighbor(state, board, owner, fromId);
        if ((state.gold?.[owner] || 0) >= cost && buyCell) {
            const unit = mergedSoldier(freshSoldier(owner, S.level || 1, state.settings), S);
            firstSteps.push({unit, reinforcements: [{type: 'buy', buyCell, buyLevel: S.level || 1, cost}], cost});
        }
    }

    // Prolongement en chaîne de chaque premier choix, jusqu'au plafond réel.
    const variants = [];
    for (const first of firstSteps) {
        variants.push(first);
        const used = new Set([fromId]);
        for (const r of first.reinforcements) {
            if (r.type === 'merge') used.add(r.fromCell);
        }
        let gold = (state.gold?.[owner] || 0) - first.cost;
        let cur = first.unit;
        let chain = first.reinforcements;
        let cost = first.cost;
        for (let step = chain.length; step < MERGE_MAX - 1; step += 1) {
            const next = nextReinforcement(state, owner, cur, fromId, used, gold);
            if (!next) break;
            if (next.step.type === 'merge') used.add(next.step.fromCell);
            else {
                gold -= next.step.cost;
                cost += next.step.cost;
            }
            cur = next.unit;
            chain = [...chain, next.step];
            variants.push({unit: cur, reinforcements: chain, cost});
        }
    }

    let best = null;
    for (const variant of variants) {
        // Reachabilité de l'attaquant sous sa forme (renforcée) éventuelle : la
        // fusion peut changer l'affinité, donc les cibles combattables.
        const probe = variant.reinforcements.length
            ? {...state, placements: new Map(state.placements).set(fromId, variant.unit)}
            : state;
        const reach = computeReachable({...probe, activePlayerId: owner}, board, fromId);
        for (const [toId, info] of reach.moves) {
            if (info.kind !== 'combat') continue;
            const target = probe.placements.get(toId);
            if (!target || target.type !== 'soldier') continue; // cibles = soldats (v1)
            const res = combatResult(variant.unit, target);
            const enemyKilled = res.defender.dead ? soldierValue(state, target) : 0;
            const ourLost = res.attacker.dead ? soldierValue(state, variant.unit) : 0;
            const survives = !res.attacker.dead;
            // Filet de sécurité : un échange gagnant sur le papier peut être un
            // PIÈGE si notre survivant se retrouve à portée d'une riposte qui nous
            // fait perdre plus que le gain. On escompte cette perte future.
            let futureLoss = 0;
            if (survives) {
                const w = threatAfterAttack(probe, variant, fromId, toId, res, target);
                const ourValue = soldierValue(state, variant.unit);
                if (w && w.killsD && w.theirLoss < ourValue) futureLoss = ourValue - w.theirLoss;
            }
            const trade = enemyKilled - ourLost - futureLoss;
            if (trade <= 0) continue; // pas d'échange à perte, neutre ou piégé
            const plan = {
                toId,
                reinforcements: variant.reinforcements,
                cost: variant.cost,
                trade,
                enemyKilled,
                survives,
            };
            if (
                !best ||
                (survives && !best.survives) ||
                (survives === best.survives && trade > best.trade) ||
                // À gain égal : d'abord le moins cher (or), puis la plus grosse prise.
                (survives === best.survives && trade === best.trade && plan.cost < best.cost) ||
                (survives === best.survives && trade === best.trade && plan.cost === best.cost &&
                    plan.enemyKilled > best.enemyKilled)
            ) {
                best = plan;
            }
        }
    }
    return best;
}

// Exécute un plan de `bestOffense` : joue sa chaîne de renforts dans l'ordre
// puis l'attaque. Un maillon manqué (imprévu) interrompt l'exécution SANS
// attaquer — on n'attaque pas avec un attaquant plus faible que prévu.
export function executeOffense(state, offense, fromId, apply) {
    let cur = state;
    for (const r of offense.reinforcements) {
        if (r.type === 'buy') {
            const bought = apply(placeItem(r.buyCell, 'soldier', r.buyLevel));
            if (bought) cur = bought;
            const merged = apply(mergeSoldier(r.buyCell, fromId));
            if (!merged) return cur;
            cur = merged;
        } else {
            const merged = apply(mergeSoldier(r.fromCell, fromId));
            if (!merged) return cur;
            cur = merged;
        }
    }
    const after = apply(attackSoldier(fromId, offense.toId));
    return after || cur;
}
