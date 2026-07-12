// Actions du jeu : le SEUL moyen de modifier l'état de la partie. En mode
// « local », elles sont appliquées immédiatement par le reducer. En mode
// « online », le hook de session les enverra au serveur (qui les validera et
// renverra le nouvel état) — les composants d'affichage n'auront pas à changer.
//
// Chaque action ne porte que l'*intention* (quelle case, quel item, quel
// soldat) : l'acteur est toujours le joueur actif, déterminé par le reducer.
// C'est plus sûr pour le mode online (le client ne décide pas « à la place de »
// qui il joue).

export const MOVE_SOLDIER = 'MOVE_SOLDIER';
export const MERGE_SOLDIER = 'MERGE_SOLDIER';
export const ATTACK_SOLDIER = 'ATTACK_SOLDIER';
export const CHOP_TREE = 'CHOP_TREE';
export const PLACE_ITEM = 'PLACE_ITEM';
export const BUY_BONUS = 'BUY_BONUS';
export const END_TURN = 'END_TURN';
export const SET_MAP = 'SET_MAP';
export const RESET_GAME = 'RESET_GAME';

export const moveSoldier = (fromId, toId) => ({type: MOVE_SOLDIER, fromId, toId});
export const mergeSoldier = (fromId, toId) => ({type: MERGE_SOLDIER, fromId, toId});
export const attackSoldier = (fromId, toId) => ({type: ATTACK_SOLDIER, fromId, toId});
export const chopTree = (fromId, toId) => ({type: CHOP_TREE, fromId, toId});
// `level` (soldats uniquement) : achète directement un soldat de ce niveau
// (défaut 1). Ignoré pour les autres items. Voir `soldierCostForLevel`.
export const placeItem = (cellId, itemType, level = 1) => ({type: PLACE_ITEM, cellId, itemType, level});
export const buyBonus = (cellId, bonusId) => ({type: BUY_BONUS, cellId, bonusId});
export const endTurn = () => ({type: END_TURN});
// `seed` (optionnel) fixe la graine de la nouvelle partie. En local elle est
// omise (tirée au hasard) ; en mode « online » le serveur la renseignera pour
// que tous les clients partent d'un état identique.
export const setMap = (mapId, seed) => ({type: SET_MAP, mapId, seed});
// Rejoue la partie courante avec la même configuration (joueurs + réglages).
export const resetGame = (seed) => ({type: RESET_GAME, seed});
