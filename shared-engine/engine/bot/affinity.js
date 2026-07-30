// AFFINITÉS (feu, glace, foudre, bouclier divin) — la lecture qu'en fait le bot.
//
// La règle du moteur tient en une phrase (`canFight`) : deux unités de MÊME
// élément refusent le combat, et le BOUCLIER refuse en plus le combat contre
// toute unité SANS affinité. Une affinité n'est donc ni une arme ni une armure :
// c'est un REFUS, et il joue dans les deux sens — ce qui ne peut pas me tuer,
// je ne peux pas le tuer non plus.
//
// Trois conséquences, et ce module ne fait rien d'autre que les jouer :
//
//   1. UN ENNEMI QU'ON NE PEUT PAS COMBATTRE EST UN MUR. `computeReachable` le
//      dit mot pour mot : « un ennemi de même affinité reste un simple obstacle,
//      ni attaquable ni franchissable ». Un porte-bouclier adverse (un Paladin,
//      le plus souvent) ne peut donc ni tuer ni CONTOURNER nos soldats sans
//      affinité : un simple soldat à 25 or posé au bon endroit arrête net un
//      bélier à 150 or que rien d'autre dans notre armée ne peut toucher.
//      C'est `blockShieldRaiders`, et c'est la réponse la moins chère du jeu.
//
//   2. QUAND IL FAUT VRAIMENT LE TUER, il n'y a qu'une clé : un ÉLÉMENT. Seuls
//      le feu, la glace et la foudre peuvent croiser le fer avec un bouclier.
//      Sans un seul porteur d'élément, un porte-bouclier adverse est
//      littéralement invincible (mesuré : 89 tours dans cet état sur 10 parties
//      de la carte moyenne). `answerShields` achète cette clé — 75 or — et la
//      donne au soldat qui peut effectivement aller s'en servir.
//
//   3. UNE AFFINITÉ BIEN CHOISIE REND INTOUCHABLE. Si tout ce qui menace notre
//      unité porte le feu, lui acheter le feu la retire du jeu adverse pour 75
//      or. C'est `buyDefensiveAffinity`.
//
// Et le garde-fou qui les accompagne toutes : une affinité AVEUGLE aussi son
// porteur (`wouldBlind`). Elle lui interdit d'attaquer les porteurs du même
// élément et d'abattre les arbres de cet élément (`canChopTree`) ; un bouclier
// lui interdit en plus toute la piétaille adverse. On ne pose donc jamais un
// élément sans vérifier ce qu'il coûte à celui qui le reçoit.

import {getNeighbors, hexId, hexDistance} from '../../data/hex.js';
import {getLogicalBoard} from '../board.js';
import {canFight, combatResult, SHIELD_AFFINITY, AFFINITY_IDS} from '../rules.js';
import {ITEM_COST} from '../../data/items.js';
import {soldierCostForLevel} from '../../data/soldier.js';
import {canChopTree, treeAffinity} from '../../data/trees.js';
import {placeItem, moveSoldier, attackSoldier} from '../actions.js';
import {reachableFor, soldierValue, isProtectedUnit, probeMoved, soldiersOf, cellQR} from './helpers.js';
import {inEnemyRange, isThreatened} from './threat.js';

// Or gardé en réserve après l'achat d'une affinité : elle ne doit pas manger le
// tour d'expansion (75 or, soit trois soldats de base).
const AFFINITY_GOLD_RESERVE = 50;
// Au-delà, on ne cherche plus à bloquer : un raider qui menace six structures à
// la fois n'est plus un problème d'affinité mais de front.
const MAX_BLOCKS_PER_TURN = 2;
// Valeur (en or) à partir de laquelle une unité menacée mérite qu'on lui achète
// son immunité : en dessous, l'affinité coûte plus cher que ce qu'elle sauve.
const MIN_VALUE_FOR_IMMUNITY = 100;

const affinityCost = (affinity, settings) =>
    settings?.itemCost?.[affinity] ?? ITEM_COST[affinity] ?? 0;

// Un soldat à nous peut-il encore recevoir une affinité ?
const canReceive = (u, playerId) =>
    !!u && u.type === 'soldier' && u.playerId === playerId && u.affinity == null && !u.unit;

// Une unité SANS affinité (ou porteuse d'un bouclier) est un mur pour un
// porte-bouclier : il ne peut ni la frapper ni la franchir.
const wallsOffShield = (u) => !!u && u.type === 'soldier' && (u.affinity == null || u.affinity === SHIELD_AFFINITY);

// Structures à nous (maison, tours, base debout) — ce qu'un porte-bouclier
// adverse vient chercher, puisque nos soldats sans affinité lui sont interdits.
function ownStructureCells(state, playerId) {
    const board = getLogicalBoard(state.mapId);
    const cells = new Set();
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' && u.type !== 'tree' && u.type !== 'chest' && u.playerId === playerId) {
            cells.add(id);
        }
    }
    for (const id of board.baseIds) {
        if (state.destroyedBases?.has(id)) continue;
        if (state.ownership.get(id) === playerId) cells.add(id);
    }
    return cells;
}

// Porte-boucliers adverses, triés par case (déterminisme).
function enemyShieldRaiders(state, playerId) {
    const out = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId === playerId) continue;
        if (u.affinity === SHIELD_AFFINITY) out.push([id, u]);
    }
    out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return out;
}

// Structures à nous que ce raider peut frapper CE TOUR.
function structuresThreatenedBy(state, raiderCell, raider, structures) {
    const reach = reachableFor(state, raider.playerId, raiderCell);
    const hit = [];
    for (const cell of structures) {
        if (reach.moves.get(cell)?.kind === 'combat') hit.push(cell);
    }
    return hit;
}

// Une affinité AVEUGLE-t-elle son porteur ? Elle lui interdit le combat contre
// les porteurs du même élément (et, pour le bouclier, contre toute unité qui
// n'en porte aucune), et l'abattage des arbres de cet élément. On refuse donc
// de la poser quand elle lui retirerait des cibles ou du travail qu'il a
// aujourd'hui — un bûcheron aveuglé sur sa propre forêt est un bûcheron perdu.
export function wouldBlind(state, cellId, soldier, affinity) {
    const board = getLogicalBoard(state.mapId);
    const withAff = {...soldier, affinity};
    const reach = reachableFor(state, soldier.playerId, cellId);
    for (const [toId, info] of reach.moves) {
        const target = state.placements.get(toId);
        if (!target) continue;
        if (info.kind === 'combat' && target.type === 'soldier' && !canFight(withAff, target)) return true;
        if (info.kind === 'chop' && !canChopTree(withAff, target)) return true;
    }
    // Bûcheron / aventurier : sa valeur est la forêt autour de lui, pas
    // seulement les arbres à portée ce tour-ci.
    if (soldier.bonus === 'lumberjack' || soldier.bonus === 'adventurer') {
        for (const [id, u] of state.placements) {
            if (u.type === 'tree' && treeAffinity(u) === affinity && state.ownership.get(id) === soldier.playerId) {
                return true;
            }
        }
    }
    return !board.cellMap.has(cellId); // case inconnue : on s'abstient
}

// ---------------------------------------------------------------------------
// 1. BARRAGE — arrêter un porte-bouclier avec des soldats qu'il ne peut pas
//    toucher. Gratuit quand le soldat existe déjà, 25 or sinon.
// ---------------------------------------------------------------------------

// Cases où poser un mur pour couper l'accès du raider à `structure` : les cases
// LIBRES d'où il la frapperait (elles lui sont adjacentes et il peut s'y tenir).
function blockingCells(state, board, raiderCell, raider, structure) {
    const cell = board.cellMap.get(structure);
    if (!cell) return [];
    const reach = reachableFor(state, raider.playerId, raiderCell);
    const out = [];
    for (const n of getNeighbors(cell.q, cell.r)) {
        const nid = hexId(n.q, n.r);
        const nc = board.cellMap.get(nid);
        if (!nc || nc.blocked || state.placements.has(nid)) continue;
        if (board.baseIds.has(nid) && !state.destroyedBases?.has(nid)) continue;
        const kind = reach.moves.get(nid)?.kind;
        if (kind === 'move' || kind === 'conquer') out.push(nid);
    }
    out.sort((a, b) => (a < b ? -1 : 1));
    return out;
}

// Le mur tient-il ? On rejoue la portée du raider sur l'état hypothétique : la
// structure ne doit plus lui être accessible.
function blockHolds(state, cellIds, blocker, raiderCell, raider, structure) {
    const placements = new Map(state.placements);
    const ownership = new Map(state.ownership);
    for (const cellId of cellIds) {
        placements.set(cellId, blocker);
        ownership.set(cellId, blocker.playerId);
    }
    const probe = {...state, placements, ownership};
    return reachableFor(probe, raider.playerId, raiderCell).moves.get(structure)?.kind !== 'combat';
}

// Pose un mur sur `cellId` : un soldat à nous SANS affinité déjà en jeu (le
// moins précieux qui puisse y aller, jamais une unité protégée), sinon un
// soldat de base acheté sur place.
function placeWall(state, playerId, cellId, apply) {
    let best = null;
    for (const [id, u] of soldiersOf(state, (s) => s.playerId === playerId)) {
        if (!wallsOffShield(u) || isProtectedUnit(u) || state.movedSoldiers.has(u.uid)) continue;
        const kind = reachableFor(state, playerId, id).moves.get(cellId)?.kind;
        if (kind !== 'move' && kind !== 'conquer') continue;
        // Le mur ne doit pas se faire tuer par QUELQU'UN D'AUTRE : `inEnemyRange`
        // applique déjà `canFight`, donc le raider lui-même n'y compte pas.
        if (inEnemyRange(probeMoved(state, id, cellId), cellId, playerId)) continue;
        const val = soldierValue(state, u);
        if (!best || val < best.val || (val === best.val && id < best.id)) best = {id, val};
    }
    if (best) {
        const next = apply(moveSoldier(best.id, cellId));
        if (next) return {state: next, how: `soldat ${best.id} déplacé`};
    }
    // Personne sous la main : un soldat de base suffit, il n'a rien à craindre
    // du raider (c'est précisément parce qu'il n'a pas d'affinité).
    const cost = soldierCostForLevel(1, state.settings);
    if (state.ownership.get(cellId) !== playerId) return null;
    if ((state.gold?.[playerId] || 0) < cost + AFFINITY_GOLD_RESERVE) return null;
    const next = apply(placeItem(cellId, 'soldier', 1));
    return next ? {state: next, how: 'soldat acheté'} : null;
}

export function blockShieldRaiders(state, playerId, apply) {
    const raiders = enemyShieldRaiders(state, playerId);
    if (!raiders.length) return state;
    const board = getLogicalBoard(state.mapId);
    let cur = state;
    let done = 0;

    for (const [raiderCell, raider] of raiders) {
        if (done >= MAX_BLOCKS_PER_TURN) break;
        const structures = ownStructureCells(cur, playerId);
        if (!structures.size) break;
        const threatened = structuresThreatenedBy(cur, raiderCell, raider, structures);
        for (const structure of threatened) {
            if (done >= MAX_BLOCKS_PER_TURN) break;
            const cells = blockingCells(cur, board, raiderCell, raider, structure);
            // Une structure a jusqu'à six abords ; n'agir que sur celles qui
            // n'en ont qu'un ne déclenchait presque jamais le barrage (mesuré :
            // 12 poses sur 10 parties). On accepte donc d'en murer DEUX — le
            // prix de deux soldats de base contre une maison qui en vaut deux
            // aussi, et un bélier qui continuerait sinon.
            if (!cells.length || cells.length > MAX_BLOCKS_PER_TURN) continue;
            const probeWall = {type: 'soldier', playerId, affinity: null, hp: 1, atk: 1, level: 1, uid: '__wall'};
            // Le barrage ne vaut que s'il est COMPLET : murer un abord sur deux
            // ne fait que choisir par où le raider passera.
            if (!blockHolds(cur, cells, probeWall, raiderCell, raider, structure)) continue;

            let placed = 0;
            for (const cellId of cells) {
                const res = placeWall(cur, playerId, cellId, apply);
                if (!res) break;
                cur = res.state;
                placed += 1;
                /* eslint-disable-next-line no-console */
                console.log(`[bot]   barrage anti-bouclier en ${cellId} (${res.how}) : ${structure} protégée de ${raiderCell}`);
            }
            if (!placed) continue;
        }
    }
    return cur;
}

// ---------------------------------------------------------------------------
// 2. LA CLÉ — acheter un élément pour pouvoir enfin toucher un porte-bouclier,
//    et s'en servir dans le même tour.
// ---------------------------------------------------------------------------

// Élément à acheter face à un raider : celui qui aveugle le moins son porteur.
// À défaut d'argument, l'ordre du catalogue tranche (déterminisme).
function pickElement(state, cellId, soldier) {
    for (const id of AFFINITY_IDS) {
        if (!wouldBlind(state, cellId, soldier, id)) return id;
    }
    return null;
}

export function answerShields(state, playerId, apply) {
    const raiders = enemyShieldRaiders(state, playerId);
    if (!raiders.length) return state;

    // Avons-nous déjà quelqu'un capable de les combattre ? Si oui, rien à acheter :
    // c'est `huntShields` qui s'en charge.
    let cur = state;
    for (const [raiderCell, raider] of raiders) {
        let answered = false;
        for (const [, u] of cur.placements) {
            if (u.type === 'soldier' && u.playerId === playerId && canFight(u, raider)) {
                answered = true;
                break;
            }
        }
        if (answered) continue;

        // Le futur porteur : celui qui, ÉLÉMENT EN MAIN, gagnerait l'échange
        // contre le raider ; à défaut, notre plus gros soldat disponible (il
        // finira par l'user). Jamais une unité protégée.
        const candidates = [];
        for (const [id, u] of soldiersOf(cur, (s) => s.playerId === playerId)) {
            if (!canReceive(u, playerId) || isProtectedUnit(u)) continue;
            const res = combatResult(u, raider);
            candidates.push({id, unit: u, wins: res.defender.dead && !res.attacker.dead, atk: u.atk || 0});
        }
        candidates.sort(
            (a, b) => Number(b.wins) - Number(a.wins) || b.atk - a.atk || (a.id < b.id ? -1 : 1)
        );

        for (const c of candidates) {
            const element = pickElement(cur, c.id, c.unit);
            if (!element) continue;
            const cost = affinityCost(element, cur.settings);
            if ((cur.gold?.[playerId] || 0) < cost + AFFINITY_GOLD_RESERVE) break;
            const next = apply(placeItem(c.id, element));
            if (!next) continue;
            cur = next;
            /* eslint-disable-next-line no-console */
            console.log(`[bot]   ${element} acheté pour ${c.id} : seule réponse au porte-bouclier ${raiderCell}`);
            break;
        }
    }
    return cur;
}

// Envoie nos porteurs d'élément sur les porte-boucliers adverses : eux seuls
// peuvent les toucher, et le reste du bot l'ignore (il les emploie comme des
// soldats ordinaires, et le raider n'est jamais dans leur liste de cibles).
// Attaque si l'échange est gagnant, s'en approche sinon.
export function huntShields(state, playerId, apply) {
    const raiders = enemyShieldRaiders(state, playerId);
    if (!raiders.length) return state;
    let cur = state;

    for (const [raiderCell, raider] of raiders) {
        let hunter = null; // à défaut d'une frappe, le meilleur candidat à la marche
        for (const [id, u] of soldiersOf(cur, (s) => s.playerId === playerId)) {
            if (isProtectedUnit(u) || cur.movedSoldiers.has(u.uid)) continue;
            if (!canFight(u, raider)) continue;
            const res = combatResult(u, raider);
            // Règle d'engagement. Exiger le coup fatal ne marche pas : un
            // porte-bouclier a 12 PV et personne ne les enlève d'un coup — le
            // raider ne mourait donc jamais. On accepte l'USURE (frapper et
            // survivre), et l'échange à mort quand il l'emporte avec nous : un
            // bélier vaut plus cher que le soldat qui le stoppe.
            const worthTrade = res.defender.dead || !res.attacker.dead;
            if (!worthTrade) continue;
            if (reachableFor(cur, playerId, id).moves.get(raiderCell)?.kind === 'combat') {
                const next = apply(attackSoldier(id, raiderCell));
                if (next) {
                    cur = next;
                    hunter = null;
                    /* eslint-disable-next-line no-console */
                    console.log(`[bot]   ${id} (porteur d'élément) abat le porte-bouclier ${raiderCell}`);
                    break;
                }
            }
            if (!hunter) hunter = {id, unit: u};
        }

        // Personne au contact : le porteur d'élément MARCHE vers le raider. Sans
        // ce pas, la clé achetée ne sert à rien — mesuré, le porteur restait à
        // l'autre bout de la carte dans les deux tiers des tours, parce que rien
        // dans le reste du bot ne désigne un porte-bouclier comme objectif.
        if (hunter) {
            const step = stepToward(cur, hunter.id, hunter.unit, raiderCell);
            if (step) {
                const next = apply(moveSoldier(hunter.id, step));
                if (next) cur = next;
            }
        }
    }
    return cur;
}

// Case atteignable qui rapproche le plus de `targetCell`, en refusant celles où
// notre chasseur se ferait tuer par quelqu'un d'autre en chemin.
function stepToward(state, fromId, unit, targetCell) {
    const target = cellQR(targetCell);
    const here = cellQR(fromId);
    let best = null;
    let bestDist = hexDistance(here, target);
    for (const [toId, info] of reachableFor(state, unit.playerId, fromId).moves) {
        if (info.kind !== 'move' && info.kind !== 'conquer') continue;
        const probe = probeMoved(state, fromId, toId);
        // Prudence CALIBRÉE : un chasseur de bouclier va au contact par
        // définition, lui interdire toute case à portée ennemie
        // (`inEnemyRange`) revenait à ne jamais le faire bouger d'un front
        // actif. On n'écarte donc que les cases où il se ferait tuer à perte
        // (`isThreatened`), pas celles où il est simplement exposé.
        if (isThreatened(probe, unit, toId)) continue;
        const d = hexDistance(cellQR(toId), target);
        if (d < bestDist || (d === bestDist && best && toId < best)) {
            bestDist = d;
            best = toId;
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// 3. IMMUNITÉ — acheter à une unité de valeur l'affinité qui la retire du jeu
//    adverse.
// ---------------------------------------------------------------------------

// Attaquants ennemis capables de frapper `cellId` ce tour (avec leurs affinités).
function attackersOf(state, cellId, playerId) {
    const out = [];
    for (const [eid, e] of state.placements) {
        if (e.type !== 'soldier' || e.playerId === playerId) continue;
        if (reachableFor(state, e.playerId, eid).moves.get(cellId)?.kind !== 'combat') continue;
        out.push(e);
    }
    return out;
}

export function buyDefensiveAffinity(state, playerId, apply) {
    let cur = state;
    for (const [id, u] of soldiersOf(cur, (s) => s.playerId === playerId)) {
        if (!canReceive(u, playerId)) continue;
        if (soldierValue(cur, u) < MIN_VALUE_FOR_IMMUNITY && !u.bonus) continue;
        const attackers = attackersOf(cur, id, playerId);
        if (!attackers.length) continue;
        // Une affinité ne sauve que si elle bloque TOUS les attaquants : en
        // bloquer trois sur quatre, c'est mourir quand même.
        for (const element of AFFINITY_IDS) {
            const armed = {...u, affinity: element};
            if (attackers.some((e) => canFight(e, armed))) continue;
            if (wouldBlind(cur, id, u, element)) continue;
            const cost = affinityCost(element, cur.settings);
            if ((cur.gold?.[playerId] || 0) < cost + AFFINITY_GOLD_RESERVE) break;
            const next = apply(placeItem(id, element));
            if (!next) break;
            cur = next;
            /* eslint-disable-next-line no-console */
            console.log(`[bot]   ${element} acheté pour ${id} : le rend intouchable par ses ${attackers.length} agresseur(s)`);
            break;
        }
    }
    return cur;
}

// Point d'entrée unique appelé par `runBotTurn` : barrage d'abord (gratuit),
// puis la clé et son emploi, puis les immunités défensives.
export function playAffinities(state, playerId, apply) {
    let cur = blockShieldRaiders(state, playerId, apply);
    cur = answerShields(cur, playerId, apply);
    cur = huntShields(cur, playerId, apply);
    return buyDefensiveAffinity(cur, playerId, apply);
}
