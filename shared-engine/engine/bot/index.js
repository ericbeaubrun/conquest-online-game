// IA de bot, PARTAGÉE front/back.
//
// PRINCIPE GÉNÉRAL (socle commun à toutes les difficultés) : à chaque tour, le
// bot LIT le terrain et en déduit un MODE (un comportement). Le mode choisi
// détermine ensuite l'arbre de décision qu'il déroule. Les difficultés futures
// se distingueront par la finesse de ces arbres, pas par le socle : la détection
// de mode et l'ossature du tour restent communes.
//
// Modes existants à ce stade :
//   - 'conquete' : aucun ennemi ne peut atteindre notre territoire — on s'étale
//     au maximum (achat de soldats lvl 1 + conquêtes dispersées).
//   - 'conflit'  : au moins un ennemi peut atteindre notre territoire. On ne
//     pense plus expansion mais ÉCHANGES : chaque soldat est classé « contact »
//     (attaquable par l'ennemi) ou « visuel » (hors de portée), et joue selon
//     une analyse de sa « zone » qui vise à éviter les échanges désavantageux et
//     à saisir les avantageux.
//
// L'appelant (`online/gameSocket.js` en ligne, `useGameSession` en hors-ligne)
// termine le tour lui-même après `runBotTurn` : ce module ne joue jamais
// `endTurn`.
//
// Le fichier ne fait qu'orchestrer : chaque couche logique vit dans son propre
// module de ce dossier —
//   `log.js`        : journal de mise au point.
//   `helpers.js`     : petits utilitaires génériques (case, reachabilité, valeur).
//   `mode.js`        : détection conquête/conflit.
//   `threat.js`      : analyse de menace (portée ennemie, pire riposte, renforts).
//   `offense.js`     : notre meilleure attaque (avec renfort éventuel).
//   `movement.js`    : déplacements génériques (pas de combat/récolte).
//   `reposition.js`  : repositionnement des soldats sans occupation locale.
//   `conquest.js`    : mode conquête (achat, expansion, récolte).
//   `conflict.js`    : mode conflit (contact/visuel, 4 phases du tour).
//   `hunt.js`        : chasse aux cibles ennemies vulnérables.
//   `precious.js`    : protection des unités précieuses (roi, guerrier...).
//   `bonuses/*.js`   : équipement de chaque bonus (aventurier, voleur, bûcheron,
//                      ninja, moine, mort-vivant) et ses maisons.

import {logMode} from './log.js';
import {detectMode} from './mode.js';
import {protectPreciousUnits} from './precious.js';
import {equipLumberjacks} from './bonuses/lumberjack.js';
import {equipNinjas} from './bonuses/ninja.js';
import {buySoldiers, spreadSoldiers} from './conquest.js';
import {equipAdventurers} from './bonuses/adventurer.js';
import {buildHouses} from './bonuses/houses.js';
import {equipMonks} from './bonuses/monk.js';
import {runConflict} from './conflict.js';

export {detectMode};

// Le joueur actif est-il un bot ?
export function isBotTurn(state) {
    const active = state.players?.find((p) => p.id === state.activePlayerId);
    return active?.kind === 'bot';
}

// Déroule le tour du bot actif. `apply(action)` applique l'action et renvoie le
// NOUVEL état (ou une valeur fausse si l'action a été refusée / n'a rien changé).
// Ne termine PAS le tour : c'est à l'appelant d'envoyer `endTurn`.
export function runBotTurn(state, apply) {
    const playerId = state.activePlayerId;
    const mode = detectMode(state, playerId);
    logMode(state, playerId, mode);
    // AVANT tout : mettre nos unités précieuses (roi, guerrier, soutiens) à l'abri.
    // Elles sont ensuite ignorées par les autres phases.
    let cur = protectPreciousUnits(state, playerId, apply);
    // Bûcheron / Ninja : indépendants du mode (récolter du bois ou courir après
    // des coffres reste utile en pleine expansion comme en conflit).
    cur = equipLumberjacks(cur, playerId, apply);
    cur = equipNinjas(cur, playerId, apply);
    if (mode === 'conquete') {
        cur = buySoldiers(cur, playerId, apply);
        cur = equipAdventurers(cur, playerId, apply);
        // Maisons/moines : avec ce qu'il reste APRÈS l'expansion, jamais avant.
        cur = buildHouses(cur, playerId, apply);
        cur = equipMonks(cur, playerId, apply);
        return spreadSoldiers(cur, playerId, apply);
    }
    return runConflict(cur, playerId, apply);
}
