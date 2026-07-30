// Bonus « Druide » (niveau 4, gratuit, entretien nul) — il ne récolte plus, il
// RECRUTE.
//
// Ce qu'il change, exactement : quand un druide abat un arbre, l'arbre ne
// rapporte pas d'or, il devient une unité alliée « arbre-druide »
// (`data/units.js`) de **6 attaque / 2 PV**, qui hérite de l'élément de l'arbre.
// Le druide, lui, est gratuit à l'achat et son entretien (−16) annule celui du
// niveau 4.
//
// La facture est donc entièrement REPORTÉE sur l'armée produite : **16 or par
// tour et par arbre-druide**, à vie. C'est le chiffre qui commande tout ce
// module — trois arbres transformés sans y penser, c'est 48 or/tour, soit le
// revenu entier du bot sur la petite carte de test.
//
// Deux décisions, donc, et un garde-fou :
//   1. QUI équiper (`equipDruids`) — un niveau 4 vaut 200 or de fusions et
//      équiper le bonus le RAMÈNE À 2/6 (`reduceBuyBonus` remplace ses stats) :
//      on ne sacrifie ce combattant que s'il y a vraiment des arbres à
//      transformer et de quoi payer ce qu'ils deviendront.
//   2. QUEL arbre transformer (`druidTreeTarget`) — un arbre-druide est une
//      SENTINELLE, pas un travailleur : 2 PV le font mourir au premier coup,
//      mais ses 6 d'attaque font très mal à qui l'attaque (le combat est
//      simultané, voir `combatResult`). Sa valeur est donc entièrement dans sa
//      position : au contact du front, jamais au fond du territoire.
//   3. LE GARDE-FOU — sans lui, le druide transformerait tout arbre à sa portée
//      via `bestConquestAction` (une transformation est un `chop` ordinaire aux
//      yeux du reste du bot) et étranglerait son propre revenu. C'est
//      `druidForbiddenCells` qui l'en empêche, en réservant les arbres que le
//      budget du tour ne permet pas.

import {getLogicalBoard} from '../../board.js';
import {hexDistance, getNeighbors, hexId} from '../../../data/hex.js';
import {BONUS_OFFERS, isBonusUnlocked} from '../../../data/soldier.js';
import {unitKindById} from '../../../data/units.js';
import {treeAffinity} from '../../../data/trees.js';
import {incomeFor} from '../../selectors.js';
import {reachableFor, cellQR, probeMoved} from '../helpers.js';
import {preciousCellUnsafe, inEnemyRange} from '../threat.js';
import {distToNearestEnemy, stepCells} from '../movement.js';
import {harvestApproachCell} from '../conquest.js';
import {buyBonus} from '../../actions.js';

// Entretien réel d'un arbre-druide, lu au catalogue (jamais recopié ici).
const DRUID_TREE_UPKEEP = unitKindById('druidTree').upkeep;

// Revenu (or/tour) que le bot refuse de descendre en dessous en transformant :
// il doit continuer à acheter des soldats et des maisons pendant que son armée
// d'arbres tourne. Un arbre-druide de plus n'est autorisé que si le revenu
// RESTANT après sa facture couvre encore ce plancher.
const DRUID_INCOME_FLOOR = 25;
// Plafond dur, indépendant de la richesse : au-delà, le druide immobilise trop
// de cases en unités qui ne bougent pratiquement jamais de leur poste.
const MAX_DRUID_TREES = 4;
// Distance à l'ennemi le plus proche au-delà de laquelle un arbre-druide ne
// garde rien : 16 or/tour pour une sentinelle que personne ne croisera. Un
// arbre de FRONTIÈRE (bordant une case qui n'est pas à nous) fait exception —
// c'est par là que l'ennemi arrivera, même s'il est encore loin, et c'est la
// seule position qu'un druide fragile peut atteindre sans se faire tuer.
const SENTINEL_MAX_DIST = 6;
// Arbres transformables (au sens ci-dessus) minimum pour justifier de sacrifier
// un niveau 4 : en dessous, il sert mieux comme combattant.
const MIN_TREES_FOR_DRUID = 2;

const isDruidTree = (u) => u?.unit === 'druidTree';

function druidTreeCount(state, playerId) {
    let n = 0;
    for (const u of state.placements.values()) {
        if (u.playerId === playerId && isDruidTree(u)) n += 1;
    }
    return n;
}

function druidCount(state, playerId) {
    let n = 0;
    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'druid') n += 1;
    }
    return n;
}

// Combien d'arbres-druides DE PLUS le revenu du joueur supporte, plafond dur
// compris. 0 = on ne transforme rien ce tour.
function affordableDruidTrees(state, playerId) {
    const income = incomeFor(state, playerId);
    const budget = Math.floor((income - DRUID_INCOME_FLOOR) / DRUID_TREE_UPKEEP);
    const room = MAX_DRUID_TREES - druidTreeCount(state, playerId);
    return Math.max(0, Math.min(budget, room));
}

// Une case borde-t-elle du terrain qui n'est pas à nous (neutre ou ennemi) ?
// C'est la définition de frontière du bot (même notion que pour le Fermier).
function isFrontierCell(state, board, playerId, cellId) {
    const cell = board.cellMap.get(cellId);
    if (!cell) return false;
    return getNeighbors(cell.q, cell.r).some((n) => {
        const nc = board.cellMap.get(hexId(n.q, n.r));
        return nc && !nc.blocked && state.ownership.get(nc.id) !== playerId;
    });
}

// Un arbre mérite-t-il d'être transformé — c.-à-d. l'arbre-druide qui en
// naîtra gardera-t-il quelque chose ? Il faut qu'il soit sur le CHEMIN de
// l'ennemi : soit déjà près de lui, soit sur notre frontière (par où il
// viendra). Au fond du territoire, une sentinelle ne fait que coûter.
function worthTransforming(state, treeId, playerId) {
    if (distToNearestEnemy(state, treeId, playerId) <= SENTINEL_MAX_DIST) return true;
    return isFrontierCell(state, getLogicalBoard(state.mapId), playerId, treeId);
}

// Arbres que ce druide peut transformer CE TOUR (portée réelle du moteur), en
// atterrissant sur une case sûre — un druide à 6 PV ne survit pas à un tour
// ennemi au contact. Triés du meilleur au moins bon : au plus près de
// l'ennemi d'abord (la sentinelle sert là), puis les arbres élémentaires (leur
// unité naît avec l'élément, donc immunisée contre le même élément adverse),
// puis par case pour le déterminisme.
function transformableTrees(state, playerId, fromId) {
    const board = getLogicalBoard(state.mapId);
    const reach = reachableFor(state, playerId, fromId);
    const out = [];
    for (const [toId, info] of reach.moves) {
        if (info.kind !== 'chop') continue;
        if (!worthTransforming(state, toId, playerId)) continue;
        const landing = harvestApproachCell(board, reach, fromId, toId);
        if (landing !== fromId && preciousCellUnsafe(state, landing, playerId)) continue;
        out.push({
            toId,
            dist: distToNearestEnemy(state, toId, playerId),
            elemental: !!treeAffinity(state.placements.get(toId)),
        });
    }
    out.sort(
        (a, b) =>
            a.dist - b.dist ||
            Number(b.elemental) - Number(a.elemental) ||
            (a.toId < b.toId ? -1 : 1)
    );
    return out;
}

// Le soldat de `cellId` peut-il, ce tour, gagner une case VRAIMENT sûre (au
// critère des unités précieuses) ? C'est la condition d'équipement du druide :
// il tombe à 2/6, il doit pouvoir sortir du front tout de suite.
function hasSafeRetreat(state, cellId, playerId) {
    const S = state.placements.get(cellId);
    if (!S) return false;
    if (!preciousCellUnsafe(state, cellId, playerId)) return true; // déjà à l'abri
    for (const {toId} of stepCells(state, S, cellId)) {
        if (!preciousCellUnsafe(probeMoved(state, cellId, toId), toId, playerId)) return true;
    }
    return false;
}

// Arbre que le druide de `fromId` doit transformer ce tour, ou `null` si le
// budget ne le permet pas / si aucun arbre ne garderait quoi que ce soit.
export function druidTreeTarget(state, fromId) {
    const S = state.placements.get(fromId);
    if (!S || S.bonus !== 'druid') return null;
    if (affordableDruidTrees(state, S.playerId) <= 0) return null;
    return transformableTrees(state, S.playerId, fromId)[0]?.toId ?? null;
}

// Cases d'arbres INTERDITES au druide ce tour — le garde-fou. Passées en
// `taken` à `bestConquestAction`, elles l'empêchent de transformer par simple
// opportunisme un arbre que le budget refuse ou qui ne garderait rien : il ira
// conquérir ou se replacer à la place. Sans cela, le bonus le plus cher du jeu
// se déclencherait tout seul.
export function druidForbiddenCells(state, fromId) {
    const forbidden = new Set();
    const S = state.placements.get(fromId);
    if (!S || S.bonus !== 'druid') return forbidden;
    for (const [id, u] of state.placements) {
        if (u.type === 'tree') forbidden.add(id);
    }
    return forbidden;
}

// Case sûre vers laquelle AVANCER quand aucun arbre n'est transformable depuis
// ici : celle qui rapproche le plus du meilleur arbre à transformer de la
// carte. Sans ce pas dirigé, le druide ne rencontre jamais ses arbres — la
// conquête ordinaire l'emmène ailleurs, et il finit la partie sans avoir rien
// recruté (mesuré : deux tiers de ses tours sans un seul arbre à portée).
export function druidApproachCell(state, fromId, cells) {
    const S = state.placements.get(fromId);
    if (!S || S.bonus !== 'druid') return null;
    const playerId = S.playerId;
    if (affordableDruidTrees(state, playerId) <= 0) return null;

    const targets = [];
    for (const [id, u] of state.placements) {
        if (u.type === 'tree' && worthTransforming(state, id, playerId)) targets.push(cellQR(id));
    }
    if (!targets.length) return null;
    const distTo = (id) => {
        const c = cellQR(id);
        let d = Infinity;
        for (const t of targets) d = Math.min(d, hexDistance(c, t));
        return d;
    };

    let best = null;
    let bestDist = distTo(fromId);
    for (const {toId} of cells) {
        const d = distTo(toId);
        if (d < bestDist || (d === bestDist && best && toId < best)) {
            bestDist = d;
            best = toId;
        }
    }
    return best;
}

// Équipe le Druide : UN seul, sur un niveau 4 sans bonus posé sur une case sûre
// (il tombe à 2/6 en s'équipant), et seulement si son défi est rempli (4 arbres
// sur le territoire), qu'il a de quoi payer au moins un arbre-druide, et qu'il
// reste assez d'arbres bien placés pour que la conversion vaille le combattant
// qu'on y perd.
export function equipDruids(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.druid === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'druid');
    if (!bonus) return state;
    if (druidCount(state, playerId) >= 1) return state;
    if (affordableDruidTrees(state, playerId) <= 0) return state;

    // Arbres bien placés sur toute la carte : le druide ira les chercher au fil
    // des tours, la portée immédiate n'est pas le bon critère ici.
    let worthy = 0;
    for (const [id, u] of state.placements) {
        if (u.type === 'tree' && worthTransforming(state, id, playerId)) worthy += 1;
    }
    if (worthy < MIN_TREES_FOR_DRUID) return state;

    const candidates = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || u.unit) continue;
        if ((u.level || 1) !== bonus.requiredLevel) continue;
        if (!isBonusUnlocked(u, bonus, state.settings, state)) continue;
        // Sûreté : ni le critère paranoïaque des unités précieuses, ni la
        // simple portée ennemie — les deux ont été mesurés et ratent, chacun à
        // sa façon. `preciousCellUnsafe` sur la case du niveau 4 refuse 90 %
        // des occasions (un niveau 4 est un combattant : il se tient au front,
        // où presque aucune case ne passe ce critère) ; `inEnemyRange` seul
        // laisse équiper des druides qui meurent aussitôt (mortalité multipliée
        // par neuf).
        //
        // La bonne condition est celle-ci : personne ne peut le frapper ce
        // tour, ET il lui reste une RETRAITE — au moins une case atteignable
        // vraiment sûre, où le repli qui suit `equipDruids` dans `runBotTurn`
        // pourra le poser. Un niveau 4 acculé reste donc un combattant.
        if (inEnemyRange(state, id, playerId)) continue;
        if (!hasSafeRetreat(state, id, playerId)) continue;
        candidates.push(id);
    }
    // Le plus proche des arbres à transformer : il commencera à produire tôt.
    const trees = [];
    for (const [id, u] of state.placements) {
        if (u.type === 'tree' && worthTransforming(state, id, playerId)) trees.push(cellQR(id));
    }
    const distToTrees = (id) => {
        const c = cellQR(id);
        let d = Infinity;
        for (const t of trees) d = Math.min(d, hexDistance(c, t));
        return d;
    };
    candidates.sort((a, b) => distToTrees(a) - distToTrees(b) || (a < b ? -1 : 1));

    for (const id of candidates) {
        const next = apply(buyBonus(id, 'druid'));
        if (!next) continue;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${id} équipé Druide (${worthy} arbre(s) à transformer en vue)`);
        return next;
    }
    return state;
}
