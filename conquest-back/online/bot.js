// IA de bot (serveur). VOLONTAIREMENT SIMPLE : à chaque tour, chaque soldat du
// bot tente son meilleur coup terminal — conquérir une case (priorité), sinon
// attaquer une unité/structure ennemie, sinon abattre un arbre. Les simples
// repositionnements et fusions sont ignorés (peu utiles et sources de boucles).
// Quand plus aucun coup « utile » n'est possible, le bot termine son tour.
//
// C'est assez pour un adversaire fonctionnel (il s'étend et se bat), sans
// prétendre à une stratégie fine — l'économie/boutique n'est pas exploitée.

import { getLogicalBoard } from '@conquest/shared-engine/engine/board.js';
import { computeReachable } from '@conquest/shared-engine/engine/selectors.js';
import { moveSoldier, attackSoldier, chopTree, openChest } from '@conquest/shared-engine/engine/actions.js';

// Valeur d'un type de coup (plus haut = préféré). 'move'/'merge' = 0 : ignorés.
// Un butin à portée passe avant tout : il est gratuit et disparaîtrait sinon au
// profit de l'adversaire.
const PRIORITY = { loot: 4, conquer: 3, combat: 2, chop: 1, openChest: 1 };

// Profils de difficulté : un bot FACILE joue peu (forte chance d'arrêter son tour
// après chaque coup) et n'attaque pas ; un bot DIFFICILE joue tout, à fond.
const DIFFICULTY = {
    easy: { allowCombat: false, stopChance: 0.5 },
    normal: { allowCombat: true, stopChance: 0.15 },
    hard: { allowCombat: true, stopChance: 0 },
};

// Choisit LE meilleur coup pour le joueur actif, ou null s'il n'y en a plus (ou
// si le bot « décide » d'arrêter son tour, selon sa difficulté).
export function pickBotAction(state) {
    const board = getLogicalBoard(state.mapId);
    const pid = state.activePlayerId;
    const active = state.players?.find((p) => p.id === pid);
    const profile = DIFFICULTY[active?.botDifficulty] || DIFFICULTY.normal;

    // Selon la difficulté, le bot peut s'arrêter là où il en est (jeu plus faible).
    if (profile.stopChance > 0 && Math.random() < profile.stopChance) return null;

    let best = null; // { fromId, toId, kind, score }
    for (const [id, placed] of state.placements) {
        if (placed.type !== 'soldier' || placed.playerId !== pid) continue;
        if (state.movedSoldiers?.has(placed.uid)) continue;
        const { moves } = computeReachable(state, board, id);
        for (const [toId, info] of moves) {
            if (info.kind === 'combat' && !profile.allowCombat) continue; // bot facile : pacifique
            const score = PRIORITY[info.kind] || 0;
            if (score === 0) continue;
            if (!best || score > best.score) best = { fromId: id, toId, kind: info.kind, score };
        }
    }

    if (!best) return null;
    if (best.kind === 'combat') return attackSoldier(best.fromId, best.toId);
    if (best.kind === 'chop') return chopTree(best.fromId, best.toId);
    if (best.kind === 'openChest') return openChest(best.fromId, best.toId);
    // 'conquer' et 'loot' = déplacements terminaux (hors territoire / sur un butin).
    return moveSoldier(best.fromId, best.toId);
}
