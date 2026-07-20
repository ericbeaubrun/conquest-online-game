// Briques communes aux effets de fin de tour.
//
// Presque tous répétaient les trois mêmes préambules : « lister mes porteurs de
// tel bonus », « parcourir les alliés adjacents », « trouver une case d'accueil
// voisine ». Les factoriser ici retire une soixantaine de lignes de bruit et,
// surtout, garantit que tous les effets parlent de la MÊME notion d'adjacence.
//
// ATTENTION — ces helpers préservent l'ORDRE d'itération d'origine (celui de la
// carte des items pour les porteurs, celui de `getNeighbors` pour les voisins).
// Le moteur doit rester déterministe : changer cet ordre change le résultat des
// départages (le premier trouvé gagne) et désynchronise les parties en ligne.

import {getNeighbors, hexId} from '../../data/hex.js';

// Cases des soldats du joueur `pid` portant le bonus `bonusId`, dans l'ordre de
// la carte des items. Renvoie [[cellId, unit], ...].
export function soldiersWithBonus(placements, pid, bonusId) {
    const found = [];
    for (const [id, p] of placements) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === bonusId) found.push([id, p]);
    }
    return found;
}

// Soldats ALLIÉS occupant une case voisine de `cellId`, dans l'ordre de
// `getNeighbors`. La case elle-même n'est jamais sa propre voisine : l'appelant
// n'a pas à s'exclure. Renvoie [[cellId, unit], ...].
export function neighborAllies(board, placements, pid, cellId) {
    const cell = board.cellMap.get(cellId);
    if (!cell) return [];
    const allies = [];
    for (const n of getNeighbors(cell.q, cell.r)) {
        const nid = hexId(n.q, n.r);
        const ally = placements.get(nid);
        if (ally && ally.type === 'soldier' && ally.playerId === pid) allies.push([nid, ally]);
    }
    return allies;
}

// Élit UN allié voisin selon un score : `score(unit)` renvoie un nombre, ou
// `null` pour écarter la cible. `best` départage (le PLUS petit ou le PLUS grand
// score). À égalité, le PREMIER rencontré l'emporte — comme les boucles
// d'origine, qui comparaient en `<` / `>` stricts.
export function pickAlly(board, placements, pid, cellId, score, prefer = 'min') {
    let bestId = null;
    let bestScore = null;
    for (const [nid, ally] of neighborAllies(board, placements, pid, cellId)) {
        const s = score(ally);
        if (s == null) continue;
        const better = bestScore == null || (prefer === 'min' ? s < bestScore : s > bestScore);
        if (better) {
            bestScore = s;
            bestId = nid;
        }
    }
    return bestId;
}

// Première case voisine capable d'ACCUEILLIR une invocation : sur la carte, non
// bloquée (eau), hors base, libre de toute unité, et possédée par le joueur.
// Partagée par le « Démoniste » (squelette) et le « Sorcier » (dragon), qui en
// portaient chacun une copie identique.
export function freeOwnedNeighbor(state, board, placements, pid, cellId) {
    const cell = board.cellMap.get(cellId);
    if (!cell) return null;
    return (
        getNeighbors(cell.q, cell.r)
            .map((n) => hexId(n.q, n.r))
            .find((nid) => {
                const ncell = board.cellMap.get(nid);
                return (
                    ncell &&
                    !ncell.blocked &&
                    !board.baseIds.has(nid) &&
                    !placements.has(nid) &&
                    state.ownership.get(nid) === pid
                );
            }) ?? null
    );
}
