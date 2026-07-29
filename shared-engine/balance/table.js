// VUE AGRÉGÉE DE L'ÉQUILIBRAGE — lecture seule.
//
// Ce module ne DÉTIENT aucune valeur : il les IMPORTE des sources de vérité
// existantes (rules.js, items.js, soldier.js, units.js, trees.js, chests.js,
// settings.js) et les rassemble en un tableau plat unique, pour qu'on puisse
// lire d'un coup d'œil tous les coûts, entretiens, statistiques et probabilités
// du jeu — et repérer les valeurs hors barème.
//
// C'est un OUTIL, pas une pièce du moteur : ni le reducer, ni le front, ni le
// serveur ne doivent en dépendre. Déplacer une constante ici serait créer une
// seconde source de vérité — chaque valeur reste chez elle, avec le commentaire
// qui l'explique.
//
// Chaque ligne porte une colonne `tunable` : la clé de `settings` qui permet de
// redéfinir la valeur par partie, ou `null` quand la valeur est figée dans le
// code. C'est la carte de ce qui est réglable aujourd'hui — et donc de ce qu'il
// faudrait ouvrir pour pouvoir l'équilibrer par simulation.

import {
    MAX_MOVE,
    MERGE_MAX,
    BASE_INCOME,
    STARTING_GOLD,
    HOUSE_INCOME,
    SOLDIER_UPKEEP,
    SKELETON_UPKEEP,
    TOWER_UPKEEP,
    TREE_REWARD,
    TREE_MAX_RATIO,
    TREE_SPAWN_CHANCE,
    SOLDIER_HP_DEFAULT,
    SOLDIER_ATK_DEFAULT,
    SOLDIER_HP_MAX,
    SOLDIER_ATK_MAX,
    SOLDIER_LEVEL_STATS,
    BUILDING_STATS,
} from '../engine/rules.js';
import {DEFAULT_SETTINGS, resolveSettings} from '../engine/settings.js';
import {ITEMS, AFFINITY_ITEMS, SACRIFICE_POTION_ITEM, ITEM_COST} from '../data/items.js';
import {
    BONUS_OFFERS,
    upkeepFor,
    bonusPriceOf,
    bonusUpkeep,
    purchasedSoldierStats,
    soldierCostForLevel,
    KING_INCOME_MULT,
    LUMBERJACK_REWARD_MULT,
    ADVENTURER_CASE_REWARD,
    THIEF_ENEMY_CASE_REWARD,
    NINJA_MOVE_MULT,
    MONK_IDLE_REWARD,
    WARRIOR_KILL_REWARD,
    MAGICIAN_GOLD_REWARD,
    VAMPIRE_DRAIN,
    ALCHEMIST_ATK_BUFF,
    ALCHEMIST_HP_COST,
    PRIEST_HP_GIFT,
    PRIEST_HP_COST,
    WARLOCK_SUMMON_CHANCE,
    DRUID_TREES_REQUIRED,
    PALADIN_IDLE_TURNS,
} from '../data/soldier.js';
import {UNIT_KINDS} from '../data/units.js';
import {TREE_KINDS, TREE_RARITIES, treeReward} from '../data/trees.js';
import {LOOT_KINDS, LOOT_RARITIES} from '../data/chests.js';

// --- Petites aides de calcul ---------------------------------------------

// Rapport « or dépensé par point de statistique » : la mesure la plus directe du
// rendement d'un achat. `null` quand l'unité est gratuite ou sans statistique
// (une division par zéro ne dit rien).
const perStat = (cost, atk, hp) => {
    const points = (atk || 0) + (hp || 0);
    return points > 0 && cost > 0 ? cost / points : null;
};

// Rareté d'un poids d'apparition, d'après une table de tranches (arbres, butin).
// Même logique que `treeRarity` / `lootRarity`, mais appliquée à un poids nu.
const rarityOf = (table, weight) =>
    (table.find((r) => weight >= r.min) ?? table[table.length - 1]).label;

// Poids total d'un catalogue, pour convertir les coefficients en pourcentages.
const totalWeight = (kinds) => kinds.reduce((sum, k) => sum + k.weight, 0);

// Description courte de l'effet d'un butin (or, statistique, affinité, renfort).
const lootEffect = (k) => {
    if (k.gold) return `+${k.gold} or`;
    if (k.hp) return `+${k.hp} PV`;
    if (k.atk) return `+${k.atk} atk`;
    if (k.unit) return `unité « ${k.unit} »`;
    if (k.affinity) return `affinité ${k.affinity}`;
    return '—';
};

// --- Construction des sections -------------------------------------------

// Économie générale : les grandeurs qui fixent l'échelle de tous les prix.
function economySection(s) {
    const rows = [
        {label: 'Or de départ', value: s.startingGold, tunable: 'startingGold'},
        {label: 'Revenu de base / tour', value: s.baseIncome, tunable: 'baseIncome'},
        {label: 'Rendement d’une maison / tour', value: s.houseIncome, tunable: 'houseIncome'},
        {label: 'Or par arbre abattu (base)', value: s.treeReward, tunable: 'treeReward'},
        {label: 'Entretien d’un arbre sur son territoire', value: s.treeUpkeep, tunable: 'treeUpkeep'},
        {label: 'Multiplicateur maisons + territoire (bonus Roi)', value: `×${KING_INCOME_MULT}`, tunable: null},
        {label: 'Mode de victoire', value: s.victoryMode, tunable: 'victoryMode'},
        {label: 'Seuil de domination (%)', value: s.dominationPercent, tunable: 'dominationPercent'},
        {label: 'Objectif économique (or)', value: s.economyGoal, tunable: 'economyGoal'},
        {label: 'Tours maximum (0 = illimité)', value: s.maxTurns, tunable: 'maxTurns'},
    ];
    return {
        id: 'economy',
        title: 'Économie générale',
        note: 'Fixe l’échelle à laquelle tous les prix se lisent.',
        columns: [
            {key: 'label', label: 'Grandeur'},
            {key: 'value', label: 'Valeur', align: 'right'},
            {key: 'tunable', label: 'Réglable par'},
        ],
        rows,
    };
}

// Boutique : ce qui s'achète, ce que ça coûte à l'achat ET par tour. La colonne
// « amortissement » ne vaut que pour ce qui RAPPORTE (la maison) : nombre de
// tours au bout duquel l'achat est remboursé.
function shopSection(s) {
    const rows = [...ITEMS, ...AFFINITY_ITEMS, SACRIFICE_POTION_ITEM].map((item) => {
        const cost = s.itemCost?.[item.id] ?? item.cost;
        // Les affinités et la potion de sacrifice ne sont pas des unités posées :
        // aucun entretien.
        const upkeep = item.id in BUILDING_STATS || item.id === 'soldier'
            ? upkeepFor({type: item.id, level: 1}, s)
            : 0;
        const net = -upkeep; // positif = gain net par tour
        return {
            item: item.name,
            cost,
            upkeep,
            net,
            payback: net > 0 ? cost / net : null,
            tunable: `itemCost.${item.id}`,
        };
    });
    return {
        id: 'shop',
        title: 'Boutique — coût d’achat et coût par tour',
        note: 'Or net / tour : positif = l’unité rapporte, négatif = elle coûte. Amortissement en tours (maisons seulement).',
        columns: [
            {key: 'item', label: 'Item'},
            {key: 'cost', label: 'Achat', align: 'right'},
            {key: 'upkeep', label: 'Entretien', align: 'right'},
            {key: 'net', label: 'Or net / tour', align: 'right'},
            {key: 'payback', label: 'Amortissement', align: 'right'},
            {key: 'tunable', label: 'Réglable par'},
        ],
        rows,
    };
}

// Barème du soldat ordinaire par niveau : statistiques, prix d'achat direct,
// entretien, et les deux rapports qui disent si la progression est régulière.
function soldierSection(s) {
    const rows = [];
    for (let lvl = 1; lvl <= MERGE_MAX; lvl += 1) {
        const {atk, hp} = purchasedSoldierStats(lvl, s);
        const cost = soldierCostForLevel(lvl, s);
        const upkeep = upkeepFor({type: 'soldier', level: lvl}, s);
        rows.push({
            level: `lvl ${lvl}`,
            atk,
            hp,
            points: atk + hp,
            cost,
            upkeep,
            perStat: perStat(cost, atk, hp),
            upkeepPerStat: perStat(upkeep, atk, hp),
            tunable: `soldierAtk / soldierHp (lvl 1) · upkeep.soldier${lvl}`,
        });
    }
    return {
        id: 'soldiers',
        title: 'Soldat ordinaire — barème par niveau',
        note: 'Seul le niveau 1 est réglable ; les niveaux 2 à 5 en découlent par les proportions de SOLDIER_LEVEL_STATS.',
        columns: [
            {key: 'level', label: 'Niveau'},
            {key: 'atk', label: 'Atk', align: 'right'},
            {key: 'hp', label: 'PV', align: 'right'},
            {key: 'points', label: 'Points', align: 'right'},
            {key: 'cost', label: 'Achat', align: 'right'},
            {key: 'upkeep', label: 'Entretien', align: 'right'},
            {key: 'perStat', label: 'Or / point', align: 'right'},
            {key: 'upkeepPerStat', label: 'Entretien / point', align: 'right'},
            {key: 'tunable', label: 'Réglable par'},
        ],
        rows,
    };
}

// Structures : la base et les bâtiments posables, avec leurs statistiques de
// départ (ils naissent au maximum) et leur coût de possession.
function buildingSection(s) {
    const rows = Object.entries(BUILDING_STATS).map(([type, stats]) => {
        const cost = s.itemCost?.[type] ?? ITEM_COST[type] ?? null;
        const upkeep = upkeepFor({type}, s);
        return {
            type,
            hp: stats.hp,
            atk: stats.atk ?? 0,
            cost: cost ?? '—',
            upkeep,
            perStat: cost != null ? perStat(cost, stats.atk ?? 0, stats.hp) : null,
            tunable: type === 'house' ? 'houseIncome' : type === 'base' ? null : 'upkeep.tower',
        };
    });
    return {
        id: 'buildings',
        title: 'Structures — statistiques',
        note: 'Les PV / attaque des structures ne sont PAS réglables par partie (figés dans BUILDING_STATS).',
        columns: [
            {key: 'type', label: 'Structure'},
            {key: 'hp', label: 'PV', align: 'right'},
            {key: 'atk', label: 'Atk', align: 'right'},
            {key: 'cost', label: 'Achat', align: 'right'},
            {key: 'upkeep', label: 'Entretien', align: 'right'},
            {key: 'perStat', label: 'Or / point', align: 'right'},
            {key: 'tunable', label: 'Réglable par'},
        ],
        rows,
    };
}

// Bonus : le cœur de l'équilibrage. Statistiques imposées au porteur, prix,
// entretien, et le défi qui conditionne le déblocage.
function bonusSection(s) {
    const rows = BONUS_OFFERS.map((b) => {
        const price = bonusPriceOf(b, s);
        const upkeep = bonusUpkeep(b.id, s);
        const {atk, hp} = b.stats ?? {};
        return {
            label: b.label,
            level: b.requiredLevel,
            atk: atk ?? '—',
            hp: hp ?? '—',
            price: b.price == null ? 'défi seul' : price,
            upkeep,
            perStat: b.price == null ? null : perStat(price, atk, hp),
            challenge: b.challenge ? `${b.challenge.metric} ×${b.challenge.goal}` : '—',
            tunable: `bonusPrice.${b.id} · bonusUpkeep.${b.id}`,
        };
    });
    // Tri par niveau requis, puis par prix : les anomalies de barème sautent aux
    // yeux quand les bonus d'un même palier sont côte à côte.
    rows.sort((a, b) => a.level - b.level || (Number(a.price) || 0) - (Number(b.price) || 0));
    return {
        id: 'bonuses',
        title: 'Bonus — statistiques imposées, prix et défi',
        note: 'Les statistiques d’un bonus REMPLACENT celles du niveau. Prix et entretien sont réglables ; les statistiques et les objectifs de défi ne le sont pas.',
        columns: [
            {key: 'label', label: 'Bonus'},
            {key: 'level', label: 'Niv.', align: 'right'},
            {key: 'atk', label: 'Atk', align: 'right'},
            {key: 'hp', label: 'PV', align: 'right'},
            {key: 'price', label: 'Prix', align: 'right'},
            {key: 'upkeep', label: 'Entretien', align: 'right'},
            {key: 'perStat', label: 'Or / point', align: 'right'},
            {key: 'challenge', label: 'Défi'},
            {key: 'tunable', label: 'Réglable par'},
        ],
        rows,
    };
}

// Unités invoquées / envoûtées : elles ne s'achètent pas, mais pèsent sur le
// combat et parfois sur le revenu.
function unitSection(s) {
    const rows = UNIT_KINDS.map((k) => ({
        label: `${k.label} (${k.id})`,
        atk: k.atk,
        hp: k.hp,
        points: k.atk + k.hp,
        upkeep: k.upkeep ?? 0,
        origin: k.curseOf ? `envoûtement de « ${k.curseOf} »` : 'invocation / butin',
        tunable: k.unit === 'skeleton' || k.id === 'skeleton' ? 'upkeep.skeleton' : null,
    }));
    return {
        id: 'units',
        title: 'Unités invoquées et envoûtées',
        note: 'Aucune statistique n’est réglable par partie — y compris celle du dragon, l’unité la plus forte du jeu.',
        columns: [
            {key: 'label', label: 'Unité'},
            {key: 'atk', label: 'Atk', align: 'right'},
            {key: 'hp', label: 'PV', align: 'right'},
            {key: 'points', label: 'Points', align: 'right'},
            {key: 'upkeep', label: 'Entretien', align: 'right'},
            {key: 'origin', label: 'Origine'},
            {key: 'tunable', label: 'Réglable par'},
        ],
        rows,
    };
}

// Essences d'arbres : coefficient d'apparition et or réellement rapporté à la
// récompense de base configurée.
function treeSection(s) {
    const total = totalWeight(TREE_KINDS);
    const rows = TREE_KINDS.map((k) => ({
        label: k.label,
        weight: k.weight,
        pct: (k.weight / total) * 100,
        mult: `×${k.reward}`,
        gold: treeReward({kind: k.id}, s.treeReward),
        affinity: k.affinity ?? '—',
        rarity: rarityOf(TREE_RARITIES, k.weight),
        tunable: null,
    }));
    rows.sort((a, b) => b.weight - a.weight);
    return {
        id: 'trees',
        title: 'Essences d’arbres — apparition et récompense',
        note: 'Les coefficients d’apparition et les multiplicateurs de récompense ne sont pas réglables par partie. L’essence la plus rare porte le défi « Ninja ».',
        columns: [
            {key: 'label', label: 'Essence'},
            {key: 'weight', label: 'Poids', align: 'right'},
            {key: 'pct', label: '%', align: 'right'},
            {key: 'mult', label: 'Mult.', align: 'right'},
            {key: 'gold', label: 'Or réel', align: 'right'},
            {key: 'affinity', label: 'Affinité'},
            {key: 'rarity', label: 'Rareté'},
            {key: 'tunable', label: 'Réglable par'},
        ],
        rows,
    };
}

// Table de butin des coffres.
function lootSection() {
    const total = totalWeight(LOOT_KINDS);
    const rows = LOOT_KINDS.map((k) => ({
        label: k.label,
        weight: k.weight,
        pct: (k.weight / total) * 100,
        effect: lootEffect(k),
        rarity: rarityOf(LOOT_RARITIES, k.weight),
        tunable: null,
    }));
    rows.sort((a, b) => b.weight - a.weight);
    return {
        id: 'loot',
        title: 'Butin des coffres — table de tirage',
        note: 'Aucun poids ni montant n’est réglable par partie.',
        columns: [
            {key: 'label', label: 'Butin'},
            {key: 'weight', label: 'Poids', align: 'right'},
            {key: 'pct', label: '%', align: 'right'},
            {key: 'effect', label: 'Effet'},
            {key: 'rarity', label: 'Rareté'},
            {key: 'tunable', label: 'Réglable par'},
        ],
        rows,
    };
}

// Fréquences d'apparition : ce qui gouverne la quantité d'aléatoire par partie.
function spawnSection(s) {
    const rows = [
        {label: 'Arbres activés', value: s.treesEnabled, tunable: 'treesEnabled'},
        {label: 'Chance d’une vague d’arbres / tour (%)', value: s.treeSpawnChance, tunable: 'treeSpawnChance'},
        {label: 'Arbres par vague (min – max)', value: `${s.treeSpawnMin} – ${s.treeSpawnMax}`, tunable: 'treeSpawnMin / treeSpawnMax'},
        {label: 'Espérance d’arbres / tour', value: (s.treeSpawnChance / 100) * ((s.treeSpawnMin + s.treeSpawnMax) / 2), tunable: null},
        {label: 'Plafond d’arbres (% des cases)', value: s.treeDensity, tunable: 'treeDensity'},
        {label: 'Coffres activés', value: s.chestsEnabled, tunable: 'chestsEnabled'},
        {label: 'Chance d’un coffre / tour (%)', value: s.chestSpawnChance, tunable: 'chestSpawnChance'},
        {label: 'Coffres simultanés maximum', value: s.chestMax, tunable: 'chestMax'},
        {label: 'Arbres par fermier / tour (0–2, uniforme)', value: 1, tunable: null},
        {label: 'Chance d’invocation du démoniste / tour', value: WARLOCK_SUMMON_CHANCE, tunable: null},
    ];
    return {
        id: 'spawns',
        title: 'Apparitions et probabilités',
        note: 'L’espérance d’arbres par tour est le principal robinet d’or gratuit de la partie.',
        columns: [
            {key: 'label', label: 'Réglage'},
            {key: 'value', label: 'Valeur', align: 'right'},
            {key: 'tunable', label: 'Réglable par'},
        ],
        rows,
    };
}

// Constantes de règle et d'effet qui ne rentrent dans aucune autre famille.
function constantSection() {
    const rows = [
        {label: 'Déplacement maximum / tour', value: MAX_MOVE, source: 'rules.js', tunable: null},
        {label: 'Déplacement du Ninja', value: MAX_MOVE * NINJA_MOVE_MULT, source: 'soldier.js', tunable: null},
        {label: 'Niveau de fusion maximum', value: MERGE_MAX, source: 'rules.js', tunable: null},
        {label: 'Plafond de PV d’un soldat', value: SOLDIER_HP_MAX, source: 'rules.js', tunable: null},
        {label: 'Plafond d’attaque d’un soldat', value: SOLDIER_ATK_MAX, source: 'rules.js', tunable: null},
        {label: 'Multiplicateur d’or du Bûcheron', value: `×${LUMBERJACK_REWARD_MULT}`, source: 'soldier.js', tunable: null},
        {label: 'Or par case de l’Aventurier', value: ADVENTURER_CASE_REWARD, source: 'soldier.js', tunable: null},
        {label: 'Or par case volée du Voleur', value: THIEF_ENEMY_CASE_REWARD, source: 'soldier.js', tunable: null},
        {label: 'Prime par ennemi tué du Guerrier', value: WARRIOR_KILL_REWARD, source: 'soldier.js', tunable: null},
        {label: 'Prime par don du Magicien', value: MAGICIAN_GOLD_REWARD, source: 'soldier.js', tunable: null},
        {label: 'PV drainés par le Vampire / tour', value: VAMPIRE_DRAIN, source: 'soldier.js', tunable: null},
        {label: 'Alchimiste : atk donnée / PV payés', value: `${ALCHEMIST_ATK_BUFF} / ${ALCHEMIST_HP_COST}`, source: 'soldier.js', tunable: null},
        {label: 'Prêtre : PV donnés / PV payés', value: `${PRIEST_HP_GIFT} / ${PRIEST_HP_COST}`, source: 'soldier.js', tunable: null},
        {label: 'Arbres requis par le défi Druide', value: DRUID_TREES_REQUIRED, source: 'soldier.js', tunable: null},
        {label: 'Tours d’inaction du défi Paladin', value: PALADIN_IDLE_TURNS, source: 'soldier.js', tunable: null},
        {label: 'Prime d’inaction du Moine / tour', value: MONK_IDLE_REWARD, source: 'soldier.js', tunable: null},
    ];
    return {
        id: 'constants',
        title: 'Constantes de règle et d’effet',
        note: 'Toutes sont nommées et importées depuis leur fichier d’origine, mais aucune n’est encore réglable par partie.',
        columns: [
            {key: 'label', label: 'Constante'},
            {key: 'value', label: 'Valeur', align: 'right'},
            {key: 'source', label: 'Déclarée dans'},
            {key: 'tunable', label: 'Réglable par'},
        ],
        rows,
    };
}

// Écarts entre les barèmes de `rules.js` et les valeurs par défaut réellement
// appliquées (`DEFAULT_SETTINGS`). CALCULÉS, jamais saisis : la liste se met à
// jour toute seule quand une valeur bouge d'un côté ou de l'autre.
//
// Un écart n'est pas forcément un bug — mais une constante que plus personne ne
// lit, si.
function divergenceSection(s) {
    const compare = [
        ['Or de départ', 'STARTING_GOLD', STARTING_GOLD, 'startingGold', s.startingGold],
        ['Revenu de base', 'BASE_INCOME', BASE_INCOME, 'baseIncome', s.baseIncome],
        ['Rendement maison', 'HOUSE_INCOME', HOUSE_INCOME, 'houseIncome', s.houseIncome],
        ['Or par arbre', 'TREE_REWARD', TREE_REWARD, 'treeReward', s.treeReward],
        ['Densité d’arbres (%)', 'TREE_MAX_RATIO', TREE_MAX_RATIO * 100, 'treeDensity', s.treeDensity],
        ['Chance de vague (%)', 'TREE_SPAWN_CHANCE', TREE_SPAWN_CHANCE * 100, 'treeSpawnChance', s.treeSpawnChance],
        ['PV soldat lvl 1', 'SOLDIER_HP_DEFAULT', SOLDIER_HP_DEFAULT, 'soldierHp', s.soldierHp],
        ['Atk soldat lvl 1', 'SOLDIER_ATK_DEFAULT', SOLDIER_ATK_DEFAULT, 'soldierAtk', s.soldierAtk],
        ['Entretien tour', 'TOWER_UPKEEP', TOWER_UPKEEP, 'upkeep.tower', s.upkeep?.tower],
        ['Entretien squelette', 'SKELETON_UPKEEP', SKELETON_UPKEEP, 'upkeep.skeleton', s.upkeep?.skeleton],
    ];
    for (let lvl = 1; lvl <= MERGE_MAX; lvl += 1) {
        compare.push([
            `Entretien soldat lvl ${lvl}`,
            `SOLDIER_UPKEEP[${lvl}]`,
            SOLDIER_UPKEEP[lvl],
            `upkeep.soldier${lvl}`,
            s.upkeep?.[`soldier${lvl}`],
        ]);
    }
    for (const b of BONUS_OFFERS) {
        compare.push([`Prix « ${b.label} »`, `${b.id}.price`, b.price ?? 0, `bonusPrice.${b.id}`, s.bonusPrice?.[b.id]]);
        compare.push([`Entretien « ${b.label} »`, `${b.id}.upkeep`, b.upkeep ?? 0, `bonusUpkeep.${b.id}`, s.bonusUpkeep?.[b.id]]);
    }

    const rows = compare
        .filter(([, , ruleValue, , settingValue]) => ruleValue !== settingValue)
        .map(([label, ruleKey, ruleValue, settingKey, settingValue]) => ({
            label,
            ruleKey,
            ruleValue,
            settingKey,
            settingValue: settingValue ?? '(absent)',
        }));

    return {
        id: 'divergences',
        title: 'Écarts entre barème et réglages par défaut',
        note: 'Valeurs où la constante de rules.js et le défaut de DEFAULT_SETTINGS ne coïncident pas. C’est le réglage qui gagne : la constante n’est plus lue.',
        columns: [
            {key: 'label', label: 'Grandeur'},
            {key: 'ruleKey', label: 'Constante'},
            {key: 'ruleValue', label: 'Barème', align: 'right'},
            {key: 'settingKey', label: 'Réglage'},
            {key: 'settingValue', label: 'Appliqué', align: 'right'},
        ],
        rows,
    };
}

// --- API ------------------------------------------------------------------

// Tableau d'équilibrage complet pour un jeu de réglages donné (par défaut, ceux
// d'une partie neuve). Renvoie une liste de sections uniformes
// `{id, title, note, columns, rows}` — le format est volontairement neutre pour
// qu'un affichage console, un export CSV ou une page HTML puissent le consommer
// sans le connaître.
export function buildBalanceTable(settings = DEFAULT_SETTINGS) {
    const s = resolveSettings(settings);
    return [
        economySection(s),
        shopSection(s),
        soldierSection(s),
        buildingSection(s),
        bonusSection(s),
        unitSection(s),
        treeSection(s),
        lootSection(),
        spawnSection(s),
        constantSection(),
        divergenceSection(s),
    ];
}

// Aplatissement de toutes les sections en lignes homogènes `{section, ...row}` —
// pratique pour un export CSV ou un filtrage global (« montre-moi tout ce qui
// n'est pas réglable »).
export function flattenBalanceTable(sections = buildBalanceTable()) {
    return sections.flatMap((section) =>
        section.rows.map((row) => ({section: section.id, ...row}))
    );
}
