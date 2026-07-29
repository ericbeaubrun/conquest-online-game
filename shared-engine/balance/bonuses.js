// FICHE D'ÉQUILIBRAGE DES BONUS — outil de ligne de commande.
//
//   npm run bonus                 toutes les fiches, groupées par niveau
//   npm run bonus -- 2            un ou plusieurs niveaux
//   npm run bonus -- ninja moine  un ou plusieurs bonus (par id ou par libellé)
//   npm run bonus -- --table      vue compacte : une ligne par bonus
//   npm run bonus -- --csv        export CSV (une ligne par bonus)
//
// `npm run balance` donne une VUE D'ENSEMBLE de tout le jeu ; cette commande-ci
// ne parle que des bonus, mais dit tout d'eux d'un coup : statistiques imposées,
// prix, or/tour RÉEL (entretien du niveau compris — le seul chiffre que le joueur
// lit), amortissement, défi et effet. C'est le tableau qu'on garde ouvert à côté
// de l'éditeur quand on retouche un palier.
//
// Comme `table.js`, ce module ne DÉTIENT aucune valeur : tout vient de
// `data/soldier.js` et des réglages par défaut. Un chiffre qui s'y affiche est
// un chiffre que le moteur applique.

import {
    BONUS_OFFERS,
    bonusPriceOf,
    bonusUpkeep,
    bonusTotalUpkeep,
    soldierLevelUpkeep,
    challengeText,
} from '../data/soldier.js';
import {DEFAULT_SETTINGS} from '../engine/settings.js';
import {SOLDIER_LEVEL_STATS} from '../engine/rules.js';

// --- Mesures ---------------------------------------------------------------

// Horizon d'observation : le nombre de tours sur lequel on cumule les factures.
// Une partie se joue en quelques dizaines de tours ; dix suffisent à révéler
// qu'un bonus « pas cher » coûte en réalité trois fois son prix d'achat.
const HORIZON = 10;

// Soldat FICTIF servant à lire le texte des défis : aucune progression, aucun
// plateau. Les défis d'état renvoient donc 0 — exactement ce qu'on veut voir,
// l'énoncé du défi au départ.
const NEUF = {type: 'soldier', playerId: 'p1', level: 1, progress: {}};

// Toutes les mesures d'un bonus, pour un jeu de réglages donné.
function measure(bonus, settings) {
    const price = bonusPriceOf(bonus, settings);
    const surcharge = bonusUpkeep(bonus.id, settings); // surcoût PROPRE au bonus
    const level = soldierLevelUpkeep(bonus.requiredLevel, settings); // entretien du niveau
    const upkeep = bonusTotalUpkeep(bonus, settings); // facture réelle : positif = coût
    const {atk = 0, hp = 0} = bonus.stats ?? {};
    const points = atk + hp;
    const nu = SOLDIER_LEVEL_STATS[bonus.requiredLevel] ?? SOLDIER_LEVEL_STATS[1];

    return {
        id: bonus.id,
        label: bonus.label,
        level: bonus.requiredLevel,
        atk,
        hp,
        points,
        // Écart au soldat NU du même niveau : un bonus peut affaiblir son porteur
        // (le Voleur tombe à 1 PV), et c'est délibéré. Le voir chiffré évite de
        // lire un profil comme une amélioration alors qu'il en est une baisse.
        dAtk: atk - nu.atk,
        dHp: hp - nu.hp,
        price,
        surcharge,
        levelUpkeep: level,
        upkeep,
        // Or par point de statistique : la mesure la plus directe du rendement
        // d'achat. Nul pour un bonus gratuit ou sans profil imposé.
        perPoint: price > 0 && points > 0 ? price / points : null,
        // Coût TOTAL sur l'horizon : le prix d'achat plus les factures cumulées.
        // Négatif = le bonus s'est payé tout seul avant la fin de l'horizon.
        cost10: price + upkeep * HORIZON,
        // Tours nécessaires pour rembourser l'achat quand le bonus RAPPORTE
        // (entretien négatif). `null` quand il ne rapporte rien : il ne se
        // rembourse jamais par son seul entretien.
        breakEven: upkeep < 0 && price > 0 ? Math.ceil(price / -upkeep) : null,
        challenge: bonus.challenge ? `${bonus.challenge.metric} ×${bonus.challenge.goal}` : '—',
        challengeText: challengeText(NEUF, bonus, settings, null),
        effect: bonus.effect ?? '—',
        enabled: settings?.bonusEnabled?.[bonus.id] !== false,
    };
}

// --- Mise en forme ---------------------------------------------------------

const or = (n) => (n === 0 ? '0' : n > 0 ? `${n}` : `${n}`);
// L'or/tour se lit comme dans le panneau du joueur : POSITIF au catalogue
// signifie « prélevé », donc affiché « −N ». Recopier cette convention ici évite
// de régler un bonus à l'envers.
const parTour = (upkeep) =>
    upkeep === 0 ? '0 or/tour' : `${upkeep > 0 ? '−' : '+'}${Math.abs(upkeep)} or/tour`;
const prix = (m) => (m.price === 0 ? 'gratuit' : `${m.price} or`);
const signe = (n) => (n > 0 ? `+${n}` : String(n));
const arrondi = (n) => (n == null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(2));

const width = (s) => String(s).normalize('NFC').length;
const pad = (s, size, right = false) => {
    const fill = ' '.repeat(Math.max(0, size - width(s)));
    return right ? fill + s : s + fill;
};

// Fiche détaillée d'un bonus : tout ce qu'on doit savoir pour le juger.
function renderCard(m) {
    const lines = [];
    lines.push(`  ${m.label} (${m.id})${m.enabled ? '' : '  [DÉSACTIVÉ]'}`);
    lines.push(
        `    profil     ${m.atk}/${m.hp}  (${m.points} pts · ${signe(m.dAtk)} atk / ${signe(m.dHp)} PV face au soldat nu du niveau)`
    );
    lines.push(
        `    prix       ${prix(m)}${m.perPoint != null ? `  ·  ${arrondi(m.perPoint)} or/point` : ''}`
    );
    lines.push(
        `    or/tour    ${parTour(m.upkeep)}   (niveau ${or(m.levelUpkeep)} ${m.surcharge >= 0 ? '+' : '−'} bonus ${Math.abs(m.surcharge)})`
    );
    lines.push(
        `    sur ${HORIZON} t.  ${arrondi(m.cost10)} or au total${m.breakEven != null ? `  ·  remboursé en ${m.breakEven} tours` : ''}`
    );
    lines.push(`    défi       ${m.challenge}  —  ${m.challengeText}`);
    lines.push(`    effet      ${m.effect}`);
    return lines.join('\n');
}

// Vue compacte : une ligne par bonus, colonnes alignées.
const COLUMNS = [
    {key: 'level', label: 'Niv', right: true},
    {key: 'label', label: 'Bonus'},
    {key: 'atk', label: 'Atk', right: true},
    {key: 'hp', label: 'PV', right: true},
    {key: 'points', label: 'Pts', right: true},
    {key: 'price', label: 'Prix', right: true},
    {key: 'perPoint', label: 'Or/pt', right: true},
    {key: 'upkeep', label: 'Or/tour', right: true},
    {key: 'cost10', label: `Coût ${HORIZON}t`, right: true},
    {key: 'breakEven', label: 'Amorti', right: true},
    {key: 'challenge', label: 'Défi'},
];

function renderTable(rows) {
    const text = rows.map((m) =>
        COLUMNS.map((c) => {
            if (c.key === 'upkeep') return parTour(m.upkeep);
            if (c.key === 'price') return prix(m);
            if (c.key === 'perPoint' || c.key === 'cost10') return arrondi(m[c.key]);
            if (c.key === 'breakEven') return m.breakEven == null ? '—' : `${m.breakEven} t`;
            return String(m[c.key]);
        })
    );
    const sizes = COLUMNS.map((c, i) => Math.max(width(c.label), ...text.map((r) => width(r[i]))));
    const lines = [
        `  ${COLUMNS.map((c, i) => pad(c.label, sizes[i], c.right)).join('  ')}`,
        `  ${sizes.map((s) => '─'.repeat(s)).join('  ')}`,
    ];
    let level = null;
    text.forEach((row, i) => {
        // Un filet entre deux paliers : c'est À L'INTÉRIEUR d'un niveau que les
        // bonus se comparent (ils s'achètent en concurrence les uns des autres).
        if (level != null && rows[i].level !== level) lines.push('');
        level = rows[i].level;
        lines.push(`  ${row.map((v, j) => pad(v, sizes[j], COLUMNS[j].right)).join('  ')}`);
    });
    return lines.join('\n');
}

// Récapitulatif par niveau : la fourchette de prix et d'or/tour d'un palier.
// C'est là que se voient les paliers incohérents — un niveau dont le bonus le
// plus cher vaut moins que le moins cher du niveau précédent.
function renderSummary(rows) {
    const byLevel = new Map();
    for (const m of rows) {
        if (!byLevel.has(m.level)) byLevel.set(m.level, []);
        byLevel.get(m.level).push(m);
    }
    const lines = ['  Récapitulatif par niveau', ''];
    for (const [level, group] of [...byLevel].sort((a, b) => a[0] - b[0])) {
        const prices = group.map((m) => m.price);
        const upkeeps = group.map((m) => m.upkeep);
        const points = group.map((m) => m.points);
        const span = (arr) => `${Math.min(...arr)} → ${Math.max(...arr)}`;
        lines.push(
            `    niveau ${level} · ${group.length} bonus · prix ${span(prices)} or` +
                ` · or/tour ${span(upkeeps.map((u) => -u))} · points ${span(points)}`
        );
    }
    return lines.join('\n');
}

// --- Export CSV ------------------------------------------------------------

const CSV_KEYS = [
    'level', 'id', 'label', 'atk', 'hp', 'points', 'dAtk', 'dHp',
    'price', 'perPoint', 'surcharge', 'levelUpkeep', 'upkeep',
    'cost10', 'breakEven', 'challenge', 'challengeText', 'effect',
];

const csvField = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const renderCsv = (rows) =>
    [CSV_KEYS.join(','), ...rows.map((m) => CSV_KEYS.map((k) => csvField(m[k])).join(','))].join('\n');

// --- Point d'entrée --------------------------------------------------------

const args = process.argv.slice(2);
const wantCsv = args.includes('--csv');
const wantTable = args.includes('--table');
const filters = args.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase());

const settings = DEFAULT_SETTINGS;
const all = BONUS_OFFERS.map((b) => measure(b, settings)).sort(
    (a, b) => a.level - b.level || a.price - b.price
);

// Un filtre est soit un NIVEAU (chiffre), soit un id, soit un libellé — on ne
// demande pas à l'utilisateur de savoir lequel.
const rows = filters.length
    ? all.filter((m) =>
          filters.some((f) =>
              /^\d+$/.test(f) ? m.level === Number(f) : m.id.toLowerCase() === f || m.label.toLowerCase().startsWith(f)
          )
      )
    : all;

if (!rows.length) {
    console.error(
        `Aucun bonus ne correspond. Niveaux : ${[...new Set(all.map((m) => m.level))].join(', ')}. ` +
            `Identifiants : ${all.map((m) => m.id).join(', ')}.`
    );
    process.exitCode = 1;
} else if (wantCsv) {
    console.log(renderCsv(rows));
} else if (wantTable) {
    console.log('');
    console.log(renderTable(rows));
    console.log('');
    console.log(renderSummary(rows));
    console.log('');
} else {
    console.log('');
    let level = null;
    for (const m of rows) {
        if (m.level !== level) {
            level = m.level;
            console.log(`── Niveau ${level} ${'─'.repeat(64)}`);
            console.log('');
        }
        console.log(renderCard(m));
        console.log('');
    }
    console.log(renderSummary(rows));
    console.log('');
}
