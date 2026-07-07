// Constantes de règles du jeu (indépendantes de l'affichage et du transport).
// Centralisées ici pour que le reducer, les sélecteurs et — plus tard — le
// serveur du mode « online » partagent exactement les mêmes valeurs.

export const MAX_MOVE = 2; // pas de déplacement maximum d'un soldat par tour
export const MERGE_MAX = 3; // niveau maximum d'un soldat fusionné
export const BASE_INCOME = 10; // or gagné par tour avant le bonus de territoire
export const STARTING_GOLD = 0; // or de départ de chaque joueur
