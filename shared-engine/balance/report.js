// AFFICHAGE DU TABLEAU D'ÉQUILIBRAGE — outil de ligne de commande.
//
//   npm run balance                  toutes les sections, en tableaux alignés
//   npm run balance -- soldiers      une ou plusieurs sections, par identifiant
//   npm run balance -- --csv         export CSV (une ligne par valeur)
//   npm run balance -- --list        liste des identifiants de section
//
// Ne contient QUE de la mise en forme : toutes les données viennent de
// `table.js`, qui les dérive lui-même des fichiers du moteur.

import {buildBalanceTable, flattenBalanceTable} from './table.js';

// --- Mise en forme des valeurs -------------------------------------------

// Rendu d'une cellule : les décimales sont arrondies à deux chiffres (un
// « or / point » à 0,333333 n'apprend rien de plus que 0,33), les valeurs
// absentes deviennent un tiret lisible.
function cell(value) {
    if (value == null) return '—';
    if (typeof value === 'boolean') return value ? 'oui' : 'non';
    if (typeof value === 'number') {
        // On arrondit AVANT de tester l'entier : les pourcentages dérivés d'une
        // division (14/100 × 100 = 14.000000000000002) doivent s'afficher « 14 »
        // et non « 14.00 ».
        const rounded = Math.round(value * 100) / 100;
        return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
    }
    return String(value);
}

// Largeur d'affichage d'une chaîne. `String.length` compte les unités UTF-16 :
// suffisant ici (les libellés sont du texte latin accentué), mais on normalise
// pour que « é » composé ne compte pas double.
const width = (str) => str.normalize('NFC').length;

const pad = (str, size, align) => {
    const fill = ' '.repeat(Math.max(0, size - width(str)));
    return align === 'right' ? fill + str : str + fill;
};

// --- Rendu d'une section --------------------------------------------------

function renderSection(section) {
    const {title, note, columns, rows} = section;
    const lines = [];
    lines.push('');
    lines.push(`── ${title} ${'─'.repeat(Math.max(0, 76 - width(title)))}`);
    if (note) lines.push(`   ${note}`);
    lines.push('');

    if (!rows.length) {
        lines.push('   (aucune ligne)');
        return lines.join('\n');
    }

    // Chaque colonne prend la largeur de son contenu le plus long, en-tête
    // comprise : le tableau reste lisible quel que soit le jeu de réglages.
    const cells = rows.map((row) => columns.map((col) => cell(row[col.key])));
    const sizes = columns.map((col, i) =>
        Math.max(width(col.label), ...cells.map((row) => width(row[i])))
    );

    const header = columns.map((col, i) => pad(col.label, sizes[i], col.align)).join('  ');
    lines.push(`   ${header}`);
    lines.push(`   ${sizes.map((size) => '─'.repeat(size)).join('  ')}`);
    for (const row of cells) {
        lines.push(`   ${row.map((value, i) => pad(value, sizes[i], columns[i].align)).join('  ')}`);
    }
    return lines.join('\n');
}

// --- Export CSV -----------------------------------------------------------

// Échappement CSV minimal : guillemets doublés, champ encadré dès qu'il
// contient un séparateur, un guillemet ou un retour à la ligne.
function csvField(value) {
    const str = cell(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function renderCsv(sections) {
    const rows = flattenBalanceTable(sections);
    // Colonnes = union de toutes les clés rencontrées, `section` en tête pour
    // que le fichier reste triable par famille.
    const keys = ['section'];
    for (const row of rows) for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
    const lines = [keys.join(',')];
    for (const row of rows) lines.push(keys.map((key) => csvField(row[key])).join(','));
    return lines.join('\n');
}

// --- Point d'entrée -------------------------------------------------------

const args = process.argv.slice(2);
const wantCsv = args.includes('--csv');
const wantList = args.includes('--list');
const wanted = args.filter((a) => !a.startsWith('--'));

const all = buildBalanceTable();
const sections = wanted.length ? all.filter((s) => wanted.includes(s.id)) : all;

if (wantList) {
    console.log(all.map((s) => `${s.id.padEnd(14)} ${s.title} (${s.rows.length})`).join('\n'));
} else if (!sections.length) {
    console.error(`Section inconnue. Identifiants disponibles : ${all.map((s) => s.id).join(', ')}`);
    process.exitCode = 1;
} else if (wantCsv) {
    console.log(renderCsv(sections));
} else {
    console.log(sections.map(renderSection).join('\n'));
    console.log('');
}
