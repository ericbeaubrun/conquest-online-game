// PIPELINE DES EFFETS DE FIN DE TOUR.
//
// Chaque effet est une fonction PURE `(ctx) -> ctx` : il reçoit le contexte du
// tour, et renvoie soit le MÊME objet (rien à faire), soit une copie modifiée.
// Ajouter un bonus de fin de tour se résume donc à écrire un effet puis à
// l'insérer dans `END_TURN_EFFECTS` — il n'y a plus de plomberie à rebrancher.
//
// Le contexte porte tout ce qu'un effet peut lire ou produire :
//   state       l'état AVANT la fin de tour — jamais réécrit. Les effets lisent
//               `state.ownership` / `state.movedSoldiers` d'origine, et non le
//               résultat de leurs prédécesseurs : plusieurs en dépendent.
//   board       modèle logique de la carte (adjacence, cases bloquées, bases)
//   rng         générateur à graine, PARTAGÉ par tous les effets
//   events      journal du tour, alimenté par effet de bord (ordre = ordre du
//               pipeline), estampillé en une fois par `emit`
//   placements  carte des items EN COURS de construction — c'est elle qui
//               s'enrichit d'effet en effet
//   ownership   carte des propriétés (seul « Conquérant » la modifie)
//   uidSeq      compteur d'identifiants des unités invoquées
//   income      revenu du joueur actif, majoré par « Roi » et « Magicien »
//
// ⚠️ L'ORDRE DE CETTE LISTE FAIT PARTIE DES RÈGLES DU JEU. Les effets partagent
// un unique flux d'aléa et s'appliquent en chaîne sur la même carte d'unités :
// permuter deux lignes change le résultat des parties — silencieusement, et de
// façon DIFFÉRENTE entre client et serveur si l'un des deux n'est pas à jour.
// Voir `test/endturn.test.js`, qui verrouille cet ordre.

import {applyKingIncome, trackPaladinChallenge, ackBonusNotifications, applyConquerors} from './territory.js';
import {spawnTrees, spawnFarmerTrees, spawnChests} from './spawns.js';
import {applyAlchemists, applyPriests, applyVampires, applyMagicians} from './support.js';
import {spawnWarlockSkeletons, applySorcerers} from './summons.js';

export const END_TURN_EFFECTS = [
    applyKingIncome, // revenu majoré : ouvre le journal du tour
    spawnTrees, // apparition normale des arbres
    spawnFarmerTrees, // pousse « Fermier », sur la frontière du joueur
    spawnChests, // apparition (rare) d'un coffre
    applyAlchemists, // renfort : PV contre attaque
    applyPriests, // soin : PV donnés à l'allié le plus blessé
    applyVampires, // ponction : PV drainés à l'allié le mieux portant
    applyMagicians, // don d'affinité, contre de l'or
    spawnWarlockSkeletons, // invocation de squelettes
    applySorcerers, // envoûtement des bonus de niveau 5, ou dragon
    trackPaladinChallenge, // défi d'inaction — AVANT la remise à zéro des déplacements
    ackBonusNotifications, // accusé de réception des bonus débloqués
    applyConquerors, // annexion des cases vides voisines
];

// Déroule le pipeline et renvoie le contexte final.
export function runEndTurnEffects(ctx) {
    return END_TURN_EFFECTS.reduce((acc, effect) => effect(acc), ctx);
}
