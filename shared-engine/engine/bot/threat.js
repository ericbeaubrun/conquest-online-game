// Analyse de la « zone » d'un soldat : menace ennemie, renforts possibles,
// échanges. Socle du mode CONFLIT (`conflict.js`) et des garde-fous anti-piège
// de l'offensive (`offense.js`).

import {getLogicalBoard} from '../board.js';
import {MERGE_MAX, MAX_MOVE, canMerge, mergedSoldier, combatResult, canFight} from '../rules.js';
import {hexDistance} from '../../data/hex.js';
import {soldierCostForLevel} from '../../data/soldier.js';
import {
    reachableFor,
    soldierValue,
    stronger,
    freshSoldier,
    freeOwnedNeighbor,
    isProtectedUnit,
} from './helpers.js';

// Meilleur renfort suivant pour amener `cur` (posé sur `anchorCell`) un cran plus
// fort : FUSION gratuite avec un allié capable de le rejoindre (prioritaire),
// sinon ACHAT + FUSION d'un soldat neuf de même niveau posé à côté (coûte de
// l'or). `used` exclut les cases d'alliés déjà consommées par la chaîne en cours.
// Renvoie `{unit, step}` (`step` exécutable) ou `null` si aucun renfort n'est
// possible ou rentable. Partagée entre la menace ennemie (`strongestReachableAttacker`)
// et notre propre offensive (`bestOffense`) : même mécanique, point de vue différent.
export function nextReinforcement(state, owner, cur, anchorCell, used, gold) {
    const board = getLogicalBoard(state.mapId);
    let best = null;
    let bestStep = null;
    for (const [aid, a] of state.placements) {
        if (a.type !== 'soldier' || a.playerId !== owner || used.has(aid)) continue;
        if (isProtectedUnit(a)) continue; // ne pas consumer une unité précieuse dans une fusion
        if (!canMerge(a, cur)) continue;
        if (reachableFor(state, owner, aid).moves.get(anchorCell)?.kind !== 'merge') continue;
        const m = mergedSoldier(a, cur);
        if (!best || stronger(m, best)) {
            best = m;
            bestStep = {type: 'merge', fromCell: aid};
        }
    }
    // Achat + fusion : un soldat neuf de même niveau posé sur une case libre
    // voisine, puis fusionné dans `cur`. Exclu si `cur` porte un bonus (un
    // soldat acheté n'en a pas → fusion impossible).
    if (!best && !cur.bonus && (cur.level || 1) < MERGE_MAX) {
        const cost = soldierCostForLevel(cur.level || 1, state.settings);
        if (gold >= cost && freeOwnedNeighbor(state, board, owner, anchorCell)) {
            best = mergedSoldier(freshSoldier(owner, cur.level || 1, state.settings), cur);
            bestStep = {type: 'buy', buyLevel: cur.level || 1, cost};
        }
    }
    if (!best || !stronger(best, cur)) return null;
    return {unit: best, step: bestStep};
}

// Unité la plus FORTE qu'un ennemi peut réellement amener au contact d'une de nos
// cases depuis son soldat `E`, en une seule fin de tour. On renforce `E` par
// petits pas, jusqu'à `MERGE_MAX - 1` fois (le plafond réel : au-delà, plus rien
// ne peut fusionner) tant que c'est possible et payant — voir `nextReinforcement`
// pour le détail (fusion gratuite, sinon achat + fusion, « l'or de l'ennemi
// compte »). On surestime plutôt qu'on ne sous-estime la menace : sous-estimer
// mènerait à un échange désavantageux, ce qu'on veut justement éviter.
export function strongestReachableAttacker(state, E, eCell) {
    const owner = E.playerId;
    let best = E;
    let gold = state.gold?.[owner] || 0;
    const used = new Set([eCell]);

    for (let step = 0; step < MERGE_MAX - 1; step += 1) {
        const next = nextReinforcement(state, owner, best, eCell, used, gold);
        if (!next) break;
        best = next.unit;
        if (next.step.type === 'merge') used.add(next.step.fromCell);
        else gold -= next.step.cost;
    }
    return best;
}

// Pire attaque que les ennemis peuvent porter sur NOTRE soldat `D` supposé sur la
// case `X`, dans l'état `probe`. L'ennemi choisit l'attaque qui lui est la plus
// favorable (il nous fait perdre le plus de valeur en en perdant le moins).
// Renvoie { killsD, ourLoss, theirLoss } ou null si aucun ennemi ne l'atteint.
// Peut-on achever D en faisant s'y mettre à PLUSIEURS assaillants DISTINCTS
// (`reachers`, déjà sous leur forme renforcée) dans le même tour, alors
// qu'AUCUN d'eux seul n'y suffit ? Chacun encaisse la riposte de D (son `atk`,
// fixe — inchangé par les dégâts déjà subis par D) en l'attaquant, quel que
// soit l'ordre : la somme de leurs dégâts contre les PV de départ de D décide
// s'il meurt, indépendamment de qui frappe en premier. L'ennemi engage D'ABORD
// les assaillants qui SURVIVENT à cette riposte (gratuit pour lui), puis
// seulement les plus fragiles (du moins cher au plus cher) si nécessaire pour
// achever D. Renvoie `{killsD: true, ourLoss, theirLoss}` ou `null` si la
// meute au complet ne suffit pas.
function packKill(probe, D, reachers) {
    const dAtk = D.atk || 0;
    const safe = reachers.filter((a) => (a.hp || 0) > dAtk);
    const risky = reachers
        .filter((a) => (a.hp || 0) <= dAtk)
        .sort((a, b) => soldierValue(probe, a) - soldierValue(probe, b));

    let damage = safe.reduce((sum, a) => sum + (a.atk || 0), 0);
    let theirLoss = 0;
    if (damage < D.hp) {
        for (const a of risky) {
            damage += a.atk || 0;
            theirLoss += soldierValue(probe, a);
            if (damage >= D.hp) break;
        }
    }
    if (damage < D.hp) return null; // même tous ensemble, ils ne l'achèvent pas
    return {killsD: true, ourLoss: soldierValue(probe, D), theirLoss};
}

export function worstIncomingAttack(probe, D, X) {
    let worst = null;
    const score = (o) => o.ourLoss - o.theirLoss; // point de vue ennemi (à maximiser)
    const reachers = []; // assaillants (sous forme renforcée) qui atteignent X ce tour
    for (const [eid, e] of probe.placements) {
        if (e.type !== 'soldier' || e.playerId === D.playerId) continue;
        if (reachableFor(probe, e.playerId, eid).moves.get(X)?.kind !== 'combat') continue;
        const attacker = strongestReachableAttacker(probe, e, eid);
        if (!canFight(attacker, D)) continue; // affinités qui s'annulent
        reachers.push(attacker);
        const res = combatResult(attacker, D);
        const outcome = {
            killsD: res.defender.dead,
            ourLoss: res.defender.dead ? soldierValue(probe, D) : 0,
            theirLoss: res.attacker.dead ? soldierValue(probe, attacker) : 0,
        };
        if (
            !worst ||
            (outcome.killsD && !worst.killsD) ||
            (outcome.killsD === worst.killsD && score(outcome) > score(worst))
        ) {
            worst = outcome;
        }
    }
    // MEUTE : aucun assaillant SEUL ne tue D, mais plusieurs assaillants
    // DISTINCTS et non fusionnés entre eux peuvent l'achever à eux plusieurs
    // dans le même tour adverse (voir `packKill`). Sans ce cas, un soldat
    // jugé « en sécurité » face à chaque ennemi pris isolément pouvait mourir
    // gratuitement dès que deux ennemis ou plus l'entouraient à la fois.
    if ((!worst || !worst.killsD) && reachers.length >= 2) {
        const pack = packKill(probe, D, reachers);
        if (pack) worst = pack;
    }
    return worst;
}

// Un soldat est-il ATTAQUABLE par un ennemi ce tour-ci (au contact) ? C'est la
// définition de « contact ». On raisonne case par case, avec la reachabilité
// réelle du moteur (obstacles et affinités compris) — plus fine que la détection
// de mode, volontairement pessimiste, qui ne sert qu'à ouvrir le mode conflit.
export function inEnemyRange(state, cellId, ownerId) {
    for (const [eid, e] of state.placements) {
        if (e.type !== 'soldier' || e.playerId === ownerId) continue;
        if (reachableFor(state, e.playerId, eid).moves.get(cellId)?.kind === 'combat') return true;
    }
    return false;
}

// Le soldat `D` sur `X` est-il MENACÉ, c.-à-d. l'ennemi peut-il le tuer en sortant
// gagnant de l'échange (il perd moins de valeur que nous) ? Un échange à valeur
// égale (double élimination équilibrée) n'est PAS une menace.
export function isThreatened(state, D, X) {
    const w = worstIncomingAttack(state, D, X);
    return !!w && w.killsD && w.theirLoss < w.ourLoss;
}

// Une case est-elle DANGEREUSE pour une unité FRAGILE qu'on veut préserver
// (roi, magicien, soutiens) ? Beaucoup plus prudent qu'`inEnemyRange` : on
// considère non seulement les soldats ennemis existants, mais aussi le fait que
// l'ennemi peut ACHETER un soldat et l'amener au contact (une unité précieuse
// est souvent fragile et vaut cher — c'est exactement ce que fait la chasse aux
// cibles de haute valeur). La case est dangereuse si un soldat ennemi peut
// l'attaquer ce tour, OU si une case ennemie LIBRE d'où l'ennemi pourrait poser
// puis amener un soldat (portée `MAX_MOVE + 1`, distance à vol d'oiseau,
// pessimiste) existe et que cet ennemi a de quoi acheter un soldat.
//
// Vit ici, et non dans `precious.js` où elle est née : `bonuses/magician.js`
// s'en sert AVANT l'équipement (un niveau 3 qui prend le bonus tombe à 1/4 PV —
// la sûreté de sa case doit être jugée sur ce futur profil, pas sur celui du
// gros soldat qu'il était), et `precious.js` importe déjà ce module.
export function preciousCellUnsafe(state, cell, ownerId) {
    if (inEnemyRange(state, cell, ownerId)) return true;
    const board = getLogicalBoard(state.mapId);
    const from = board.cellMap.get(cell);
    if (!from) return true;
    const cost = soldierCostForLevel(1, state.settings);
    for (const c of board.cells) {
        if (c.blocked) continue;
        const owner = state.ownership.get(c.id);
        if (!owner || owner === ownerId) continue; // pas une case ennemie
        if (state.placements.has(c.id)) continue; // occupée : le soldat dessus est déjà couvert
        if (board.baseIds.has(c.id) && !state.destroyedBases?.has(c.id)) continue; // base
        if (hexDistance(from, c) > MAX_MOVE + 1) continue; // hors de portée d'un achat+déplacement
        if ((state.gold?.[owner] || 0) >= cost) return true; // cet ennemi peut acheter et frapper
    }
    return false;
}
