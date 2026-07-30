// Bonus « Prêtre » (niveau 4, 60 or, entretien nul) — l'INFIRMERIE de campagne.
//
// Ce qu'il fait à chaque fin de tour (`applyPriests`, endturn/support.js) :
// PRIEST_HP_GIFT PV rendus à TOUS ses voisins alliés d'un coup, contre
// PRIEST_HP_COST PV prélevés sur LUI par allié soigné (il s'arrête avant le don
// qui le tuerait). Trois lectures en découlent :
//   - l'échange lui est FAVORABLE, 2 PV rendus pour 1 payé : ses 16 PV valent 30
//     PV répartis sur son escorte. Aucun autre bonus ne CRÉE de la vie ;
//   - mais un allié déjà au maximum (`SOLDIER_HP_MAX`) est sauté sans rien
//     coûter : un prêtre n'a de valeur qu'au milieu de BLESSÉS. C'est un bonus de
//     CONFLIT — en pleine expansion, l'armée est intacte et il ne donne rien,
//     d'où le vivier de blessés exigé avant tout achat ;
//   - équiper le bonus REMPLACE les statistiques du niveau 4 (8/16) par les
//     siennes (1/16, voir `reduceBuyBonus`) : on jette 7 points d'attaque, le
//     plus gros sacrifice de statistiques du bot. On équipe donc en priorité le
//     niveau 4 qui frappe le moins fort, et sa case se juge au critère PRUDENT
//     des unités précieuses (`preciousCellUnsafe`) — il ne riposte plus.
//
// Son défi (6 maisons possédées) est un défi d'ÉTAT lu sur le joueur, pas un
// exploit de soldat : dès que le bot a bâti ses six maisons (voir
// `bonuses/houses.js`, qui construit sans plafond), TOUS ses niveaux 4 sont
// éligibles d'un coup — contrairement au Paladin, qui attend une occasion.
//
// Comme le magicien et l'alchimiste, deux décisions ici : QUI équiper
// (`equipPriests`) et OÙ le tenir (`priestMove`, appelé par `precious.js`).

import {getLogicalBoard} from '../../board.js';
import {SOLDIER_HP_MAX} from '../../rules.js';
import {
    PRIEST_HP_COST,
    BONUS_OFFERS,
    bonusPriceOf,
    isBonusUnlocked,
} from '../../../data/soldier.js';
import {buyBonus} from '../../actions.js';
import {neighborAllies} from '../../endturn/helpers.js';
import {preciousCellUnsafe} from '../threat.js';

// Blessés (alliés sous leur maximum de PV) exigés sur toute la carte pour un
// premier prêtre, puis par prêtre supplémentaire. Plafonné à 2 : au-delà, ils se
// disputent les mêmes voisins, et un niveau 4 vaut trop cher en attaque perdue.
const MIN_WOUNDED_TOTAL = 3;
const WOUNDED_PER_PRIEST = 8;
const MAX_PRIESTS = 2;
// Blessés minimum au CONTACT de la case d'équipement : en dessous, le soin ne
// partirait pas dès cette fin de tour.
const MIN_WOUNDED_NEIGHBORS = 1;

function desiredPriestCount(woundedTotal) {
    if (woundedTotal < MIN_WOUNDED_TOTAL) return 0;
    return Math.min(MAX_PRIESTS, Math.max(1, Math.floor(woundedTotal / WOUNDED_PER_PRIEST)));
}

// Un allié peut-il RECEVOIR des PV ? Exactement la condition de l'effet
// (`applyPriests` saute les alliés au maximum) : le bot compte avec la même règle
// que le moteur applique.
const wounded = (ally) => (ally.hp || 0) < SOLDIER_HP_MAX;

// Blessés adjacents à une case. `selfId` est la case où le prêtre se tient
// ENCORE quand on évalue une DESTINATION voisine : sans cette exclusion, un
// prêtre entamé se compterait lui-même parmi les blessés à soigner — alors qu'un
// prêtre ne se soigne jamais (voir `applyPriests`).
function woundedNeighbors(state, board, playerId, cellId, selfId = null) {
    return neighborAllies(board, state.placements, playerId, cellId).filter(
        ([nid, ally]) => nid !== selfId && wounded(ally)
    ).length;
}

// Tous nos blessés, prêtres exclus : le vivier que ses soins peuvent servir.
function woundedTotal(state, playerId) {
    let n = 0;
    for (const u of state.placements.values()) {
        if (u.type !== 'soldier' || u.playerId !== playerId) continue;
        if (u.bonus === 'priest') continue;
        if (wounded(u)) n += 1;
    }
    return n;
}

// Soins qu'un prêtre peut réellement porter ce tour : ses voisins blessés, BORNÉS
// par ses propres PV (il ne descend jamais sous 1 PV). Valeur maximisée par
// `priestMove`.
const healsFrom = (state, board, playerId, cellId, hp, selfId) =>
    Math.min(
        woundedNeighbors(state, board, playerId, cellId, selfId),
        Math.max(0, Math.floor(((hp || 0) - 1) / PRIEST_HP_COST))
    );

// Équipe le Prêtre sur les niveaux 4 sans bonus, une fois les six maisons
// bâties (`isBonusUnlocked`), tant que le nombre de blessés le justifie. Trié par
// blessés au contact décroissants, puis par attaque CROISSANTE — celle qu'on
// perd en équipant.
export function equipPriests(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.priest === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'priest');
    if (!bonus) return state;
    const board = getLogicalBoard(state.mapId);

    let current = 0;
    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'priest') current += 1;
    }
    const desired = desiredPriestCount(woundedTotal(state, playerId));
    let need = desired - current;
    if (need <= 0) return state;

    const price = bonusPriceOf(bonus, state.settings);
    const candidates = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || u.unit) continue;
        if ((u.level || 1) !== bonus.requiredLevel) continue;
        if (!isBonusUnlocked(u, bonus, state.settings, state)) continue; // les 6 maisons ne sont pas là
        if (preciousCellUnsafe(state, id, playerId)) continue; // il tombe à 1 d'attaque en s'équipant
        const heal = woundedNeighbors(state, board, playerId, id);
        if (heal < MIN_WOUNDED_NEIGHBORS) continue;
        candidates.push({id, heal, atk: u.atk || 0});
    }
    candidates.sort((a, b) => b.heal - a.heal || a.atk - b.atk || (a.id < b.id ? -1 : 1));

    let cur = state;
    for (const c of candidates) {
        if (need <= 0) break;
        if ((cur.gold?.[playerId] || 0) < price) break;
        const next = apply(buyBonus(c.id, 'priest'));
        if (!next) continue;
        cur = next;
        need -= 1;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${c.id} équipé Prêtre (${desired - need}/${desired})`);
    }
    return cur;
}

// Case où TENIR un prêtre déjà équipé, appelée par `precious.js` quand il n'est
// pas menacé : il va se coller au plus gros paquet de blessés. `null` quand sa
// case actuelle vaut déjà mieux, ou qu'il n'a plus de PV à donner (il joue alors
// normalement — conquête / récolte).
export function priestMove(state, fromId, cells) {
    const S = state.placements.get(fromId);
    if (!S || S.bonus !== 'priest') return null;
    const board = getLogicalBoard(state.mapId);
    const playerId = S.playerId;
    if ((S.hp || 0) - PRIEST_HP_COST < 1) return null; // plus rien à donner

    let best = null;
    let bestHeals = healsFrom(state, board, playerId, fromId, S.hp, fromId);
    for (const {toId} of cells) {
        const heals = healsFrom(state, board, playerId, toId, S.hp, fromId);
        if (heals > bestHeals || (heals === bestHeals && best && toId < best)) {
            bestHeals = heals;
            best = toId;
        }
    }
    return best;
}
