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
//   `bonuses/*.js`   : équipement de chaque bonus (aventurier, fermier, voleur,
//                      bûcheron, ninja, moine, magicien, alchimiste, prêtre,
//                      druide, paladin, chevalier noir, démoniste, conquérant,
//                      mort-vivant) et ses maisons.

import {logMode} from './log.js';
import {detectMode} from './mode.js';
import {protectPreciousUnits} from './precious.js';
import {equipLumberjacks} from './bonuses/lumberjack.js';
import {equipNinjas} from './bonuses/ninja.js';
import {buySoldiers, spreadSoldiers} from './conquest.js';
import {equipAdventurers} from './bonuses/adventurer.js';
import {equipFarmers} from './bonuses/farmer.js';
import {buildHouses} from './bonuses/houses.js';
import {equipMonks} from './bonuses/monk.js';
import {equipMagicians} from './bonuses/magician.js';
import {equipAlchemists} from './bonuses/alchemist.js';
import {equipPriests} from './bonuses/priest.js';
import {equipDruids} from './bonuses/druid.js';
import {equipPaladins, runPaladins} from './bonuses/paladin.js';
import {equipBlackKnights} from './bonuses/blackKnight.js';
import {equipWarlocks} from './bonuses/warlock.js';
import {equipConquerors} from './bonuses/conqueror.js';
import {playAffinities} from './affinity.js';
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
    // Prêtre AVANT Paladin/Druide/Chevalier noir : les quatre se disputent la
    // même ressource (un niveau 4 sans bonus) — préférence de construction,
    // pas une nécessité de correction (leurs défis respectifs — maisons,
    // inaction, arbres gardés, squelette tué/possédé — sont tous aussi
    // « collants » les uns que les autres une fois remplis, aucun ne se
    // referme après coup). On lui laisse simplement le premier choix.
    cur = equipPriests(cur, playerId, apply);
    // Paladin : indépendant du mode lui aussi. Il joue AVANT les phases
    // ordinaires — elles ne savent rien de son bouclier et l'emploieraient comme
    // un soldat quelconque, alors que sa seule vraie cible est la structure
    // adverse (voir `bonuses/paladin.js`).
    cur = equipPaladins(cur, playerId, apply);
    cur = runPaladins(cur, playerId, apply);
    // Affinités : la réponse au bouclier adverse (barrage, puis l'élément qui
    // permet de le toucher) et les immunités défensives. Avant les phases de
    // combat, qui exploitent ensuite les capacités ainsi ouvertes — la portée du
    // moteur applique `canFight`, donc tout le reste du bot en tient compte
    // automatiquement une fois l'affinité posée.
    cur = playAffinities(cur, playerId, apply);
    if (mode === 'conquete') {
        cur = buySoldiers(cur, playerId, apply);
        cur = equipAdventurers(cur, playerId, apply);
        cur = equipFarmers(cur, playerId, apply);
        // Maisons/moines : avec ce qu'il reste APRÈS l'expansion, jamais avant.
        cur = buildHouses(cur, playerId, apply);
        cur = equipMonks(cur, playerId, apply);
        // Magicien : APRÈS l'expansion et les maisons — il diffuse ses affinités
        // sur l'armée déjà là, il ne la remplace pas. Il devient une unité
        // précieuse en s'équipant (1/4 PV) : on repasse la protection derrière,
        // sinon il encaisserait tout un tour ennemi là où il vient d'être posé.
        cur = equipMagicians(cur, playerId, apply);
        // Alchimiste : même famille de décision, même place dans le tour (après
        // l'expansion, sur l'armée déjà en place). Il se garde lui-même : il ne
        // s'équipe que s'il a des alliés à armer — donc rarement ici, en
        // conquête, où l'armée est intacte (voir `bonuses/alchemist.js`). Le
        // Prêtre, lui, a déjà joué plus haut (priorité sur les trois autres).
        cur = equipAlchemists(cur, playerId, apply);
        // Druide : même famille de décision (un niveau 4 qui devient 2/6), même
        // repli derrière. Il ne coûte rien à l'achat — c'est son armée d'arbres
        // qui se paie, 16 or/tour pièce (voir `bonuses/druid.js`).
        cur = equipDruids(cur, playerId, apply);
        // Chevalier noir : DERNIER prétendant au bassin de niveaux 4 sans bonus
        // — son propre plafond (`blackKnightBoughtBy`, un seul par partie, voir
        // `bonuses/blackKnight.js`) limite déjà les dégâts, mais son défi (un
        // squelette tué ou possédé, n'importe où dans l'équipe) peut s'ouvrir
        // tôt et pour plusieurs niveaux 4 à la fois : le placer dernier laisse
        // Prêtre/Paladin/Druide passer avant lui sur un même tour.
        cur = equipBlackKnights(cur, playerId, apply);
        // Conquérant : AVANT le Démoniste — entre les deux seuls niveaux 5,
        // celui-ci ne sacrifie AUCUNE statistique (contrairement au Démoniste,
        // qui tombe à 1 d'attaque) et gagne un bouclier ET une expansion
        // automatique ; s'il n'existe qu'un niveau 5 disponible, autant qu'il
        // le prenne en premier.
        cur = equipConquerors(cur, playerId, apply);
        // Démoniste : niveau 5, quasiment jamais atteint par le bot (les
        // fusions n'y montent presque jamais — voir `bonuses/warlock.js`) ;
        // appelé ici par cohérence avec les autres soutiens fragiles.
        cur = equipWarlocks(cur, playerId, apply);
        cur = protectPreciousUnits(cur, playerId, apply);
        return spreadSoldiers(cur, playerId, apply);
    }
    // En conflit, le magicien vaut encore plus (une affinité donnée, c'est un
    // allié que la même affinité adverse ne peut plus toucher) : on l'équipe
    // avant de jouer les échanges, pour que le don parte dès cette fin de tour.
    cur = equipMagicians(cur, playerId, apply);
    // Alchimiste : vaut surtout ICI — les échanges se jouent à un point
    // d'attaque près, qu'il distribue à toute son escorte. Le Prêtre a déjà joué
    // plus haut (priorité sur les trois autres) ; son propre gain (des blessés à
    // soigner) n'en est pas moins réel une fois posé, seul le MOMENT de son
    // équipement a changé.
    cur = equipAlchemists(cur, playerId, apply);
    cur = equipDruids(cur, playerId, apply);
    // Chevalier noir DERNIER (voir le commentaire en mode conquête),
    // Conquérant AVANT le Démoniste (aucun sacrifice de statistiques) : mêmes
    // raisons qu'en conquête, voir les commentaires ci-dessus.
    cur = equipBlackKnights(cur, playerId, apply);
    cur = equipConquerors(cur, playerId, apply);
    cur = equipWarlocks(cur, playerId, apply);
    cur = protectPreciousUnits(cur, playerId, apply); // idem : le neuf n'a pas encore été mis à l'abri
    return runConflict(cur, playerId, apply);
}
