// Sélecteurs : fonctions PURES qui dérivent des informations de l'état de jeu.
// Partagés entre l'affichage (surbrillances, économie) et le reducer (qui les
// réutilise pour valider les actions). Aucune dépendance à React ni au rendu.

import {getNeighbors, hexId} from '../data/hex.js';
import {
    MAX_MOVE,
    BASE_INCOME,
    canMerge,
    canFight,
    isAttackable,
} from './rules.js';
import {upkeepFor, KING_INCOME_MULT, NINJA_MOVE_MULT} from '../data/soldier.js';
import {canChopTree} from '../data/trees.js';
import {getLogicalBoard} from './board.js';
import {DOMINATION_PERCENT, ECONOMY_GOAL} from './settings.js';

// Cases atteignables par le soldat `startId`.
// Règles : MAX_MOVE pas max, dont AU PLUS 1 case hors du territoire (conquête,
// terminale). On traverse son propre territoire et les autres soldats, mais
// jamais une maison / tour / base. On collecte aussi les fusions possibles
// (soldat allié non plein) et les structures alliées bloquantes (indicateur).
export function computeReachable(state, board, startId) {
    const moves = new Map(); // id -> { kind: 'move' | 'conquer' | 'merge' }
    const allies = []; // bâtiments / bases alliés bloquants
    const dist = new Map(); // id -> nombre de pas depuis `startId` (BFS)
    // Cases où le mover peut RÉELLEMENT s'arrêter (départ + cases libres). Un
    // relais traversé par le ninja entre dans `dist` mais PAS dans `standable` :
    // on ne peut ni s'y arrêter, ni attaquer/abattre depuis lui.
    const standable = new Set();
    if (!startId) return {moves, allies, dist, standable};
    const {cellMap, baseIds} = board;
    const start = cellMap.get(startId);
    if (!start) return {moves, allies, dist, standable};
    const {placements, ownership, activePlayerId} = state;
    const mover = placements.get(startId); // soldat qui se déplace (pour la fusion)
    // Bonus « Ninja » : portée de déplacement doublée à l'intérieur du
    // territoire (la conquête reste limitée à 1 case hors territoire).
    const maxMove = mover?.bonus === 'ninja' ? MAX_MOVE * NINJA_MOVE_MULT : MAX_MOVE;
    // Bonus « Ninja » (second volet) : déplacement « fantôme » — traverse TOUT (soldats
    // alliés/ennemis, structures, bases, arbres). Les cases occupées deviennent
    // des relais de passage (on ne s'arrête que sur une case libre). En revanche
    // il ne peut PAS attaquer/abattre à travers un obstacle : une cible n'est
    // validée que depuis une case « stable » (voir `standable`), jamais depuis un
    // relais traversé.
    const ghost = mover?.bonus === 'ninja';

    dist.set(startId, 0);
    standable.add(startId);
    const queue = [startId];
    const seenAlly = new Set();
    while (queue.length) {
        const curId = queue.shift();
        const d = dist.get(curId);
        if (d >= maxMove) continue; // plus de pas disponibles
        const cur = cellMap.get(curId);
        for (const nb of getNeighbors(cur.q, cur.r)) {
            const nid = hexId(nb.q, nb.r);
            const ncell = cellMap.get(nid);
            if (!ncell || ncell.blocked) continue; // hors carte ou eau
            const placed = placements.get(nid);
            // Le ninja de test traverse toute case occupée : on l'enfile pour
            // poursuivre le chemin au-delà (elle reste une action terminale, on
            // ne peut jamais s'y arrêter — seules les cases libres le permettent).
            const ghostAdvance = () => {
                if (ghost && !dist.has(nid)) {
                    dist.set(nid, d + 1);
                    queue.push(nid);
                }
            };
            // Arbre : infranchissable, mais abattable par un soldat adjacent.
            // Abattage = action de contact, uniquement depuis une case stable (le
            // ninja ne peut pas abattre un arbre à travers un obstacle).
            // Un arbre élémentaire n'est pas abattable par un soldat de même
            // affinité : la case reste alors un simple obstacle.
            if (placed && placed.type === 'tree') {
                if (standable.has(curId) && !moves.has(nid) && canChopTree(mover, placed)) {
                    moves.set(nid, {kind: 'chop'});
                }
                ghostAdvance();
                continue;
            }
            // Coffre : infranchissable comme un arbre, mais OUVRABLE par un
            // soldat adjacent. Action de contact, donc uniquement depuis une
            // case stable (le ninja n'ouvre pas à travers un obstacle). Le
            // soldat ne prend pas la case : le coffre y laisse son butin.
            if (placed && placed.type === 'chest') {
                if (standable.has(curId) && !moves.has(nid)) {
                    moves.set(nid, {kind: 'openChest'});
                }
                ghostAdvance();
                continue;
            }
            // Butin laissé par un coffre ouvert : on le ramasse en se DÉPLAÇANT
            // dessus. Case terminale (on s'y arrête, sans la traverser), quel
            // que soit son propriétaire — le butin n'appartient à personne.
            if (placed && placed.type === 'loot') {
                if (standable.has(curId) && !moves.has(nid)) {
                    moves.set(nid, {kind: 'loot'});
                }
                ghostAdvance();
                continue;
            }
            // Base encore debout (une base détruite redevient une case normale).
            const isBase = baseIds.has(nid) && !state.destroyedBases?.has(nid);
            const isBuilding = placed && placed.type !== 'soldier';
            if (isBase || isBuilding) {
                // Structure infranchissable : indicateur si elle est alliée,
                // cible de combat si c'est une structure ennemie attaquable
                // (maison, tour ou base — toutes assiégeables).
                const owner = isBase ? ownership.get(nid) : placed.playerId;
                if (owner === activePlayerId) {
                    if (!seenAlly.has(nid)) {
                        seenAlly.add(nid);
                        allies.push(nid);
                    }
                } else if ((isBase || isAttackable(placed)) && standable.has(curId) && !moves.has(nid)) {
                    // Siège d'une structure/base ennemie : seulement depuis une
                    // case stable (pas d'attaque à travers un obstacle).
                    moves.set(nid, {kind: 'combat'});
                }
                ghostAdvance();
                continue;
            }
            const isSoldier = placed && placed.type === 'soldier';
            // Soldat ennemi : cible de combat (terminale, infranchissable — sauf
            // pour le ninja qui la traverse tout en pouvant l'attaquer).
            if (isSoldier && placed.playerId !== activePlayerId) {
                // Cible de combat : validée seulement depuis une case stable (pas
                // d'attaque à travers un obstacle) et si les affinités ne
                // s'annulent pas (voir `canFight`) ; le ninja peut néanmoins la
                // traverser pour se repositionner au-delà. Un ennemi de même
                // affinité reste donc un simple obstacle, ni attaquable ni
                // franchissable.
                if (standable.has(curId) && !moves.has(nid) && canFight(mover, placed)) {
                    moves.set(nid, {kind: 'combat'});
                }
                ghostAdvance();
                continue;
            }
            const owned = ownership.get(nid) === activePlayerId;
            if (owned) {
                if (isSoldier) {
                    // Soldat allié : OBSTACLE terminal — on ne traverse plus les
                    // soldats (déplacement le long d'un trajet de cases libres).
                    // Fusion possible sur un allié de MÊME niveau, sinon simple
                    // indicateur de blocage. Le ninja, lui, le traverse.
                    if (canMerge(mover, placed) && !moves.has(nid)) {
                        moves.set(nid, {kind: 'merge'});
                    } else if (!canMerge(mover, placed) && !seenAlly.has(nid)) {
                        seenAlly.add(nid);
                        allies.push(nid);
                    }
                    ghostAdvance();
                } else {
                    // Case LIBRE de notre territoire : on la traverse et on peut
                    // s'y arrêter (repositionnement) — donc « stable ».
                    if (!dist.has(nid)) {
                        dist.set(nid, d + 1);
                        queue.push(nid);
                    }
                    standable.add(nid);
                    if (!moves.has(nid)) moves.set(nid, {kind: 'move'});
                }
            } else if (!isSoldier) {
                // Case hors territoire : conquête (1 seule, terminale).
                if (!moves.has(nid)) moves.set(nid, {kind: 'conquer'});
            }
        }
    }
    moves.delete(startId);
    return {moves, allies, dist, standable};
}

// Nombre de cases possédées par un joueur.
export function ownedCount(state, playerId) {
    let n = 0;
    for (const owner of state.ownership.values()) if (owner === playerId) n += 1;
    return n;
}

// Nombre de soldats d'un joueur n'ayant pas encore joué ce tour (absents de
// `movedSoldiers`) : combien il lui reste à déplacer/agir avant la fin du tour.
// Un soldat doté d'un COMPORTEMENT n'est pas compté : il jouera tout seul à la
// fin du tour, le joueur n'a rien à faire pour lui.
export function movableSoldierCount(state, playerId) {
    let n = 0;
    for (const placed of state.placements.values()) {
        if (
            placed.type === 'soldier' &&
            placed.playerId === playerId &&
            !placed.behavior &&
            !state.movedSoldiers.has(placed.uid)
        ) {
            n += 1;
        }
    }
    return n;
}

// Entretien total (or/tour) des unités d'un joueur. Somme du barème d'entretien
// (`upkeepFor`) sur toutes ses unités posées ; les maisons, d'entretien négatif,
// diminuent ce total (elles rapportent).
export function upkeepTotal(state, playerId) {
    let sum = 0;
    for (const placed of state.placements.values()) {
        if (placed.playerId === playerId) sum += upkeepFor(placed, state.settings);
    }
    return sum;
}

// Entretien des arbres : chaque arbre posé sur une case possédée par le joueur
// prélève `treeUpkeep` or par tour (0 par défaut = neutre). Les arbres neutres
// (hors territoire) ne coûtent rien.
export function treeUpkeepTotal(state, playerId) {
    const per = state.settings?.treeUpkeep ?? 0;
    if (!per) return 0;
    let n = 0;
    for (const [id, placed] of state.placements) {
        if (placed.type === 'tree' && state.ownership.get(id) === playerId) n += 1;
    }
    return per * n;
}

// Bonus « Roi » : tant qu'un soldat du joueur porte ce bonus (et est en vie), ce
// qu'il POSSÈDE rapporte `KING_INCOME_MULT` fois plus — ses maisons ET son
// territoire (1 or par case). Renvoie le SURPLUS d'or ainsi gagné (0 sans roi) —
// le revenu de base et les entretiens ne sont pas touchés. Lu par `incomeFor`,
// donc par l'interface ET par la fin de tour : un seul et même revenu partout.
export function kingIncomeBonus(state, playerId) {
    let hasKing = false;
    let houses = 0;
    for (const placed of state.placements.values()) {
        if (placed.playerId !== playerId) continue;
        if (placed.type === 'house') houses += 1;
        else if (placed.type === 'soldier' && placed.bonus === 'king') hasKing = true;
    }
    if (!hasKing) return 0;
    const extra = KING_INCOME_MULT - 1;
    const perHouse = -upkeepFor({type: 'house'}, state.settings); // entretien négatif = rendement
    const fromHouses = Math.max(0, Math.floor(perHouse * extra) * houses);
    // Territoire : le barème est de 1 or par case (voir `incomeFor`), donc le
    // surplus vaut directement le nombre de cases possédées.
    const fromCases = ownedCount(state, playerId) * extra;
    return fromHouses + fromCases;
}

// Revenu d'un joueur pour un tour : base + 1 or par case possédée, moins
// l'entretien de ses unités et de ses arbres (jamais négatif). Les maisons ayant
// un entretien négatif, elles augmentent au contraire ce revenu — maisons et
// territoire étant doublés par le bonus « Roi ». Le revenu de base est
// configurable (retombe sur `BASE_INCOME`).
export function incomeFor(state, playerId) {
    const base = state.settings?.baseIncome ?? BASE_INCOME;
    const gross = base + ownedCount(state, playerId) + kingIncomeBonus(state, playerId);
    return Math.max(0, gross - upkeepTotal(state, playerId) - treeUpkeepTotal(state, playerId));
}

// Un joueur est « en vie » tant qu'il possède au moins une case OU un soldat sur
// le plateau. Sert à la condition de victoire par élimination.
export function playerAlive(state, playerId) {
    if (ownedCount(state, playerId) > 0) return true;
    for (const placed of state.placements.values()) {
        if (placed.type === 'soldier' && placed.playerId === playerId) return true;
    }
    return false;
}

// Évalue les conditions de victoire et renvoie l'état, marqué 'over' si l'une
// est remplie. PURE. Appelée après chaque action mutante. Priorités :
//   1. élimination : s'il ne reste qu'un joueur en vie, il gagne (tous modes) ;
//   2. mode choisi : domination (part du territoire) ou économie (or atteint) ;
//   3. limite de tours : au-delà, le meneur (territoire, ou or en mode économie)
//      l'emporte.
export function checkVictory(state) {
    const s = state.settings;
    if (!s || state.status === 'over') return state;
    const {players} = state;
    const finish = (winnerId, reason) => ({...state, status: 'over', winnerId, endReason: reason});

    const alive = players.filter((p) => playerAlive(state, p.id));
    if (alive.length <= 1) return finish(alive[0]?.id ?? null, 'elimination');

    if (s.victoryMode === 'domination') {
        const board = getLogicalBoard(state.mapId);
        const total = board.cells.filter((c) => !c.blocked).length || 1;
        const threshold = (s.dominationPercent ?? DOMINATION_PERCENT) / 100;
        for (const p of players) {
            if (ownedCount(state, p.id) / total >= threshold) return finish(p.id, 'domination');
        }
    } else if (s.victoryMode === 'economy') {
        const goal = s.economyGoal ?? ECONOMY_GOAL;
        for (const p of players) {
            if ((state.gold[p.id] || 0) >= goal) return finish(p.id, 'economy');
        }
    }

    // Limite de tours atteinte : on tranche au meneur selon le mode.
    if (s.maxTurns > 0 && state.turn > s.maxTurns) {
        const scoreOf = (p) =>
            s.victoryMode === 'economy' ? state.gold[p.id] || 0 : ownedCount(state, p.id);
        let best = null;
        let bestScore = -Infinity;
        for (const p of players) {
            const sc = scoreOf(p);
            if (sc > bestScore) {
                bestScore = sc;
                best = p;
            }
        }
        return finish(best?.id ?? null, 'timeout');
    }
    return state;
}
