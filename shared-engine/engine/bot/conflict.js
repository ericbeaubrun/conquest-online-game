// Mode CONFLIT : au moins un ennemi peut atteindre notre territoire. On ne
// pense plus expansion mais ÉCHANGES : chaque soldat est classé « contact »
// (attaquable par l'ennemi) ou « visuel » (hors de portée), et joue selon
// une analyse de sa « zone » qui vise à éviter les échanges désavantageux et
// à saisir les avantageux.

import {hexDistance} from '../../data/hex.js';
import {getLogicalBoard} from '../board.js';
import {computeReachable} from '../selectors.js';
import {MAX_MOVE, canMerge} from '../rules.js';
import {moveSoldier, attackSoldier} from '../actions.js';
import {cellQR, soldiersOf, isProtectedUnit, probeMoved} from './helpers.js';
import {inEnemyRange, isThreatened, worstIncomingAttack} from './threat.js';
import {bestOffense, executeOffense} from './offense.js';
import {stepCells, distToNearestEnemy, nearestAlly, stepTowards, frontierDistanceField} from './movement.js';
import {harvestTargets, harvestProximity, bestConquestAction, conquestActionCreator} from './conquest.js';
import {repositionIdleSoldier} from './reposition.js';
import {huntUndead} from './bonuses/undead.js';
import {equipThieves} from './bonuses/thief.js';
import {huntVulnerable} from './hunt.js';
import {buildHouses} from './bonuses/houses.js';
import {equipMonks} from './bonuses/monk.js';
import {logSoldier} from './log.js';

// Un soldat CONTACT joue selon l'analyse de sa zone. Renvoie le nouvel état.
function playContactSoldier(state, fromId, apply) {
    const S = state.placements.get(fromId);
    if (!S || S.type !== 'soldier') return state;
    const owner = S.playerId;

    // 1) Échange offensif profitable ? -> AVANTAGÉ : on l'exécute (on tue l'ennemi
    //    le plus rentable, en RENFORÇANT d'abord l'attaquant si besoin — fusion
    //    d'un allié présent, ou achat+fusion d'un soldat neuf).
    const offense = bestOffense(state, S, fromId);
    if (offense) return executeOffense(state, offense, fromId, apply);

    // 2) Pas d'attaque rentable. Sommes-nous MENACÉS sur place ?
    if (!isThreatened(state, S, fromId)) {
        // Non menacé : on garde l'avantage en se rapprochant de l'ennemi le plus
        // proche, mais seulement vers une case qui ne nous met pas en danger.
        let best = null;
        let bestDist = distToNearestEnemy(state, fromId, owner);
        for (const {toId} of stepCells(state, S, fromId)) {
            const probe = probeMoved(state, fromId, toId);
            if (isThreatened(probe, S, toId)) continue;
            const d = distToNearestEnemy(state, toId, owner);
            if (d < bestDist || (d === bestDist && best && toId < best)) {
                bestDist = d;
                best = toId;
            }
        }
        if (best) return apply(moveSoldier(fromId, best)) || state;
        return state; // rien de mieux : on tient la position
    }

    // 3) MENACÉ sans riposte -> DÉSAVANTAGÉ : on cherche à fuir hors de portée.
    const candidates = stepCells(state, S, fromId).map((c) => c.toId);
    const fleeBoard = getLogicalBoard(state.mapId);
    const fleeObjs = harvestTargets(state, fleeBoard);

    // 3a) Cases sûres (plus menacé). Priorité : hors de notre territoire (on
    //     continue de grignoter en fuyant), puis proche d'un objet à récolter
    //     (coffre/arbre/butin), puis le plus loin des ennemis.
    let safe = null;
    let safeScore = -Infinity;
    for (const toId of candidates) {
        const probe = probeMoved(state, fromId, toId);
        if (isThreatened(probe, S, toId)) continue;
        const conquer = state.ownership.get(toId) !== owner ? 1000 : 0;
        const prox = harvestProximity(fleeBoard.cellMap.get(toId), fleeObjs);
        const score = conquer + prox + distToNearestEnemy(state, toId, owner);
        if (score > safeScore || (score === safeScore && safe && toId < safe)) {
            safeScore = score;
            safe = toId;
        }
    }
    if (safe) return apply(moveSoldier(fromId, safe)) || state;

    // 3b) Menacé partout : on choisit la case qui coûte le PLUS cher à l'ennemi
    //     (double élimination / il doit y laisser un soldat). On inclut « rester ».
    let bestId = null;
    let bestTheirLoss = -1;
    for (const toId of [fromId, ...candidates]) {
        const probe = toId === fromId ? state : probeMoved(state, fromId, toId);
        const w = worstIncomingAttack(probe, S, toId);
        const theirLoss = w ? w.theirLoss : 0;
        if (theirLoss > bestTheirLoss || (theirLoss === bestTheirLoss && bestId && toId < bestId)) {
            bestTheirLoss = theirLoss;
            bestId = toId;
        }
    }
    if (bestTheirLoss > 0) {
        if (bestId && bestId !== fromId) return apply(moveSoldier(fromId, bestId)) || state;
        return state; // rester force déjà l'ennemi à un échange coûteux
    }

    // 3c) Fichu partout (l'ennemi nous tue sans rien risquer) : on se sacrifie sur
    //     la cible la moins robuste à portée, sinon on rejoint l'allié le plus
    //     proche pour au moins mourir en renfort.
    const board = getLogicalBoard(state.mapId);
    const reach = computeReachable({...state, activePlayerId: owner}, board, fromId);
    let victim = null;
    let victimHp = Infinity;
    for (const [toId, info] of reach.moves) {
        if (info.kind !== 'combat') continue;
        const t = state.placements.get(toId);
        if (!t || t.type !== 'soldier') continue;
        if (t.hp < victimHp || (t.hp === victimHp && victim && toId < victim)) {
            victimHp = t.hp;
            victim = toId;
        }
    }
    if (victim) return apply(attackSoldier(fromId, victim)) || state;

    const ally = nearestAlly(state, fromId, owner);
    if (ally) {
        const toward = stepTowards(state, S, fromId, ally);
        if (toward) return apply(moveSoldier(fromId, toward)) || state;
    }
    return state;
}

// Un soldat VISUEL (hors de portée ennemie). Renvoie { state, label } — le label
// devient « renfort » s'il se porte au secours d'un allié au contact, « combat »
// s'il saisit une attaque avantageuse (typiquement contre l'ennemi qui dispute
// un coffre gardé, voir `bestConquestAction`/`guardedChest`), ou
// « repositionnement » (escorte/frontière/fusion, voir `repositionIdleSoldier`)
// s'il n'a rien de mieux à faire tout près.
function playVisualSoldier(state, fromId, apply, frontierDist) {
    const S = state.placements.get(fromId);
    if (!S || S.type !== 'soldier') return {state, label: 'visuel'};
    const owner = S.playerId;

    // 1) Renfort : rejoindre l'allié CONTACT le plus proche s'il est fusionnable
    //    et qu'on peut s'en approcher à portée de fusion SANS entrer au contact.
    const ally = nearestAlly(state, fromId, owner, {onlyContact: true});
    if (ally && canMerge(S, state.placements.get(ally.id))) {
        const goal = cellQR(ally.id);
        let best = null;
        let bestD = Infinity;
        for (const {toId} of stepCells(state, S, fromId)) {
            const probe = probeMoved(state, fromId, toId);
            if (inEnemyRange(probe, toId, owner)) continue; // ne pas se jeter au contact
            const d = hexDistance(cellQR(toId), goal);
            if (d < bestD || (d === bestD && best && toId < best)) {
                bestD = d;
                best = toId;
            }
        }
        // « à 1 déplacement d'être à portée de fusion » : après ce pas, l'allié est
        // à portée de déplacement (donc de fusion au tour suivant).
        if (best && bestD <= MAX_MOVE) {
            const next = apply(moveSoldier(fromId, best));
            return {state: next || state, label: next ? 'renfort' : 'visuel'};
        }
    }

    // 2) Sinon on clôture le tour utilement : récolte (arbre/coffre/butin) ou
    //    conquête, mais uniquement vers une case hors de portée ennemie (on reste
    //    « visuel »).
    const act = bestConquestAction(state, S, fromId, new Set(), {avoidRange: true});
    if (act) {
        if (act.kind === 'attack') {
            const next = executeOffense(state, act.offense, fromId, apply);
            return {state: next, label: next !== state ? 'combat' : 'visuel'};
        }
        const next = apply(conquestActionCreator(act.kind, fromId, act.toId));
        return {state: next || state, label: 'visuel'};
    }

    // 3) Rien à faire tout près : les spécialistes (bûcheron, ninja, moine)
    //    restent sur leur zone/leur camp, les autres se repositionnent
    //    (escorte, frontière, ou fusion en dernier recours).
    if (S.bonus !== 'lumberjack' && S.bonus !== 'ninja' && S.bonus !== 'monk') {
        const next = repositionIdleSoldier(state, S, fromId, apply, frontierDist);
        if (next !== state) return {state: next, label: 'repositionnement'};
    }
    return {state, label: 'visuel'};
}

// ===========================================================================
// Tour en mode CONFLIT (4 phases)
// ===========================================================================

export function runConflict(state, playerId, apply) {
    let cur = state;

    // Phase 0 : AMORÇAGE du mort-vivant — saisir une occasion de tuer un ennemi
    // de niveau ≥ 2 vulnérable avec un lvl 2 pour décrocher ce bonus fort.
    cur = huntUndead(cur, playerId, apply);

    // Phase 0bis : ÉQUIPER LE VOLEUR sur les raiders déjà éprouvés (avant la
    // classification contact/visuel : ses PV chutent à 1, ça doit peser sur SES
    // décisions de ce tour, pas seulement le suivant).
    cur = equipThieves(cur, playerId, apply);

    // Phase 1 : abattre sans attendre les cibles VULNÉRABLES DE HAUTE VALEUR
    // (porteurs de bonus, économiques en priorité) — quitte à acheter pour ça.
    cur = huntVulnerable(cur, playerId, apply, 'high');

    // Classement (après la phase 1, le plateau a changé) : contact vs visuel.
    const contact = [];
    const visual = [];
    for (const [id, u] of soldiersOf(cur, (s) => s.playerId === playerId)) {
        if (cur.movedSoldiers.has(u.uid)) continue; // déjà joué en phase 1
        if (isProtectedUnit(u)) continue; // unité précieuse : gérée par la protection
        if (inEnemyRange(cur, id, playerId)) {
            contact.push(id);
            logSoldier(id, u, 'contact');
        } else {
            visual.push(id);
            logSoldier(id, u, 'visuel');
        }
    }

    // Phase 2 : les soldats au CONTACT (analyse de zone : échanges avantageux/fuite).
    for (const fromId of contact) {
        const s = cur.placements.get(fromId);
        if (!s || s.playerId !== playerId || cur.movedSoldiers.has(s.uid)) continue;
        cur = playContactSoldier(cur, fromId, apply);
    }

    // Phase 3 : cibles VULNÉRABLES DE FAIBLE VALEUR à la frontière (soldats,
    // squelettes, gobelins...) — nettoyage opportuniste avec l'or restant.
    cur = huntVulnerable(cur, playerId, apply, 'low');

    // Phase 3bis : maisons/moines avec ce qu'il reste APRÈS la chasse — c'est
    // aussi ce qui évite de laisser l'or s'entasser sans rien en faire quand
    // aucune cible profitable ne se présente.
    cur = buildHouses(cur, playerId, apply);
    cur = equipMonks(cur, playerId, apply);

    // Phase 4 : les soldats VISUELS (renfort, récolte facile, sinon
    // repositionnement) pour clôturer le tour.
    const board = getLogicalBoard(cur.mapId);
    const frontierDist = frontierDistanceField(cur, board, playerId);
    for (const fromId of visual) {
        const s = cur.placements.get(fromId);
        if (!s || s.playerId !== playerId || cur.movedSoldiers.has(s.uid)) continue;
        const {state: next, label} = playVisualSoldier(cur, fromId, apply, frontierDist);
        if (label === 'renfort' || label === 'combat' || label === 'repositionnement') {
            logSoldier(fromId, s, label);
        }
        cur = next;
    }
    return cur;
}
