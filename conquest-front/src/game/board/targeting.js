// Lecture de l'état de jeu côté interface : qui occupe une case, quelle serait
// l'issue d'un combat, et comment classer une case cliquée. Aucune règle n'est
// réécrite ici : tout passe par le moteur partagé.
import {BUILDING_STATS, combatResult} from '@conquest/shared-engine/engine/rules.js';

// Unité présente sur une case : l'item posé (soldat, maison, tour), ou — à
// défaut — la base de la case, synthétisée depuis ses PV courants (les bases ne
// figurent pas dans `placements`). Sert aux aperçus de combat, y compris lors
// d'un siège de base.
export const unitAt = (game, id) => {
    const placed = game.placements.get(id);
    if (placed) return placed;
    return {
        type: 'base',
        playerId: game.ownership.get(id),
        hp: game.baseHp?.[id] ?? BUILDING_STATS.base.hp,
    };
};

// Issue d'un combat du point de vue de l'attaquant (mêmes règles que l'aperçu
// de combat), utilisée pour choisir la couleur de l'indicateur sur la cible.
export const fightKind = (mover, target) => {
    if (!mover || !target) return 'draw';
    const res = combatResult(mover, target);
    if (res.attacker.dead && res.defender.dead) return 'doubleKo';
    if (res.defender.dead) return 'win';
    if (res.attacker.dead) return 'lose';
    return 'draw';
};

// Classe une case tapée en type de sélection :
//   - 'soldier'  : soldat du joueur actif encore jouable (actions possibles)
//   - 'unit'     : soldat ennemi ou déjà déplacé (specs seules, sans action)
//   - 'building' : case portant une base / tour / maison (image + points de vie)
//   - 'tree'     : arbre (récompense d'abattage + coût de revenu)
//   - 'chest'    : coffre fermé (contenu encore inconnu)
//   - 'loot'     : butin d'un coffre ouvert (effet au ramassage)
//   - 'tile'     : case vide du territoire actif (cible de pose depuis la boutique)
// Renvoie `null` si la case n'est pas sélectionnable.
export function classifyCell(game, board, id) {
    const {placements, ownership, movedSoldiers, activePlayerId, destroyedBases} = game;
    const placed = placements.get(id);
    if (placed?.type === 'soldier') {
        const actionable = placed.playerId === activePlayerId && !movedSoldiers.has(placed.uid);
        return {id, kind: actionable ? 'soldier' : 'unit'};
    }
    if (placed?.type === 'tree') return {id, kind: 'tree'}; // infos de l'arbre
    // Coffre et butin : panneau informatif dédié (contenu inconnu / effet du butin).
    if (placed?.type === 'chest' || placed?.type === 'loot') return {id, kind: placed.type};
    // Base encore debout ou structure posée : panneau du bâtiment. Une base
    // détruite n'est plus un bâtiment : elle retombe dans les cases normales.
    if (placed || (board.baseIds.has(id) && !destroyedBases?.has(id))) return {id, kind: 'building'};
    if (ownership.get(id) === activePlayerId) return {id, kind: 'tile'};
    return null;
}
