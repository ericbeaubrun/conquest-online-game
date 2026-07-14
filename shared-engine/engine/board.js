// Modèle *logique* du plateau : uniquement ce dont les règles ont besoin
// (adjacence, cases bloquées, cases-bases, possession de départ). Aucune donnée
// de rendu (pixels, points SVG) ici — voir `render/geometry.js`. Cette
// séparation permettra au serveur du mode « online » de raisonner sur l'état
// sans jamais connaître la géométrie d'affichage.

import {getMapById, DEFAULT_MAP_ID} from '../data/maps.js';
import {playersForMap} from '../data/players.js';
import {hexId, getNeighbors} from '../data/hex.js';
import {BLOCKED_TERRAIN} from '../data/terrain.js';
import {resolveSettings} from './settings.js';
import {makeRng, randomSeed} from './rng.js';

// Le modèle logique ne dépend que de l'identifiant de carte : on le mémoïse
// une fois pour toutes (le reducer comme le rendu le réutilisent).
const boardCache = new Map();

export function getLogicalBoard(mapId) {
    if (boardCache.has(mapId)) return boardCache.get(mapId);
    const map = getMapById(mapId);
    const cells = map.cells.map((c) => ({
        id: hexId(c.q, c.r),
        q: c.q,
        r: c.r,
        type: c.type,
        blocked: BLOCKED_TERRAIN.has(c.type),
    }));
    const cellMap = new Map(cells.map((c) => [c.id, c]));
    const baseIds = new Set();
    map.spawns.forEach((s) => {
        const id = hexId(s.q, s.r);
        if (cellMap.has(id)) baseIds.add(id);
    });
    const board = {mapId, map, cells, cellMap, baseIds};
    boardCache.set(mapId, board);
    return board;
}

// Possession de départ : chaque base + ses voisines reviennent à son joueur. On
// itère les JOUEURS (et non les spawns) et on place chacun sur son spawn via
// `spawnIndex` (repli sur l'ordre du tableau). Cela permet des parties qui ne
// remplissent pas tous les spawns : les positions sans joueur restent neutres.
export function buildInitialOwnership(mapId, players) {
    const {map, cellMap} = getLogicalBoard(mapId);
    const ownership = new Map();
    players.forEach((player, idx) => {
        const spawn = map.spawns[player.spawnIndex ?? idx];
        if (!spawn) return;
        const baseId = hexId(spawn.q, spawn.r);
        if (cellMap.has(baseId)) ownership.set(baseId, player.id);
        getNeighbors(spawn.q, spawn.r).forEach((n) => {
            const id = hexId(n.q, n.r);
            if (cellMap.has(id)) ownership.set(id, player.id);
        });
    });
    return ownership;
}

// Construit les joueurs de la partie à partir d'une carte et, éventuellement,
// d'une configuration hors-ligne. Sans config, on retombe sur les joueurs par
// défaut de la carte. Avec config, on prend les joueurs choisis (nom, couleur,
// humain/bot, difficulté), tronqués au nombre de points de départ de la carte.
const BOT_LABELS = {easy: 'Débutant', normal: 'Équilibré', hard: 'Malicieux'};

function resolvePlayers(map, setup) {
    if (setup?.players?.length) {
        return setup.players.slice(0, map.spawns.length).map((p, i) => {
            const isBot = p.kind === 'bot';
            const difficulty = isBot ? p.botDifficulty || 'normal' : null;
            return {
                id: p.id || `p${i + 1}`,
                // Un bot n'a pas de nom saisi : on l'affiche par sa difficulté.
                name: isBot ? `Bot ${BOT_LABELS[difficulty] || ''}`.trim() : p.name || `Joueur ${i + 1}`,
                color: p.color,
                kind: p.kind || 'human',
                botDifficulty: difficulty,
                // Position (spawn) explicite : permet de laisser des spawns vides
                // sans décaler les joueurs. Repli sur l'ordre du tableau.
                spawnIndex: p.spawnIndex ?? i,
            };
        });
    }
    return playersForMap(map);
}

// État de jeu initial pour une carte. C'est la *seule* source de vérité de la
// partie : tour, joueur actif, possession, items posés, soldats ayant joué, or.
// `setup` (optionnel) porte la configuration de la page hors-ligne. `seed`
// (optionnel) fixe la graine du générateur aléatoire : en local elle est tirée
// au hasard, mais en mode « online » le serveur la fournit pour que tous les
// clients rejouent la partie à l'identique.
export function createInitialState(mapId = DEFAULT_MAP_ID, setup = null, seed = randomSeed()) {
    const map = getMapById(mapId);
    const players = resolvePlayers(map, setup);
    // Réglages d'équilibrage garnis de leurs valeurs par défaut : le moteur lit
    // toujours `state.settings` sans se soucier des clés manquantes.
    const settings = resolveSettings(setup?.settings);
    // Générateur aléatoire déterministe à graine. On consomme éventuellement un
    // tirage ici (premier joueur), puis on persiste la graine AVANCÉE dans
    // l'état pour que la suite de la partie continue le même flux d'aléa.
    const rng = makeRng(seed);
    // Premier joueur : le joueur 1, ou un joueur tiré au sort si demandé.
    const firstIdx = settings.randomFirstPlayer ? rng.int(players.length) : 0;
    return {
        mapId,
        players,
        settings,
        rngSeed: rng.seed, // graine courante (sérialisable, voyage dans l'état)
        // Statut de la partie : 'playing' tant qu'aucune victoire n'est acquise,
        // 'over' quand une condition de victoire est remplie (`winnerId` désigne
        // le vainqueur, `endReason` la condition déclenchée).
        status: 'playing',
        winnerId: null,
        endReason: null,
        turn: 1,
        activePlayerId: players[firstIdx].id,
        ownership: buildInitialOwnership(mapId, players),
        placements: new Map(),
        // Points de vie courants des bases attaquées (id de case -> PV restants).
        // Absente = base intacte (PV = BUILDING_STATS.base.hp). Une base tombée à
        // 0 rejoint `destroyedBases` : elle disparaît et sa case redevient normale.
        baseHp: {},
        destroyedBases: new Set(),
        movedSoldiers: new Set(),
        gold: Object.fromEntries(players.map((p) => [p.id, settings.startingGold])),
        uidSeq: 0, // compteur d'identifiants de soldats (déterministe, sérialisable)
    };
}
