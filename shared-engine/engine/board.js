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
import {makeBonusSoldier} from './factories.js';

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

// Renfort de départ des bots, PAR DIFFICULTÉ : le principal levier qui les
// distingue est un bonus déjà équipé au premier tour, pas une IA différente
// (le socle de décision — `engine/bot/` — reste identique à tous les
// paliers). 'easy' ne reçoit rien (le plancher reste la seule recherche) ;
// 'normal' démarre avec un Guerrier (soldat lvl 2, 2/2, prime au combat) ;
// 'hard' démarre avec un Roi (soldat lvl 5, 1/2 — fragile, mais double le
// rendement de son territoire et de ses maisons dès le tour 1).
const STARTING_BONUS = {normal: 'warrior', hard: 'king'};

// Case de départ du renfort d'un bot : la première case libre (praticable, hors
// base) du voisinage de son spawn — donc déjà sur SON territoire (voir
// `buildInitialOwnership`, qui attribue spawn + voisins). `null` si le spawn
// est entièrement bloqué (carte exotique).
function startingBonusCell(mapId, spawn) {
    const {cellMap, baseIds} = getLogicalBoard(mapId);
    for (const n of getNeighbors(spawn.q, spawn.r)) {
        const id = hexId(n.q, n.r);
        const cell = cellMap.get(id);
        if (cell && !cell.blocked && !baseIds.has(id)) return id;
    }
    return null;
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

    // Renfort de départ des bots (voir STARTING_BONUS) : posé après le calcul du
    // territoire de départ, sur une case déjà possédée par le bot concerné.
    const placements = new Map();
    let uidSeq = 0;
    players.forEach((player, idx) => {
        const bonusId = player.kind === 'bot' ? STARTING_BONUS[player.botDifficulty] : null;
        if (!bonusId) return;
        const spawn = map.spawns[player.spawnIndex ?? idx];
        const cellId = spawn && startingBonusCell(mapId, spawn);
        if (!cellId) return;
        uidSeq += 1;
        const soldier = makeBonusSoldier(player.id, `s${uidSeq}`, bonusId, settings);
        if (soldier) placements.set(cellId, soldier);
    });

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
        placements,
        // Points de vie courants des bases attaquées (id de case -> PV restants).
        // Absente = base intacte (PV = BUILDING_STATS.base.hp). Une base tombée à
        // 0 rejoint `destroyedBases` : elle disparaît et sa case redevient normale.
        baseHp: {},
        destroyedBases: new Set(),
        movedSoldiers: new Set(),
        gold: Object.fromEntries(players.map((p) => [p.id, settings.startingGold])),
        uidSeq, // compteur d'identifiants de soldats (déterministe, sérialisable)
        // Journal d'évènements de jeu (achats, combats, morts, effets de bonus…) :
        // alimenté PAR LE REDUCER au fil des actions, il voyage dans l'état (donc
        // sur le fil en online) et sert à afficher des notifications
        // « toast » côté front. `eventSeq` numérote les évènements de façon
        // monotone : le front n'affiche que ceux dont la `seq` dépasse la dernière
        // vue. Le journal est plafonné (voir `emit` dans reducer.js).
        events: [],
        eventSeq: 0,
        // Historique statistique : un instantané par tour complet (voir
        // `statsSnapshot` dans stats.js), alimenté par le reducer en fin de
        // tour. Nourrit les graphiques d'évolution du menu latéral.
        statsHistory: [],
        // Joueurs ayant DÉJÀ acheté un Chevalier noir cette partie (voir
        // `reduceBuyBonus`) : contrairement aux autres compteurs, cette
        // information doit SURVIVRE à la mort du porteur — `placements` seul ne
        // permet pas de distinguer « n'en a jamais eu » de « le sien est mort »,
        // ce dont a besoin le bot pour ne pas en racheter un second (voir
        // `engine/bot/bonuses/blackKnight.js`).
        blackKnightBoughtBy: {},
    };
}
