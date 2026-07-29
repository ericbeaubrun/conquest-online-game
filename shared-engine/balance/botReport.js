// RAPPORT DE MÉTRIQUES DU BOT — outil de ligne de commande.
//
//   npm run botstats                       10 parties/carte, niveau Débutant
//   npm run botstats -- --games 50         change le nombre de parties/carte
//   npm run botstats -- --turns 200        change le plafond de tours/partie
//   npm run botstats -- --maps test-small  ne joue que sur certaines cartes
//   npm run botstats -- --seed 100         change la graine de départ
//   npm run botstats -- --csv              export CSV (une ligne par bonus×carte)
//
// Fait JOUER des parties bot-vs-bot (voir `botMetrics.js`) sur les cartes de
// test (`data/testMaps.js`, 60/180/300 cases) et affiche à quelle fréquence le
// bot Débutant achète chaque bonus, construit des maisons, se sacrifie, etc.
// Contrairement à `report.js`/`bonuses.js`, ce n'est PAS un calcul statique :
// deux exécutions avec les mêmes graines donnent les mêmes chiffres (le moteur
// est déterministe), mais changer une constante dans `engine/bot/` change ce
// rapport — c'est tout l'intérêt.

import {runBotMetrics, TEST_MAP_IDS, DEFAULT_DIFFICULTY} from './botMetrics.js';
import {BONUS_OFFERS} from '../data/soldier.js';
import {TEST_MAPS} from '../data/testMaps.js';

const mapNameOf = (mapId) => TEST_MAPS.find((m) => m.id === mapId)?.name ?? mapId;

// --- Mise en forme (mêmes conventions que report.js/bonuses.js) -----------

function cell(value) {
    if (value == null) return '—';
    if (typeof value === 'number') {
        const rounded = Math.round(value * 100) / 100;
        return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
    }
    return String(value);
}
const pct = (v) => `${Math.round(v * 1000) / 10}%`;
const width = (s) => String(s).normalize('NFC').length;
const pad = (s, size, right = false) => {
    const fill = ' '.repeat(Math.max(0, size - width(s)));
    return right ? fill + s : s + fill;
};

function renderTable(columns, rows) {
    const text = rows.map((row) => columns.map((c) => c.render(row)));
    const sizes = columns.map((c, i) => Math.max(width(c.label), ...text.map((r) => width(r[i]))));
    const lines = [
        `  ${columns.map((c, i) => pad(c.label, sizes[i], c.right)).join('  ')}`,
        `  ${sizes.map((s) => '─'.repeat(s)).join('  ')}`,
    ];
    for (const row of text) lines.push(`  ${row.map((v, i) => pad(v, sizes[i], columns[i].right)).join('  ')}`);
    return lines.join('\n');
}

// --- Rendu d'une carte -------------------------------------------------------

const GENERAL_ROWS = [
    ['Parties jouées', (s) => s.games],
    ['Parties terminées', (s) => pct(s.finishedShare)],
    ['Tours joués (moy.)', (s) => cell(s.avgTurnsPlayed)],
    ['Maisons posées (moy./partie)', (s) => cell(s.avgHousesBuilt)],
    ['Parties avec ≥1 maison', (s) => pct(s.gamesWithHouseShare)],
    ['Soldats achetés (moy./partie)', (s) => cell(s.avgSoldiersBought)],
    ['Arbres abattus (moy./partie)', (s) => cell(s.avgTreesChopped)],
    ['Coffres ouverts (moy./partie)', (s) => cell(s.avgChestsOpened)],
    ['Fusions (moy./partie)', (s) => cell(s.avgMerges)],
    ['Attaques (moy./partie)', (s) => cell(s.avgAttacks)],
    ['Sacrifices (moy./partie)', (s) => cell(s.avgSacrifices)],
    ['  dont rentables (double KO)', (s) => cell(s.avgSacrificesWorthIt)],
    ['  dont pour rien', (s) => cell(s.avgSacrificesForNothing)],
    ['Parties avec ≥1 sacrifice', (s) => pct(s.gamesWithSacrificeShare)],
    ['Or non dépensé en fin de partie (moy., 2 joueurs)', (s) => cell(s.avgFinalGold)],
    ['Cases contrôlées en fin de partie (moy., 2 joueurs)', (s) => cell(s.avgTerritoryOwned)],
];

function renderGeneral(summary) {
    const labelSize = Math.max(...GENERAL_ROWS.map(([label]) => width(label)));
    return GENERAL_ROWS.map(([label, pick]) => `  ${pad(label, labelSize)}   ${pick(summary)}`).join('\n');
}

const BONUS_COLUMNS = [
    {key: 'level', label: 'Niv', right: true, render: (r) => String(r.level)},
    {key: 'label', label: 'Bonus', render: (r) => r.label},
    {key: 'share', label: 'Parties avec achat', right: true, render: (r) => pct(r.gamesWithPurchaseShare)},
    {key: 'avgCount', label: 'Achats/partie', right: true, render: (r) => cell(r.avgCountPerGame)},
    {key: 'avgFirstTurn', label: '1er achat (tour, moy.)', right: true, render: (r) => cell(r.avgFirstTurn)},
];

function renderBonuses(summary) {
    const rows = BONUS_OFFERS.map((b) => ({level: b.requiredLevel, label: b.label, ...summary.bonusSummary[b.id]}))
        .sort((a, b) => a.level - b.level || b.gamesWithPurchaseShare - a.gamesWithPurchaseShare);
    return renderTable(BONUS_COLUMNS, rows);
}

function renderMap(mapId, mapName, summary) {
    const lines = [];
    lines.push('');
    lines.push(`── ${mapName} (${mapId}) ${'─'.repeat(Math.max(0, 60 - width(mapName) - width(mapId)))}`);
    lines.push('');
    lines.push(renderGeneral(summary));
    lines.push('');
    lines.push(renderBonuses(summary));
    return lines.join('\n');
}

// --- Export CSV : une ligne par (carte, bonus) ------------------------------

const CSV_KEYS = [
    'mapId', 'games', 'finishedShare', 'avgTurnsPlayed', 'avgHousesBuilt', 'gamesWithHouseShare',
    'avgSoldiersBought', 'avgTreesChopped', 'avgChestsOpened', 'avgMerges', 'avgAttacks',
    'avgSacrifices', 'avgSacrificesWorthIt', 'avgSacrificesForNothing', 'gamesWithSacrificeShare',
    'avgFinalGold', 'avgTerritoryOwned',
    'bonusId', 'bonusLevel', 'bonusGamesWithPurchaseShare', 'bonusAvgCountPerGame', 'bonusAvgFirstTurn',
];

function csvField(v) {
    const s = v == null ? '' : String(cell(v));
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function renderCsv(results) {
    const rows = [];
    for (const [mapId, {summary}] of Object.entries(results)) {
        for (const b of BONUS_OFFERS) {
            const bs = summary.bonusSummary[b.id];
            rows.push({
                mapId,
                games: summary.games,
                finishedShare: summary.finishedShare,
                avgTurnsPlayed: summary.avgTurnsPlayed,
                avgHousesBuilt: summary.avgHousesBuilt,
                gamesWithHouseShare: summary.gamesWithHouseShare,
                avgSoldiersBought: summary.avgSoldiersBought,
                avgTreesChopped: summary.avgTreesChopped,
                avgChestsOpened: summary.avgChestsOpened,
                avgMerges: summary.avgMerges,
                avgAttacks: summary.avgAttacks,
                avgSacrifices: summary.avgSacrifices,
                avgSacrificesWorthIt: summary.avgSacrificesWorthIt,
                avgSacrificesForNothing: summary.avgSacrificesForNothing,
                gamesWithSacrificeShare: summary.gamesWithSacrificeShare,
                avgFinalGold: summary.avgFinalGold,
                avgTerritoryOwned: summary.avgTerritoryOwned,
                bonusId: b.id,
                bonusLevel: b.requiredLevel,
                bonusGamesWithPurchaseShare: bs.gamesWithPurchaseShare,
                bonusAvgCountPerGame: bs.avgCountPerGame,
                bonusAvgFirstTurn: bs.avgFirstTurn,
            });
        }
    }
    return [CSV_KEYS.join(','), ...rows.map((row) => CSV_KEYS.map((k) => csvField(row[k])).join(','))].join('\n');
}

// --- Point d'entrée ----------------------------------------------------------

function parseArgs(argv) {
    const opts = {games: 10, maxTurns: 100, seedStart: 1, mapIds: TEST_MAP_IDS, csv: false};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--csv') opts.csv = true;
        else if (arg === '--games') opts.games = Number(argv[++i]);
        else if (arg === '--turns') opts.maxTurns = Number(argv[++i]);
        else if (arg === '--seed') opts.seedStart = Number(argv[++i]);
        else if (arg === '--maps') opts.mapIds = argv[++i].split(',').map((s) => s.trim());
    }
    return opts;
}

const opts = parseArgs(process.argv.slice(2));

const unknown = opts.mapIds.filter((id) => !TEST_MAP_IDS.includes(id));
if (unknown.length) {
    console.error(`Carte(s) de test inconnue(s) : ${unknown.join(', ')}. Disponibles : ${TEST_MAP_IDS.join(', ')}.`);
    process.exitCode = 1;
} else {
    const results = runBotMetrics({
        mapIds: opts.mapIds,
        games: opts.games,
        seedStart: opts.seedStart,
        maxTurns: opts.maxTurns,
        difficulty: DEFAULT_DIFFICULTY,
    });

    if (opts.csv) {
        console.log(renderCsv(results));
    } else {
        console.log('');
        console.log(
            `  Niveau ${DEFAULT_DIFFICULTY} (Débutant) · ${opts.games} partie(s)/carte · ` +
                `plafond ${opts.maxTurns} tours · graines ${opts.seedStart}..${opts.seedStart + opts.games - 1}`
        );
        for (const mapId of opts.mapIds) {
            console.log(renderMap(mapId, mapNameOf(mapId), results[mapId].summary));
        }
        console.log('');
    }
}
