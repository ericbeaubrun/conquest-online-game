// // Réexporte le moteur de jeu PARTAGÉ avec le client. On l'importe tel quel (et on
// // ne le copie SURTOUT pas) pour garantir des règles STRICTEMENT identiques des
// // deux côtés : le serveur rejoue exactement le même reducer, avec le même PRNG à
// // graine, donc le même état déterministe que celui qu'un client calculerait.
// //
// // ⚠️ Couplage temporaire : le moteur est référencé par chemin relatif vers le
// // repo client voisin (`../../conquest-online-game`). C'est fragile (dépend de la
// // disposition des dossiers sur la machine) mais volontairement centralisé ICI,
// // dans ce seul fichier. À remplacer plus tard par un vrai partage de code
// // (package npm privé, workspace monorepo, ou sous-module git) — un seul point à
// // modifier.
//
// const ENGINE = '../../conquest-online-game/src/game/engine';
//
// // NB : on n'importe QUE des modules purs du moteur. Surtout PAS
// // `session/useGameSession.js` (qui dépend de React) — le serveur fait sa propre
// // vérification de tour à partir de `state.activePlayerId`.
// export { gameReducer } from '../../conquest-online-game/src/game/engine/reducer.js';
// export { createInitialState } from '../../conquest-online-game/src/game/engine/board.js';
// export { serializeState, deserializeState } from '../../conquest-online-game/src/game/engine/serialize.js';
// export { randomSeed } from '../../conquest-online-game/src/game/engine/rng.js';
//
// // Données de définition de partie (cartes, joueurs par défaut) : nécessaires au
// // lobby pour dériver les sièges d'une carte. Modules purs eux aussi.
// export { MAPS, getMapById, DEFAULT_MAP_ID } from '../../conquest-online-game/src/game/maps.js';
// export { PLAYERS, playersForMap } from '../../conquest-online-game/src/game/players.js';
//
// // Note : `ENGINE` n'est pas utilisé par les `export ... from` (qui exigent un
// // littéral de chaîne) ; il documente juste le préfixe commun ci-dessus.
// void ENGINE;


// Réexporte le moteur de jeu PARTAGÉ avec le client. On l'importe tel quel (et on
// ne le copie SURTOUT pas) pour garantir des règles STRICTEMENT identiques des
// deux côtés : le serveur rejoue exactement le même reducer, avec le même PRNG à
// graine, donc le même état déterministe que celui qu'un client calculerait.
//
// ✅ Couplage via monorepo (npm workspaces) : la logique métier est centralisée
// dans le paquet `@conquest/shared-engine`, importé ici par son nom de paquet.
// Le front (conquest-front) importe exactement les mêmes modules par le même
// nom. Source de vérité unique, résolue via node_modules (symlink workspace).

// NB : on n'importe QUE des modules purs du moteur. Surtout PAS
// de fichiers liés à l'UI ou React — le serveur fait sa propre
// vérification de tour à partir de `state.activePlayerId`.
export {gameReducer} from '@conquest/shared-engine/engine/reducer.js';
export {createInitialState} from '@conquest/shared-engine/engine/board.js';
export {
    serializeState,
    deserializeState,
    // Format de DIFFUSION allégé (l'état privé de ce que le client possède
    // déjà) : réservé au fil socket.io, jamais à la persistance.
    serializeStateWire,
} from '@conquest/shared-engine/engine/serialize.js';
export {randomSeed} from '@conquest/shared-engine/engine/rng.js';
// Retour au début de tour : restitution PURE d'un instantané, calculée à
// l'identique par le client (application optimiste) et par le serveur (autorité).
export {restoreTurnStart} from '@conquest/shared-engine/engine/turnReset.js';
// Sélecteur pur : nombre de cases possédées (sert à savoir si un joueur est
// encore « en vie », donc reprenable par un joueur qui rejoint la partie).
export {ownedCount} from '@conquest/shared-engine/engine/selectors.js';
// Fin de tour : nécessaire au serveur pour clore le tour d'un siège bot après
// l'avoir fait « jouer » (`advanceBots`, voir gameSocket.js).
export {endTurn} from '@conquest/shared-engine/engine/actions.js';

// Données de définition de partie (cartes, joueurs par défaut) : nécessaires au
// lobby pour dériver les sièges d'une carte. Modules purs eux aussi.
export {
    MAPS,
    getMapById,
    getPlayableMapById,
    DEFAULT_MAP_ID,
} from '@conquest/shared-engine/data/maps.js';
export {PLAYERS, playersForMap} from '@conquest/shared-engine/data/players.js';
export {PALETTE_VALUES, colorName} from '@conquest/shared-engine/data/colors.js';
