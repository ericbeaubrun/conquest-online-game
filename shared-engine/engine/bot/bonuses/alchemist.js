// Bonus « Alchimiste » (niveau 3, 40 or, entretien nul) — l'ARMURERIE ambulante.
//
// Ce qu'il fait à chaque fin de tour (`applyAlchemists`, endturn/support.js) :
// +ALCHEMIST_ATK_BUFF d'attaque à TOUS ses voisins alliés d'un coup, contre
// ALCHEMIST_HP_COST PV prélevés sur LUI par allié servi (il s'arrête toujours
// avant le don qui le tuerait, donc à 1 PV au plus bas). Trois lectures en
// découlent, et elles commandent tout ce module :
//   - le don est PERMANENT (l'attaque gagnée ne se rend jamais) et sa monnaie,
//     ce sont ses PV : ses 16 PV valent 15 points d'attaque définitivement
//     distribués. C'est un CAPITAL qu'on dépense, pas un revenu qu'on encaisse —
//     inutile de le garder « au chaud », il ne rapporte qu'au contact ;
//   - un voisin dont l'attaque est déjà au plafond (`SOLDIER_ATK_MAX`) est sauté
//     sans rien coûter : ce qui compte n'est pas le nombre d'alliés au contact,
//     mais le nombre d'alliés ARMABLES (d'où `armableNeighbors`) ;
//   - équiper le bonus REMPLACE les statistiques du niveau 3 (4/8) par les
//     siennes (1/16, voir `reduceBuyBonus`) : il perd 3 d'attaque et devient un
//     soutien incapable de riposter. Sa case se juge donc au critère PRUDENT des
//     unités précieuses (`preciousCellUnsafe`), comme le magicien.
//
// Deux décisions ici, les mêmes que pour son cousin le magicien : QUI équiper
// (`equipAlchemists`) et OÙ le tenir (`alchemistMove`, appelé par `precious.js`
// — un alchimiste isolé ne donne rien du tout).
//
// Son défi (« aucun AUTRE niveau 3 allié ») est un défi d'ÉTAT recalculé en
// direct, lu SUR LE SOLDAT (il s'exclut lui-même, voir
// `NO_OTHER_SAME_LEVEL_ALLY` dans `data/soldier.js`, générique — le Prêtre s'en
// servait pour son propre niveau avant de revenir à « 6 maisons »). Il ne
// débloque JAMAIS plus d'un niveau 3 À LA FOIS : dès qu'un deuxième niveau 3
// apparaît (achat, fusion, Magicien/Viking/Vampire équipé), les DEUX perdent le
// défi — et ça vaut aussi pour un alchimiste déjà posé (`level` reste 3 après
// l'équipement, voir `reduceBuyBonus` : il compte donc lui-même comme « l'autre
// niveau 3 » pour quiconque tenterait de le rejoindre ensuite). Un seul
// alchimiste peut donc exister à la fois, et seulement si son propriétaire
// garde son armée à UN SEUL niveau 3 le temps de l'équiper — une fenêtre
// étroite qui interdit aussi la voie du niveau 3 NEUF qu'emprunte le magicien
// (l'acheter en ferait aussitôt un second).

import {getLogicalBoard} from '../../board.js';
import {SOLDIER_ATK_MAX} from '../../rules.js';
import {
    ALCHEMIST_HP_COST,
    BONUS_OFFERS,
    bonusPriceOf,
    isBonusUnlocked,
} from '../../../data/soldier.js';
import {buyBonus} from '../../actions.js';
import {neighborAllies} from '../../endturn/helpers.js';
import {preciousCellUnsafe} from '../threat.js';

// Voisins armables minimum sur la case d'équipement : en dessous, le bonus ne
// donnerait rien dès la fin du tour, et un alchimiste ne se rentabilise que par
// le nombre d'alliés qu'il touche d'un coup. Le défi plafonne déjà le nombre
// d'alchimistes à 1 (voir plus haut) — inutile d'en redemander un second ici.
const MIN_ARMABLE_NEIGHBORS = 2;

// Un allié peut-il RECEVOIR de l'attaque ? Exactement la condition de l'effet
// (`applyAlchemists` saute les alliés au plafond) : le bot compte avec la même
// règle que le moteur applique, sans quoi il paierait 40 or pour des dons que la
// fin de tour refuserait.
const armable = (ally) => (ally.atk || 0) < SOLDIER_ATK_MAX;

// Alliés armables adjacents à une case. `selfId` est la case où l'alchimiste se
// tient ENCORE quand on évalue une DESTINATION voisine : sans cette exclusion il
// se compterait lui-même comme allié à armer (il est à 1 d'attaque, donc
// « armable »), et gonflerait d'un point toutes les cases collées à la sienne.
function armableNeighbors(state, board, playerId, cellId, selfId = null) {
    return neighborAllies(board, state.placements, playerId, cellId).filter(
        ([nid, ally]) => nid !== selfId && armable(ally)
    ).length;
}

// Dons qu'un alchimiste peut réellement porter ce tour : le nombre de voisins
// armables, BORNÉ par ses PV (il ne descend jamais sous 1 PV). C'est la valeur
// que `alchemistMove` maximise — un alchimiste exsangue au milieu de six alliés
// n'en arme plus qu'un.
const giftsFrom = (state, board, playerId, cellId, hp, selfId) =>
    Math.min(
        armableNeighbors(state, board, playerId, cellId, selfId),
        Math.max(0, Math.floor(((hp || 0) - 1) / ALCHEMIST_HP_COST))
    );

// Équipe l'Alchimiste sur un niveau 3 sans bonus, quand il est le SEUL niveau 3
// allié (`isBonusUnlocked`, voir la fenêtre décrite plus haut) et qu'il touche
// assez d'alliés armables. Au plus un candidat peut passer ce filtre à la fois
// (c'est la nature même du défi), le tri par voisins armables/attaque ne sert
// donc qu'à départager les rares tours où plusieurs solutions coexisteraient
// (plusieurs prétendants avant même que `isBonusUnlocked` ne tranche).
export function equipAlchemists(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.alchemist === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'alchemist');
    if (!bonus) return state;
    const board = getLogicalBoard(state.mapId);

    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'alchemist') return state; // déjà un alchimiste
    }

    const price = bonusPriceOf(bonus, state.settings);
    if ((state.gold?.[playerId] || 0) < price) return state;

    const candidates = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || u.unit) continue;
        if ((u.level || 1) !== bonus.requiredLevel) continue;
        if (!isBonusUnlocked(u, bonus, state.settings, state)) continue; // un autre niveau 3 allié existe
        if (preciousCellUnsafe(state, id, playerId)) continue; // il tombe à 1 d'attaque en s'équipant
        const arm = armableNeighbors(state, board, playerId, id);
        if (arm < MIN_ARMABLE_NEIGHBORS) continue;
        candidates.push({id, arm, atk: u.atk || 0});
    }
    candidates.sort((a, b) => b.arm - a.arm || a.atk - b.atk || (a.id < b.id ? -1 : 1));

    for (const c of candidates) {
        const next = apply(buyBonus(c.id, 'alchemist'));
        if (!next) continue;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${c.id} équipé Alchimiste (${c.arm} allié(s) armable(s) au contact)`);
        return next;
    }
    return state;
}

// Case où TENIR un alchimiste déjà équipé, appelée par `precious.js` quand il
// n'est pas menacé : il va se coller au plus gros paquet d'alliés armables.
// `null` quand sa case actuelle vaut déjà mieux, ou qu'il n'a plus de PV à
// dépenser (il joue alors normalement — conquête / récolte).
export function alchemistMove(state, fromId, cells) {
    const S = state.placements.get(fromId);
    if (!S || S.bonus !== 'alchemist') return null;
    const board = getLogicalBoard(state.mapId);
    const playerId = S.playerId;
    if ((S.hp || 0) - ALCHEMIST_HP_COST < 1) return null; // plus rien à donner

    let best = null;
    let bestGifts = giftsFrom(state, board, playerId, fromId, S.hp, fromId);
    for (const {toId} of cells) {
        const gifts = giftsFrom(state, board, playerId, toId, S.hp, fromId);
        if (gifts > bestGifts || (gifts === bestGifts && best && toId < best)) {
            bestGifts = gifts;
            best = toId;
        }
    }
    return best;
}
