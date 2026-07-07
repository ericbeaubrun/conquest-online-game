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
export const PLACE_ITEM = 'PLACE_ITEM';
export const END_TURN = 'END_TURN';
export const SET_MAP = 'SET_MAP';

export const moveSoldier = (fromId, toId) => ({ type: MOVE_SOLDIER, fromId, toId });
export const mergeSoldier = (fromId, toId) => ({ type: MERGE_SOLDIER, fromId, toId });
export const placeItem = (cellId, itemType) => ({ type: PLACE_ITEM, cellId, itemType });
export const endTurn = () => ({ type: END_TURN });
export const setMap = (mapId) => ({ type: SET_MAP, mapId });
