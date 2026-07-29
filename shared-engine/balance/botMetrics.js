// Banc de métriques du bot : joue des parties bot-vs-bot DÉTERMINISTES sur les
// cartes de test (`data/testMaps.js`, 60/180/300 cases) et mesure son
// comportement — achats de bonus, maisons, sacrifices, récolte... — pour
// pouvoir AJUSTER les constantes du bot (`engine/bot/`) en connaissance de
// cause plutôt qu'à l'intuition, plutôt que de se fier au seul « ça a l'air de
// bien jouer ».
//
// Pur : aucune sortie console ici (voir `botReport.js` pour l'affichage), même
// convention que `table.js` / `report.js` / `bonuses.js` dans ce dossier.
//
// Pour l'instant limité au niveau de difficulté 'easy' (« Débutant ») — voir
// le commentaire sur `DEFAULT_DIFFICULTY`.

import {gameReducer} from '../engine/reducer.js';
import {createInitialState} from '../engine/board.js';
import {
    endTurn,
    BUY_BONUS,
    PLACE_ITEM,
    CHOP_TREE,
    OPEN_CHEST,
    MERGE_SOLDIER,
    ATTACK_SOLDIER,
} from '../engine/actions.js';
import {runBotTurn} from '../engine/bot/index.js';
import {BONUS_OFFERS} from '../data/soldier.js';
import {TEST_MAPS} from '../data/testMaps.js';

export const TEST_MAP_IDS = TEST_MAPS.map((m) => m.id);

// Seul niveau instrumenté pour l'instant : le socle de décision est commun à
// tous les paliers (voir `engine/bot/index.js`), mais élargir le banc aux
// autres difficultés est un choix à part (une fois les métriques 'easy'
// stabilisées et les constantes du bot ajustées dessus).
export const DEFAULT_DIFFICULTY = 'easy';

// Trouve, parmi les placements APRÈS une action, si un soldat d'`uid` donné
// est toujours vivant quelque part (a pu changer de case en avançant sur la
// cible tuée).
function survives(afterPlacements, uid) {
    for (const u of afterPlacements.values()) {
        if (u.uid === uid) return true;
    }
    return false;
}

// Comptabilise l'effet d'une action ACCEPTÉE par le reducer dans les stats
// brutes d'une partie. `before`/`after` sont les états juste avant/après.
function recordAction(stats, before, after, action, turn) {
    switch (action.type) {
        case BUY_BONUS: {
            const entry = stats.bonusPurchases[action.bonusId];
            if (!entry) break; // bonus inconnu (ne devrait pas arriver) : on ignore plutôt que de planter
            entry.count += 1;
            if (entry.firstTurn == null) entry.firstTurn = turn;
            break;
        }
        case PLACE_ITEM: {
            if (action.itemType === 'house') stats.housesBuilt += 1;
            else if (action.itemType === 'soldier') stats.soldiersBought += 1;
            break;
        }
        case CHOP_TREE:
            stats.treesChopped += 1;
            break;
        case OPEN_CHEST:
            stats.chestsOpened += 1;
            break;
        case MERGE_SOLDIER:
            stats.merges += 1;
            break;
        case ATTACK_SOLDIER: {
            stats.attacksTotal += 1;
            const attacker = before.placements.get(action.fromId);
            const defender = before.placements.get(action.toId);
            if (attacker && !survives(after.placements, attacker.uid)) {
                // L'attaquant est mort dans l'échange : ni `bestOffense`, ni la
                // chasse (`hunt.js`/`bonuses/undead.js`) ne proposent jamais un
                // coup pareil (elles exigent `!res.attacker.dead`) — seul le
                // dernier recours de `playContactSoldier` (phase 3c, « fichu
                // partout ») attaque sans cette garantie. C'est donc EXACTEMENT
                // le signal « le bot a dû se sacrifier » que ce banc mesure.
                stats.sacrifices += 1;
                if (defender && !survives(after.placements, defender.uid)) {
                    stats.sacrificesWorthIt += 1; // au moins un double KO
                } else {
                    stats.sacrificesForNothing += 1; // mort pour rien
                }
            }
            break;
        }
        default:
            break;
    }
}

function emptyStats() {
    const bonusPurchases = {};
    for (const b of BONUS_OFFERS) bonusPurchases[b.id] = {count: 0, firstTurn: null};
    return {
        housesBuilt: 0,
        soldiersBought: 0,
        treesChopped: 0,
        chestsOpened: 0,
        merges: 0,
        attacksTotal: 0,
        sacrifices: 0,
        sacrificesWorthIt: 0,
        sacrificesForNothing: 0,
        bonusPurchases,
    };
}

// Joue une partie bot-vs-bot entière (2 bots `difficulty`) sur `mapId`, à
// graine fixe, et renvoie ses statistiques brutes. Les deux bots sont agrégés
// ensemble (ils jouent la même IA au même niveau) : ce banc mesure le
// comportement du PALIER, pas la différence entre positions de spawn.
export function playBotGame({mapId, seed, difficulty = DEFAULT_DIFFICULTY, maxTurns = 150}) {
    const players = [
        {id: 'p1', name: 'Un', color: '#e11', kind: 'bot', botDifficulty: difficulty, spawnIndex: 0},
        {id: 'p2', name: 'Deux', color: '#11e', kind: 'bot', botDifficulty: difficulty, spawnIndex: 1},
    ];
    let state = createInitialState(mapId, {players, settings: {}}, seed);
    const stats = emptyStats();

    // Le bot journalise sa décision (`console.log`) : on le fait taire ici, un
    // banc qui joue des dizaines de parties ne doit rien imprimer par coup.
    const originalLog = console.log; // eslint-disable-line no-console
    console.log = () => {}; // eslint-disable-line no-console
    try {
        while (state.turn <= maxTurns && state.status !== 'over') {
            const turn = state.turn;
            let cur = state;
            runBotTurn(cur, (action) => {
                const before = cur;
                const next = gameReducer(cur, action);
                if (next === cur) return null; // coup rejeté : le bot n'insiste pas
                recordAction(stats, before, next, action, turn);
                cur = next;
                return next;
            });
            state = gameReducer(cur, endTurn());
        }
    } finally {
        console.log = originalLog; // eslint-disable-line no-console
    }

    const finalGold = Object.values(state.gold || {}).reduce((sum, g) => sum + (g || 0), 0);
    const territoryOwned = [...state.ownership.values()].filter(Boolean).length;

    return {
        mapId,
        seed,
        difficulty,
        turnsPlayed: Math.min(state.turn, maxTurns),
        finished: state.status === 'over',
        winnerId: state.winnerId,
        endReason: state.endReason,
        finalGold,
        territoryOwned,
        ...stats,
    };
}

// Joue `games` parties (graines `seedStart..seedStart+games-1`) par carte de
// `mapIds`, et renvoie `{ [mapId]: { games: [...bruts], summary } }`.
// `summary` agrège en pourcentages/moyennes ce qui intéresse le réglage du
// bot : fréquence d'achat par bonus, maisons, sacrifices, récolte, économie.
export function runBotMetrics({
    mapIds = TEST_MAP_IDS,
    games = 10,
    seedStart = 1,
    difficulty = DEFAULT_DIFFICULTY,
    maxTurns = 100,
} = {}) {
    const results = {};
    for (const mapId of mapIds) {
        const rows = [];
        for (let i = 0; i < games; i += 1) {
            rows.push(playBotGame({mapId, seed: seedStart + i, difficulty, maxTurns}));
        }
        results[mapId] = {games: rows, summary: summarizeGames(rows)};
    }
    return results;
}

// Moyenne d'un champ numérique sur une liste de parties.
const avg = (rows, pick) => (rows.length ? rows.reduce((sum, r) => sum + pick(r), 0) / rows.length : 0);
// Part (0..1) des parties vérifiant un prédicat.
const share = (rows, pred) => (rows.length ? rows.filter(pred).length / rows.length : 0);

function summarizeGames(rows) {
    const n = rows.length;
    const bonusSummary = {};
    for (const b of BONUS_OFFERS) {
        const counts = rows.map((r) => r.bonusPurchases[b.id].count);
        const boughtGames = rows.filter((r) => r.bonusPurchases[b.id].count > 0);
        const firstTurns = boughtGames.map((r) => r.bonusPurchases[b.id].firstTurn);
        bonusSummary[b.id] = {
            gamesWithPurchaseShare: n ? boughtGames.length / n : 0,
            avgCountPerGame: n ? counts.reduce((s, c) => s + c, 0) / n : 0,
            avgFirstTurn: firstTurns.length ? firstTurns.reduce((s, t) => s + t, 0) / firstTurns.length : null,
        };
    }
    return {
        games: n,
        finishedShare: share(rows, (r) => r.finished),
        avgTurnsPlayed: avg(rows, (r) => r.turnsPlayed),
        avgHousesBuilt: avg(rows, (r) => r.housesBuilt),
        gamesWithHouseShare: share(rows, (r) => r.housesBuilt > 0),
        avgSoldiersBought: avg(rows, (r) => r.soldiersBought),
        avgTreesChopped: avg(rows, (r) => r.treesChopped),
        avgChestsOpened: avg(rows, (r) => r.chestsOpened),
        avgMerges: avg(rows, (r) => r.merges),
        avgAttacks: avg(rows, (r) => r.attacksTotal),
        avgSacrifices: avg(rows, (r) => r.sacrifices),
        gamesWithSacrificeShare: share(rows, (r) => r.sacrifices > 0),
        avgSacrificesWorthIt: avg(rows, (r) => r.sacrificesWorthIt),
        avgSacrificesForNothing: avg(rows, (r) => r.sacrificesForNothing),
        avgFinalGold: avg(rows, (r) => r.finalGold),
        avgTerritoryOwned: avg(rows, (r) => r.territoryOwned),
        bonusSummary,
    };
}
