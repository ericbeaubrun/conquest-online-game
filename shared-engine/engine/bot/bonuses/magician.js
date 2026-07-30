// Bonus « Magicien » (niveau 3, entretien nul) — le seul bonus qui DIFFUSE une
// affinité.
//
// Ce qu'il rapporte réellement, chaque fin de tour et pour chaque magicien :
//   - 10 or (`MAGICIAN_GOLD_REWARD`) ;
//   - SURTOUT une affinité offerte à un allié adjacent qui n'en a pas — une
//     affinité vaut 75 or en boutique et rend son porteur INCAPABLE d'être
//     combattu par la même affinité (`canFight`). C'est donc l'effet principal,
//     l'or n'est que la prime.
// Son entretien (−8) annule celui du niveau 3 : une fois posé, il ne coûte rien.
//
// D'où les deux décisions que prend ce module, et rien d'autre :
//   1. QUI équiper (`equipMagicians`) — un magicien ne vaut que par ses voisins
//      SANS affinité : on l'installe là où il en a le plus, et jamais en zone
//      exposée. Équiper le bonus REMPLACE les statistiques du niveau 3 par
//      celles du magicien (1 attaque / 4 PV, voir `reduceBuyBonus`) : le gros
//      soldat devient une lame de verre à l'instant de l'achat. La sûreté de sa
//      case se juge donc au critère PRUDENT des unités précieuses
//      (`preciousCellUnsafe` : portée ennemie ET achat-frappe possible), jamais
//      au simple `inEnemyRange` — c'est ce qui les faisait mourir en masse.
//   2. OÙ le tenir (`magicianMove`, appelé par `precious.js`) — un magicien
//      isolé ne donne rien du tout : tant qu'il est en sécurité, il va se coller
//      au plus gros paquet d'alliés sans affinité.
//
// L'affinité choisie à l'achat n'est pas neutre : on prend celle que portent le
// PLUS d'ennemis, puisque deux unités de même affinité refusent le combat —
// chaque don rend donc un allié inattaquable par cette part de l'armée adverse.

import {getNeighbors, hexId} from '../../../data/hex.js';
import {getLogicalBoard} from '../../board.js';
import {AFFINITY_IDS} from '../../rules.js';
import {ITEM_COST} from '../../../data/items.js';
import {
    BONUS_OFFERS,
    bonusPriceOf,
    isBonusUnlocked,
    soldierCostForLevel,
} from '../../../data/soldier.js';
import {placeItem, buyBonus} from '../../actions.js';
import {preciousCellUnsafe} from '../threat.js';

// Un magicien ne peut donner qu'UNE affinité par tour : au-delà de deux, ils se
// disputent le même vivier de voisins sans affinité pour un investissement
// (niveau 3 + affinité + bonus) qui, lui, ne baisse pas.
const MAX_MAGICIANS = 2;
// Voisins sans affinité minimum pour justifier l'installation d'un magicien
// (en dessous, il ne donnera rien dès le tour suivant).
const MIN_FEEDABLE = 1;
// Alliés sans affinité minimum sur toute la carte pour justifier l'achat d'un
// niveau 3 NEUF, la voie la plus chère (100 + 75 + 40 = 215 or) : sans un vrai
// vivier à alimenter, cet or vaut mieux en soldats.
const MIN_TARGETS_FOR_FRESH = 3;
// Or gardé en réserve après un achat depuis zéro : le magicien ne doit pas
// assécher l'expansion du tour.
const FRESH_GOLD_RESERVE = 50;

// Un soldat à nous peut-il RECEVOIR une affinité (c'est la seule chose qui
// intéresse un magicien chez son voisin) ?
const feedable = (u, playerId) =>
    !!u && u.type === 'soldier' && u.playerId === playerId && u.affinity == null;

// Nombre d'alliés sans affinité adjacents à une case (le magicien lui-même,
// posé sur cette case, ne se compte pas : il ne se donne rien).
export function feedableNeighbors(state, board, playerId, cellId) {
    const cell = board.cellMap.get(cellId);
    if (!cell) return 0;
    let n = 0;
    for (const nb of getNeighbors(cell.q, cell.r)) {
        const nid = hexId(nb.q, nb.r);
        if (nid === cellId) continue;
        if (feedable(state.placements.get(nid), playerId)) n += 1;
    }
    return n;
}

// Tous nos soldats sans affinité, magicien exclu — le vivier que la diffusion
// peut encore alimenter.
function feedableCount(state, playerId) {
    let n = 0;
    for (const u of state.placements.values()) {
        if (feedable(u, playerId) && u.bonus !== 'magician') n += 1;
    }
    return n;
}

function magicianCount(state, playerId) {
    let n = 0;
    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'magician') n += 1;
    }
    return n;
}

// Affinité à acheter : celle que portent le plus d'ennemis (chaque don la rend
// alors inoffensive pour un allié de plus), à défaut la première du catalogue.
// Départage déterministe par l'ordre d'`AFFINITY_IDS`.
function bestAffinityToBuy(state, playerId) {
    const tally = new Map(AFFINITY_IDS.map((id) => [id, 0]));
    for (const u of state.placements.values()) {
        if (u.type !== 'soldier' || u.playerId === playerId) continue;
        if (tally.has(u.affinity)) tally.set(u.affinity, tally.get(u.affinity) + 1);
    }
    let best = AFFINITY_IDS[0];
    for (const id of AFFINITY_IDS) {
        if (tally.get(id) > tally.get(best)) best = id;
    }
    return best;
}

const affinityCost = (affinity, settings) =>
    settings?.itemCost?.[affinity] ?? ITEM_COST[affinity] ?? 0;

// Équipe le Magicien. Trois voies, de la moins chère à la plus chère — on
// s'arrête à la première qui aboutit :
//   1. un niveau 3 à nous, sans bonus, PORTANT DÉJÀ une affinité (arbre
//      élémentaire récolté, coffre, fusion) : le bonus seul, 40 or ;
//   2. un niveau 3 à nous, sans bonus ni affinité : on lui achète l'affinité
//      (115 or au total) ;
//   3. un niveau 3 NEUF acheté et posé au milieu des alliés sans affinité
//      (215 or) — réservé à un vrai vivier et à une bourse confortable.
// Dans tous les cas la case doit être sûre au sens de `preciousCellUnsafe` (le
// magicien tombe à 4 PV en s'équipant) : un magicien perdu, c'est
// l'investissement entier perdu.
export function equipMagicians(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.magician === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'magician');
    if (!bonus) return state;

    let cur = state;
    const board = getLogicalBoard(cur.mapId);
    const price = bonusPriceOf(bonus, cur.settings);

    for (let guard = 0; guard < MAX_MAGICIANS; guard += 1) {
        if (magicianCount(cur, playerId) >= MAX_MAGICIANS) break;
        if (feedableCount(cur, playerId) < MIN_FEEDABLE) break;
        const gold = cur.gold?.[playerId] || 0;
        if (gold < price) break;

        // Candidats en jeu : niveau 3, sans bonus, en sécurité, avec au moins un
        // voisin à alimenter. Triés par voisins alimentables décroissants (puis
        // par case, pour le déterminisme) ; à égalité, ceux qui ont déjà une
        // affinité passent devant — ils ne coûtent que le bonus.
        const candidates = [];
        for (const [id, u] of cur.placements) {
            if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus) continue;
            if ((u.level || 1) !== 3) continue;
            // Défi non rempli ALORS QU'il a déjà l'affinité : c'est autre chose
            // qui bloque (règle de partie) — inutile d'insister. Sans affinité,
            // c'est précisément ce qu'on va lui acheter.
            if (u.affinity && !isBonusUnlocked(u, bonus, cur.settings, cur)) continue;
            if (preciousCellUnsafe(cur, id, playerId)) continue;
            const feed = feedableNeighbors(cur, board, playerId, id);
            if (feed < MIN_FEEDABLE) continue;
            candidates.push({id, hasAffinity: !!u.affinity, feed});
        }
        candidates.sort(
            (a, b) =>
                Number(b.hasAffinity) - Number(a.hasAffinity) ||
                b.feed - a.feed ||
                (a.id < b.id ? -1 : 1)
        );

        let acted = false;
        for (const c of candidates) {
            let next = cur;
            if (!c.hasAffinity) {
                // Le défi du magicien EST l'affinité : on la lui achète d'abord.
                const affinity = bestAffinityToBuy(cur, playerId);
                if (gold < price + affinityCost(affinity, cur.settings)) continue;
                const given = apply(placeItem(c.id, affinity));
                if (!given) continue;
                next = given;
            }
            const equipped = apply(buyBonus(c.id, 'magician'));
            if (!equipped) {
                cur = next; // l'affinité reste acquise, elle n'est pas perdue
                continue;
            }
            cur = equipped;
            acted = true;
            /* eslint-disable-next-line no-console */
            console.log(
                `[bot]   soldat ${c.id} équipé Magicien (${c.feed} allié(s) sans affinité au contact)`
            );
            break;
        }
        if (acted) continue;

        // Aucun niveau 3 disponible : en acheter un, si le vivier et la bourse
        // le justifient vraiment.
        const bought = buyFreshMagician(cur, playerId, board, bonus, price, apply);
        if (bought === cur) break;
        cur = bought;
    }
    return cur;
}

// Voie 3 : acheter un niveau 3 neuf, lui acheter une affinité, l'équiper — sur
// la case sûre à nous qui touche le plus d'alliés sans affinité.
function buyFreshMagician(state, playerId, board, bonus, price, apply) {
    if (feedableCount(state, playerId) < MIN_TARGETS_FOR_FRESH) return state;
    const affinity = bestAffinityToBuy(state, playerId);
    const total =
        soldierCostForLevel(3, state.settings) + affinityCost(affinity, state.settings) + price;
    if ((state.gold?.[playerId] || 0) < total + FRESH_GOLD_RESERVE) return state;

    let bestCell = null;
    let bestFeed = MIN_FEEDABLE - 1;
    for (const cell of board.cells) {
        if (cell.blocked || board.baseIds.has(cell.id)) continue;
        if (state.ownership.get(cell.id) !== playerId) continue;
        if (state.placements.has(cell.id)) continue;
        if (preciousCellUnsafe(state, cell.id, playerId)) continue;
        const feed = feedableNeighbors(state, board, playerId, cell.id);
        if (feed > bestFeed || (feed === bestFeed && bestCell && cell.id < bestCell)) {
            bestFeed = feed;
            bestCell = cell.id;
        }
    }
    if (!bestCell) return state;

    let cur = apply(placeItem(bestCell, 'soldier', 3));
    if (!cur) return state;
    const given = apply(placeItem(bestCell, affinity));
    if (!given) return cur; // le niveau 3 reste, simplement sans bonus
    cur = given;
    const equipped = apply(buyBonus(bestCell, 'magician'));
    if (!equipped) return cur;
    /* eslint-disable-next-line no-console */
    console.log(
        `[bot]   soldat ${bestCell} acheté niveau 3 (${affinity}) et équipé Magicien (${bestFeed} allié(s) à alimenter)`
    );
    return equipped;
}

// Case où TENIR un magicien déjà équipé, appelée par `precious.js` quand il
// n'est pas menacé : un magicien ne donne rien s'il n'a personne à toucher, on
// le recolle donc au plus gros paquet d'alliés sans affinité. `null` quand rien
// ne vaut mieux que sa case actuelle — l'appelant le fait alors jouer
// normalement (conquête / récolte : récolter un arbre élémentaire peut même lui
// donner l'affinité qui lui manque).
export function magicianMove(state, fromId, cells) {
    const S = state.placements.get(fromId);
    if (!S || S.bonus !== 'magician') return null;
    const board = getLogicalBoard(state.mapId);
    const playerId = S.playerId;

    let best = null;
    let bestFeed = feedableNeighbors(state, board, playerId, fromId);
    for (const {toId} of cells) {
        const feed = feedableNeighbors(state, board, playerId, toId);
        if (feed > bestFeed || (feed === bestFeed && best && toId < best)) {
            bestFeed = feed;
            best = toId;
        }
    }
    return best;
}
