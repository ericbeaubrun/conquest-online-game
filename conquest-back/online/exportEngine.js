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
// ✅ Couplage via monorepo : la logique métier est centralisée dans le paquet
// `shared-engine/` à la racine du monorepo, importé ici en relatif
// (`../../shared-engine`). Le front (conquest-front) consomme exactement les
// mêmes modules via l'alias Vite `@shared`. Source de vérité unique partagée.

// NB : on n'importe QUE des modules purs du moteur. Surtout PAS
// de fichiers liés à l'UI ou React — le serveur fait sa propre
// vérification de tour à partir de `state.activePlayerId`.
export {gameReducer} from '../../shared-engine/engine/reducer.js';
export {createInitialState} from '../../shared-engine/engine/board.js';
export {serializeState, deserializeState} from '../../shared-engine/engine/serialize.js';
export {randomSeed} from '../../shared-engine/engine/rng.js';

// Données de définition de partie (cartes, joueurs par défaut) : nécessaires au
// lobby pour dériver les sièges d'une carte. Modules purs eux aussi.
export {MAPS, getMapById, DEFAULT_MAP_ID} from '../../shared-engine/data/maps.js';
export {PLAYERS, playersForMap} from '../../shared-engine/data/players.js';
