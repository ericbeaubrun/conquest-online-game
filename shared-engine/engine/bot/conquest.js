// Mode CONQUÊTE : aucun ennemi ne peut atteindre notre territoire — on s'étale
// au maximum (achat de soldats lvl 1 + conquêtes dispersées). `bestConquestAction`
// / `conquestActionCreator` sont aussi réutilisés hors de ce mode (unités
// précieuses, soldats « visuels » en conflit) pour la même mécanique de
// récolte/conquête locale.

import {getNeighbors, hexId, hexDistance} from '../../data/hex.js';
import {getLogicalBoard} from '../board.js';
import {computeReachable} from '../selectors.js';
import {soldierCostForLevel} from '../../data/soldier.js';
import {moveSoldier, placeItem, chopTree, openChest} from '../actions.js';
import {isProtectedUnit, soldiersOf, probeMoved} from './helpers.js';
import {inEnemyRange} from './threat.js';
import {bestOffense, executeOffense} from './offense.js';
import {frontierDistanceField} from './movement.js';
import {repositionIdleSoldier} from './reposition.js';
import {nearestLumberjack} from './bonuses/lumberjack.js';
import {nearestNinja} from './bonuses/ninja.js';

function freeOwnedCells(state, board, playerId) {
    const cells = [];
    for (const cell of board.cells) {
        if (cell.blocked) continue;
        if (state.ownership.get(cell.id) !== playerId) continue;
        if (state.placements.has(cell.id)) continue;
        if (board.baseIds.has(cell.id) && !state.destroyedBases?.has(cell.id)) continue;
        let openness = 0;
        for (const nb of getNeighbors(cell.q, cell.r)) {
            const ncell = board.cellMap.get(hexId(nb.q, nb.r));
            if (ncell && !ncell.blocked && state.ownership.get(ncell.id) !== playerId) openness += 1;
        }
        cells.push({id: cell.id, openness});
    }
    cells.sort((a, b) => b.openness - a.openness || (a.id < b.id ? -1 : 1));
    return cells;
}

export function buySoldiers(state, playerId, apply) {
    let cur = state;
    const cost = soldierCostForLevel(1, cur.settings);
    if (cost <= 0) return cur;
    let guard = 0;
    while ((cur.gold[playerId] || 0) >= cost && guard < 40) {
        guard += 1;
        const spot = freeOwnedCells(cur, getLogicalBoard(cur.mapId), playerId)[0];
        if (!spot) break;
        const next = apply(placeItem(spot.id, 'soldier', 1));
        if (!next) break;
        cur = next;
    }
    return cur;
}

// Objets à RÉCOLTER présents sur la carte : arbres, coffres fermés et butins de
// coffres ouverts. Renvoie leurs cases (pour biaiser les déplacements vers eux).
export function harvestTargets(state, board) {
    const objs = [];
    for (const [id, u] of state.placements) {
        if (u.type === 'tree' || u.type === 'chest' || u.type === 'loot') {
            const c = board.cellMap.get(id);
            if (c) objs.push(c);
        }
    }
    return objs;
}

// Un soldat ENNEMI occupe-t-il une case adjacente à `cellId` ? Sert à repérer un
// coffre CONTESTÉ (voir `bestConquestAction`).
function enemyAdjacentToCell(state, board, cellId, ownerId) {
    const cell = board.cellMap.get(cellId);
    if (!cell) return false;
    for (const nb of getNeighbors(cell.q, cell.r)) {
        const u = state.placements.get(hexId(nb.q, nb.r));
        if (u && u.type === 'soldier' && u.playerId !== ownerId) return true;
    }
    return false;
}

// Coffre CONTESTÉ (pas encore ouvert, un ennemi lui est adjacent) dont `cellId`
// est lui-même voisin — la case du coffre GARDÉ, ou `null`. Sert à ne pas
// déserter un poste de garde pour une case anodine (voir `bestConquestAction`).
function guardedChest(state, board, cellId, ownerId) {
    const cell = board.cellMap.get(cellId);
    if (!cell) return null;
    for (const nb of getNeighbors(cell.q, cell.r)) {
        const nid = hexId(nb.q, nb.r);
        const u = state.placements.get(nid);
        if (u && u.type === 'chest' && enemyAdjacentToCell(state, board, nid, ownerId)) return nid;
    }
    return null;
}

// `cellId` reste-t-il adjacent au coffre gardé `guarded` (ou n'y a-t-il rien à
// garder) ? Filtre les cases qui abandonneraient le poste de garde.
function keepsGuard(board, guarded, cellId) {
    if (!guarded) return true;
    const gcell = board.cellMap.get(guarded);
    return getNeighbors(gcell.q, gcell.r).some((nb) => hexId(nb.q, nb.r) === cellId);
}

// Poids : une récolte au contact (abattre / ouvrir / ramasser) prime largement ;
// une conquête reste la brique d'expansion ; l'ouverture sur du terrain neuf et la
// PROXIMITÉ d'un objet à récolter ne servent qu'à départager la case d'expansion.
const HARVEST_SCORE = 1000; // action de récolte immédiate (chop / openChest / loot)
const CONQUER_SCORE = 100; // prise d'une case neuve
const PROX_RADIUS = 5; // au-delà, un objet n'attire plus
const PROX_WEIGHT = 14; // force de l'attraction (reste < CONQUER_SCORE : l'expansion prime)

// Bonus de proximité d'une case aux objets à récolter : plus l'objet le plus
// proche est près, plus la case est attirante (nul au-delà de `PROX_RADIUS`).
export function harvestProximity(cell, objs) {
    let d = Infinity;
    for (const o of objs) d = Math.min(d, hexDistance(cell, o));
    return d <= PROX_RADIUS ? (PROX_RADIUS - d) * PROX_WEIGHT : 0;
}

// Case où le soldat se retrouve RÉELLEMENT après un abattage/ouverture (`chop` /
// `openChest`) : le moteur ne le laisse pas forcément sur `fromId` — s'il n'est
// pas déjà adjacent à la cible, il s'approche d'abord (même règle que le combat,
// voir `approachCell` dans reducer.js). Sans ce calcul on croirait à tort qu'une
// récolte lointaine ne déplace jamais le soldat — dangereux pour une unité qui
// doit rester hors de portée (voir `preciousCellUnsafe`).
function harvestApproachCell(board, reach, fromId, toId) {
    const target = board.cellMap.get(toId);
    if (!target) return fromId;
    let bestId = null;
    let bestDist = Infinity;
    for (const n of getNeighbors(target.q, target.r)) {
        const nid = hexId(n.q, n.r);
        const d = reach.dist.get(nid);
        const canStand = !reach.standable || reach.standable.has(nid);
        if (d != null && canStand && d < bestDist) {
            bestDist = d;
            bestId = nid;
        }
    }
    return bestId ?? fromId;
}

// Meilleure action de mode CONQUÊTE pour un soldat : récolter un objet adjacent,
// sinon conquérir/se déplacer en privilégiant les cases proches des arbres et
// coffres. `taken` réserve les cases déjà visées ce tour (dispersion). Renvoie
// { kind, toId } (kind ∈ chop | openChest | loot | conquer | move) ou
// { kind: 'attack', offense } (plan de `bestOffense`, exécutable via
// `executeOffense`), ou null.
//
// GARDE D'UN COFFRE CONTESTÉ (`guardedChest` : un ennemi est aussi adjacent au
// coffre) : on ne l'ouvre jamais en premier (l'ennemi ramasserait le butin
// aussitôt), mais on ne l'abandonne pas non plus pour une case anodine — soit
// on tente une attaque avantageuse contre l'ennemi qui le dispute (sauf pour
// une unité précieuse, qui ne se bat jamais, voir `isProtectedUnit`), soit on
// n'accepte que les cases qui restent adjacentes au même coffre (`keepsGuard`) :
// une conquête ordinaire ailleurs peut attendre le tour suivant, laisser filer
// un coffre contesté ne se rattrape pas.
export function bestConquestAction(state, S, fromId, taken, {avoidRange = false, unsafeCheck = inEnemyRange} = {}) {
    const board = getLogicalBoard(state.mapId);
    const owner = S.playerId;
    const guarded = guardedChest(state, board, fromId, owner);
    if (guarded && !isProtectedUnit(S)) {
        const offense = bestOffense(state, S, fromId);
        if (offense) return {kind: 'attack', offense};
    }
    const reach = computeReachable({...state, activePlayerId: owner}, board, fromId);
    const objs = harvestTargets(state, board);
    let best = null;
    for (const [toId, info] of reach.moves) {
        if (taken.has(toId)) continue;
        let score;
        if (info.kind === 'openChest' && enemyAdjacentToCell(state, board, toId, owner)) {
            // Coffre CONTESTÉ : un ennemi est lui aussi collé au coffre. L'ouvrir
            // déposerait un butin qu'il pourrait ramasser aussitôt à son tour — on
            // n'ouvre donc PAS, on laisse l'adversaire prendre ce risque.
            continue;
        } else if (info.kind === 'chop' || info.kind === 'openChest') {
            // ZONE DU BÛCHERON / DU NINJA : un arbre ou un coffre déjà affecté à
            // un AUTRE soldat (le spécialiste le plus proche, voir
            // `nearestLumberjack`/`nearestNinja`) ne se propose à personne
            // d'autre — jamais deux soldats sur la même cible, et le spécialiste
            // (qui en tire un bénéfice propre) n'en est jamais privé.
            if (info.kind === 'chop') {
                const claimedBy = nearestLumberjack(state, board.cellMap.get(toId));
                if (claimedBy && claimedBy !== fromId) continue;
            } else {
                const claimedBy = nearestNinja(state, board.cellMap.get(toId));
                if (claimedBy && claimedBy !== fromId) continue;
            }
            // Actions de contact : le soldat reste sur `fromId` s'il y est déjà
            // adjacent, mais s'approche d'abord sinon (voir `harvestApproachCell`) —
            // ce déplacement doit passer par le même filtre de sûreté, et ne pas
            // déserter un poste de garde en cours.
            const landing = (avoidRange || guarded) ? harvestApproachCell(board, reach, fromId, toId) : fromId;
            if (landing !== fromId) {
                if (avoidRange && unsafeCheck(probeMoved(state, fromId, landing), landing, owner)) continue;
                if (guarded && !keepsGuard(board, guarded, landing)) continue;
            }
            score = HARVEST_SCORE;
        } else if (info.kind === 'loot' || info.kind === 'conquer' || info.kind === 'move') {
            // Ces coups DÉPLACENT le soldat : on écarte les cases dangereuses selon
            // `unsafeCheck` (portée ennemie par défaut, plus strict pour une unité
            // précieuse — voir `preciousCellUnsafe`) quand `avoidRange` est demandé,
            // et celles qui abandonneraient un poste de garde en cours.
            if (avoidRange && unsafeCheck(probeMoved(state, fromId, toId), toId, owner)) continue;
            if (guarded && !keepsGuard(board, guarded, toId)) continue;
            if (info.kind === 'loot') {
                score = HARVEST_SCORE; // ramasser un butin vaut une récolte
            } else {
                const cell = board.cellMap.get(toId);
                let openness = 0;
                for (const nb of getNeighbors(cell.q, cell.r)) {
                    const ncell = board.cellMap.get(hexId(nb.q, nb.r));
                    if (ncell && !ncell.blocked && state.ownership.get(ncell.id) !== owner) openness += 1;
                }
                score = (info.kind === 'conquer' ? CONQUER_SCORE : 0) + openness + harvestProximity(cell, objs);
                // Un pur repositionnement (`move`) sans aucun intérêt (ni
                // ouverture sur du terrain neuf, ni objet à proximité) n'est
                // PAS une occupation locale : mieux vaut laisser
                // `repositionIdleSoldier` décider (escorte/frontière/fusion)
                // qu'errer sans but en plein territoire.
                if (info.kind === 'move' && score <= 0) continue;
            }
        } else {
            continue; // fusion / combat : hors sujet en conquête pure
        }
        if (!best || score > best.score || (score === best.score && toId < best.toId)) {
            best = {kind: info.kind, toId, score};
        }
    }
    return best;
}

// Traduit une action de conquête (`bestConquestAction`) en action du moteur.
export function conquestActionCreator(kind, fromId, toId) {
    if (kind === 'chop') return chopTree(fromId, toId);
    if (kind === 'openChest') return openChest(fromId, toId);
    return moveSoldier(fromId, toId); // loot / conquer / move
}

// Mode CONQUÊTE : aucun ennemi ne peut atteindre NOTRE territoire (c'est la
// définition même de ce mode, voir `detectMode`), mais ça ne dit rien des cases
// NEUTRES ou ENNEMIES qu'on s'apprête à conquérir — `avoidRange` (donc
// `inEnemyRange`) est indispensable ici : sans lui, un soldat avance en terrain
// disputé sans jamais remarquer qu'un ennemi resté sur SON PROPRE territoire
// peut déjà l'y frapper au tour suivant (la fusion ne change pas sa portée,
// seulement ses stats — inutile de la modéliser en plus ici).
export function spreadSoldiers(state, playerId, apply) {
    let cur = state;
    const taken = new Set();
    const board = getLogicalBoard(cur.mapId);
    const frontierDist = frontierDistanceField(cur, board, playerId);
    for (const [fromId] of soldiersOf(cur, (u) => u.playerId === playerId)) {
        const soldier = cur.placements.get(fromId);
        if (!soldier || soldier.playerId !== playerId) continue;
        if (cur.movedSoldiers.has(soldier.uid)) continue;
        if (isProtectedUnit(soldier)) continue; // déjà géré par la phase de protection
        const act = bestConquestAction(cur, soldier, fromId, taken, {avoidRange: true});
        if (act) {
            if (act.kind === 'attack') {
                cur = executeOffense(cur, act.offense, fromId, apply);
                continue;
            }
            const next = apply(conquestActionCreator(act.kind, fromId, act.toId));
            if (!next) continue;
            taken.add(act.toId);
            cur = next;
            continue;
        }
        // Rien à conquérir/récolter tout près : les spécialistes (bûcheron,
        // ninja, moine) restent sur leur zone/leur camp plutôt que de le
        // déserter ; les autres se repositionnent (voir `repositionIdleSoldier`)
        // au lieu de s'entasser en plein territoire.
        if (soldier.bonus === 'lumberjack' || soldier.bonus === 'ninja' || soldier.bonus === 'monk') continue;
        cur = repositionIdleSoldier(cur, soldier, fromId, apply, frontierDist);
    }
    return cur;
}
