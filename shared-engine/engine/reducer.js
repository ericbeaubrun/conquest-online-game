// Reducer du jeu : fonction PURE (state, action) -> state. Toutes les règles
// de mutation vivent ici et nulle part ailleurs. C'est le point unique qui
// pourra être rejoué à l'identique côté serveur en mode « online ».

import {
    MOVE_SOLDIER,
    MERGE_SOLDIER,
    ATTACK_SOLDIER,
    CHOP_TREE,
    PLACE_ITEM,
    BUY_BONUS,
    END_TURN,
    SET_MAP,
    RESET_GAME,
} from './actions.js';
import {getLogicalBoard, createInitialState} from './board.js';
import {makeRng} from './rng.js';
import {computeReachable, incomeFor, checkVictory} from './selectors.js';
import {
    SOLDIER_HP_DEFAULT,
    SOLDIER_ATK_DEFAULT,
    SOLDIER_HP_MAX,
    SOLDIER_ATK_MAX,
    BUILDING_STATS,
    canMerge,
    mergedSoldier,
    combatResult,
    TREE_REWARD,
    TREE_MAX_RATIO,
} from './rules.js';
import {ITEM_COST} from '../data/items.js';
import {
    CHALLENGE_METRICS,
    BONUS_OFFERS,
    bonusPriceOf,
    isBonusUnlocked,
    SKELETON_SRC,
    SKELETON_HP,
    SKELETON_ATK,
    WARRIOR_HP,
    WARRIOR_ATK,
    WARRIOR_KILL_REWARD,
    ALCHEMIST_WEAK_HP,
    ALCHEMIST_ATK_BUFF,
    ALCHEMIST_HP_BUFF,
    KING_INCOME_MULT,
    isSkeleton,
    WARLOCK_HP,
    WARLOCK_ATK,
    SKELETON2_SRC,
    SKELETON2_HP,
    SKELETON2_ATK,
    WARLOCK_SUMMON_CHANCE,
    PALADIN_HP_REGEN,
    unlockedBonusIds,
    purchasedSoldierStats,
    soldierCostForLevel,
} from '../data/soldier.js';
import {getNeighbors, hexId} from '../data/hex.js';

// Fabrique un soldat neuf avec ses caractéristiques par défaut. Centralisé ici
// pour que toute création de soldat parte du même modèle (stats + specs).
function makeSoldier(playerId, uid, settings) {
    return {
        type: 'soldier',
        playerId,
        uid,
        level: 1,
        // PV / attaque de départ configurables (retombent sur les valeurs par défaut).
        hp: settings?.soldierHp ?? SOLDIER_HP_DEFAULT,
        atk: settings?.soldierAtk ?? SOLDIER_ATK_DEFAULT,
        affinity: null, // fire | ice | lightning | null
        bonus: null, // cupide | rapide | assaillant | protecteur | soigneur | bucheron | null
        behavior: null, // conquete | attaque | defense | arbre | renfort | null
        // Avancement des défis PROPRE à ce soldat (metric -> compteur). Sert à
        // débloquer les bonus. Voir CHALLENGE_METRICS dans soldier.js.
        progress: {},
    };
}

// Squelette invoqué par les bonus « Mort-vivant » (à la mort du porteur) et
// « Démoniste » (chaque tour). C'est un soldat allié à part entière (il se
// déplace, combat, compte pour le territoire) mais avec son propre sprite
// (`skin`) et des statistiques réduites. Il ne porte aucun bonus et ne peut donc
// pas en réinvoquer un autre. Les caractéristiques (skin/hp/atk) sont
// paramétrables pour distinguer les deux invocations.
function makeSkeleton(playerId, uid, {skin = SKELETON_SRC, hp = SKELETON_HP, atk = SKELETON_ATK} = {}) {
    return {
        type: 'soldier',
        unit: 'skeleton', // sous-type : occupe le plateau comme un soldat, mais
        playerId, //          ne fusionne pas et ne porte jamais de bonus.
        uid,
        level: 1,
        hp,
        atk,
        affinity: null,
        bonus: null,
        behavior: null,
        skin,
        progress: {},
    };
}

// Renvoie une COPIE du soldat avec un compteur de défi incrémenté. Pur : ne
// mute pas le soldat d'origine (l'objet `progress` est recréé).
function withProgress(soldier, metric, amount = 1) {
    const progress = {...soldier.progress, [metric]: (soldier.progress?.[metric] || 0) + amount};
    return {...soldier, progress};
}

// Déplacement (repositionnement dans le territoire ou conquête d'une case).
function reduceMove(state, {fromId, toId}) {
    const soldier = state.placements.get(fromId);
    if (!soldier || soldier.type !== 'soldier') return state;
    if (soldier.playerId !== state.activePlayerId) return state; // pas ton soldat
    if (state.movedSoldiers.has(soldier.uid)) return state; // déjà joué ce tour

    const board = getLogicalBoard(state.mapId);
    const reachable = computeReachable(state, board, fromId);
    const dest = reachable.moves.get(toId);
    if (!dest || (dest.kind !== 'move' && dest.kind !== 'conquer')) return state;

    // Avancement des défis du soldat : une conquête compte 1 case conquise ; un
    // repositionnement dans son territoire compte le nombre de cases parcourues.
    // Une case est « ennemie » quand elle appartient déjà à un adversaire (par
    // opposition à une case neutre encore inoccupée).
    const prevOwner = state.ownership.get(toId);
    const isEnemyCase = prevOwner != null && prevOwner !== state.activePlayerId;
    let moved = soldier;
    if (dest.kind === 'conquer') {
        moved = withProgress(moved, CHALLENGE_METRICS.CASES_CONQUERED, 1);
        if (isEnemyCase) {
            moved = withProgress(moved, CHALLENGE_METRICS.ENEMY_CASES_CONQUERED, 1);
        }
    } else {
        const steps = reachable.dist.get(toId) || 1;
        moved = withProgress(moved, CHALLENGE_METRICS.CASES_TRAVELED_OWN, steps);
    }

    // Orientation du sprite : le soldat regarde vers sa case de destination. Le
    // `x` d'une case ne dépendant que de `q`, un `q` de destination plus grand
    // signifie un déplacement vers la droite (sens par défaut), plus petit vers
    // la gauche. Un déplacement purement vertical (même `q`) conserve le sens.
    const fromQ = Number(fromId.split(',')[0]);
    const toQ = Number(toId.split(',')[0]);
    if (toQ !== fromQ) {
        moved = {...moved, facing: toQ > fromQ ? 'right' : 'left'};
    }

    const placements = new Map(state.placements);
    placements.delete(fromId);
    placements.set(toId, moved);
    let ownership = state.ownership;
    let gold = state.gold;
    if (dest.kind === 'conquer') {
        ownership = new Map(ownership);
        ownership.set(toId, state.activePlayerId);
        // Bonus « Aventurier » : récolte 1 or par case conquise. Bonus
        // « Voleur » : 1 or supplémentaire par case volée à un adversaire.
        let reward = 0;
        if (soldier.bonus === 'adventurer') reward += 1;
        if (soldier.bonus === 'thief' && isEnemyCase) reward += 1;
        if (reward > 0) {
            const purse = state.gold[state.activePlayerId] || 0;
            gold = {...state.gold, [state.activePlayerId]: purse + reward};
        }
    }
    const movedSoldiers = new Set(state.movedSoldiers).add(soldier.uid);
    return {...state, placements, ownership, gold, movedSoldiers};
}

// Fusion d'un soldat dans un soldat allié (niveau cumulé, plafonné).
function reduceMerge(state, {fromId, toId}) {
    const from = state.placements.get(fromId);
    if (!from || from.type !== 'soldier') return state;
    if (from.playerId !== state.activePlayerId) return state;
    if (state.movedSoldiers.has(from.uid)) return state;

    const board = getLogicalBoard(state.mapId);
    const dest = computeReachable(state, board, fromId).moves.get(toId);
    if (!dest || dest.kind !== 'merge') return state;

    const to = state.placements.get(toId);
    if (!to || to.playerId !== state.activePlayerId) return state;
    if (!canMerge(from, to)) return state; // niveaux différents ou cible au max

    let merged = mergedSoldier(from, to);
    // Défi « Alchimiste » : le soldat de niveau 2 issu de DEUX soldats affaiblis
    // (PV < seuil chacun) débloque le bonus. La progression voyage avec le
    // soldat fusionné (elle survit aux fusions suivantes via `mergedSoldier`).
    if (
        (merged.level || 1) === 2 &&
        (from.hp || 0) < ALCHEMIST_WEAK_HP &&
        (to.hp || 0) < ALCHEMIST_WEAK_HP
    ) {
        merged = withProgress(merged, CHALLENGE_METRICS.ALCHEMIST_MERGE, 1);
    }

    const placements = new Map(state.placements);
    placements.delete(fromId);
    placements.set(toId, merged);
    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return {...state, placements, movedSoldiers};
}

// Case d'approche au CORPS À CORPS : la plus proche case *où le soldat peut se
// tenir* (cases parcourues par le BFS, `dist`) qui soit adjacente à la cible
// `toId`. Comme la case de départ est dans `dist` (distance 0), un soldat déjà
// collé à la cible garde sa case ; sinon on renvoie la case libre voisine la
// plus proche. Renvoie `null` si aucune case d'approche n'est atteignable.
function approachCell(board, reachable, fromId, toId) {
    const target = board.cellMap.get(toId);
    if (!target) return fromId;
    let bestId = null;
    let bestDist = Infinity;
    for (const n of getNeighbors(target.q, target.r)) {
        const nid = hexId(n.q, n.r);
        const d = reachable.dist.get(nid);
        if (d != null && d < bestDist) {
            bestDist = d;
            bestId = nid;
        }
    }
    return bestId;
}

// Combat : le soldat actif attaque une cible ennemie. Le combat est au CORPS À
// CORPS — si le soldat n'est pas déjà collé à la cible, il se déplace d'abord
// sur la case libre adjacente à la cible la plus proche qu'il puisse atteindre
// (plus d'attaque à distance). Les deux unités se retirent alors mutuellement
// des PV (égaux à l'attaque adverse) ; celles tombées à 0 meurent (retirées du
// plateau). L'attaquant frappe depuis sa case d'approche et son tour est consommé.
function reduceAttack(state, {fromId, toId}) {
    const from = state.placements.get(fromId);
    if (!from || from.type !== 'soldier') return state;
    if (from.playerId !== state.activePlayerId) return state;
    if (state.movedSoldiers.has(from.uid)) return state;

    const board = getLogicalBoard(state.mapId);
    const reachable = computeReachable(state, board, fromId);
    const dest = reachable.moves.get(toId);
    if (!dest || dest.kind !== 'combat') return state;

    const target = board.cellMap.get(toId);
    const attackFromId = approachCell(board, reachable, fromId, toId);
    if (attackFromId == null) return state; // aucune approche possible

    // Oriente le soldat vers sa cible depuis sa case d'approche (comme un déplacement).
    let mover = from;
    const attackQ = Number(attackFromId.split(',')[0]);
    if (target && target.q !== attackQ) {
        mover = {...mover, facing: target.q > attackQ ? 'right' : 'left'};
    }

    // La cible peut être un soldat, une structure posée (maison / tour) OU une
    // base ennemie. La base n'est pas un item de `placements` : on synthétise son
    // unité de combat à partir de ses PV courants (`baseHp`, défaut = PV pleins).
    const isBaseTarget = board.baseIds.has(toId) && !state.destroyedBases?.has(toId);
    let to;
    if (isBaseTarget) {
        const owner = state.ownership.get(toId);
        if (owner === state.activePlayerId) return state; // pas sa propre base
        const hp = state.baseHp?.[toId] ?? BUILDING_STATS.base.hp;
        to = {type: 'base', playerId: owner, hp};
    } else {
        to = state.placements.get(toId);
        if (!to || to.playerId === state.activePlayerId) return state;
    }

    const {attacker, defender} = combatResult(mover, to);
    const placements = new Map(state.placements);
    // Le soldat quitte toujours sa case de départ : il a pu s'approcher au corps
    // à corps et/ou il va AVANCER sur la case de la cible qu'il tue (voir plus
    // bas). `settle` le repositionne ensuite sur sa case finale.
    placements.delete(fromId);
    let uidSeq = state.uidSeq;

    // Applique l'issue du combat sur une case : l'unité survivante garde ses PV
    // à jour ; l'unité morte quitte le plateau, sauf « Mort-vivant » qui laisse
    // un squelette allié (5/10) sur sa case. Renvoie l'unité morte (ou null).
    const settle = (id, unit, outcome) => {
        if (!outcome.dead) {
            let survivor = {...unit, hp: outcome.hp};
            // Défi « Guerrier » : chaque combat terminé en vie compte pour un soldat.
            if (unit.type === 'soldier') {
                survivor = withProgress(survivor, CHALLENGE_METRICS.COMBATS_SURVIVED, 1);
            }
            placements.set(id, survivor);
            return null;
        }
        if (unit.type === 'soldier' && unit.bonus === 'undead') {
            uidSeq += 1;
            placements.set(id, makeSkeleton(unit.playerId, `s${uidSeq}`));
        } else {
            placements.delete(id);
        }
        return unit;
    };

    // Règlement de la cible D'ABORD (avant l'attaquant) pour savoir si sa case se
    // libère : une base met à jour ses PV persistants (`baseHp`) et rejoint
    // `destroyedBases` si elle tombe — sa case redeviendra alors normale
    // (conquérable). Les autres structures et les soldats passent par `settle`.
    let baseHp = state.baseHp;
    let destroyedBases = state.destroyedBases;
    let deadDefender = null;
    if (isBaseTarget) {
        if (defender.dead) {
            destroyedBases = new Set(state.destroyedBases || []).add(toId);
            baseHp = {...state.baseHp};
            delete baseHp[toId];
            deadDefender = to;
        } else {
            baseHp = {...state.baseHp, [toId]: defender.hp};
        }
    } else {
        deadDefender = settle(toId, to, defender);
    }

    // Avancée : si la cible meurt et que sa case est désormais LIBRE (aucun
    // squelette « mort-vivant » laissé sur place, base rasée), l'attaquant
    // survivant s'y installe au lieu de rester sur sa case d'approche. Sinon il
    // reste collé à la cible.
    const targetFreed = !attacker.dead && defender.dead && !placements.has(toId);
    const attackerFinalId = targetFreed ? toId : attackFromId;
    settle(attackerFinalId, mover, attacker);

    // La case prise en avançant devient la propriété de l'attaquant : un soldat
    // se tient toujours sur son propre territoire (même invariant qu'une conquête).
    let ownership = state.ownership;
    if (targetFreed && state.ownership.get(toId) !== state.activePlayerId) {
        ownership = new Map(state.ownership);
        ownership.set(toId, state.activePlayerId);
    }

    // Défi « Mort-vivant » : tuer un soldat ennemi de niveau ≥ 2. Crédité à
    // l'attaquant seulement s'il survit (sinon sa progression disparaît avec lui).
    if (
        !attacker.dead &&
        deadDefender?.type === 'soldier' &&
        (deadDefender.level || 1) >= 2
    ) {
        const alive = placements.get(attackerFinalId);
        if (alive?.uid === from.uid) {
            placements.set(attackerFinalId, withProgress(alive, CHALLENGE_METRICS.ENEMIES_KILLED_L2, 1));
        }
    }

    // Défi & bonus « Chevalier noir » : tuer un squelette au combat le crédite
    // (débloque le bonus), et un chevalier noir équipé ABSORBE ses statistiques
    // (les additionne aux siennes, comme une fusion, plafonnées).
    if (!attacker.dead && isSkeleton(deadDefender)) {
        const alive = placements.get(attackerFinalId);
        if (alive?.uid === from.uid) {
            let knight = withProgress(alive, CHALLENGE_METRICS.SKELETONS_KILLED, 1);
            if (from.bonus === 'blackKnight') {
                knight = {
                    ...knight,
                    hp: Math.min((knight.hp || 0) + (to.hp || 0), SOLDIER_HP_MAX),
                    atk: Math.min((knight.atk || 0) + (to.atk || 0), SOLDIER_ATK_MAX),
                };
            }
            placements.set(attackerFinalId, knight);
        }
    }

    // Bonus « Guerrier » : tuer un ennemi (soldat ou tour) rapporte une prime,
    // à condition que l'attaquant survive au combat.
    let gold = state.gold;
    if (from.bonus === 'warrior' && !attacker.dead && deadDefender) {
        const purse = state.gold[state.activePlayerId] || 0;
        gold = {...state.gold, [state.activePlayerId]: purse + WARRIOR_KILL_REWARD};
    }

    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return {...state, placements, ownership, gold, movedSoldiers, uidSeq, baseHp, destroyedBases};
}

// Abattage d'un arbre : comme le combat, c'est une action au CORPS À CORPS. Si
// le soldat n'est pas déjà collé à l'arbre, il se déplace d'abord sur la case
// libre adjacente la plus proche, puis abat l'arbre. Le joueur gagne aussitôt de
// l'or et le tour du soldat est consommé.
function reduceChop(state, {fromId, toId}) {
    const from = state.placements.get(fromId);
    if (!from || from.type !== 'soldier') return state;
    if (from.playerId !== state.activePlayerId) return state;
    if (state.movedSoldiers.has(from.uid)) return state;

    const board = getLogicalBoard(state.mapId);
    const reachable = computeReachable(state, board, fromId);
    const dest = reachable.moves.get(toId);
    if (!dest || dest.kind !== 'chop') return state;

    const tree = state.placements.get(toId);
    if (!tree || tree.type !== 'tree') return state;

    // Case d'où abattre l'arbre : la case du soldat s'il est déjà collé, sinon la
    // case libre adjacente à l'arbre la plus proche qu'il puisse atteindre.
    const chopFromId = approachCell(board, reachable, fromId, toId);
    if (chopFromId == null) return state; // aucune approche possible

    // Avancement des défis : +1 arbre abattu, et +1 si l'arbre était sur une
    // case possédée par un adversaire (territoire ennemi).
    let chopper = withProgress(from, CHALLENGE_METRICS.TREES_CHOPPED, 1);
    const treeOwner = state.ownership.get(toId);
    if (treeOwner != null && treeOwner !== state.activePlayerId) {
        chopper = withProgress(chopper, CHALLENGE_METRICS.ENEMY_TREES_CHOPPED, 1);
    }

    // Oriente le bûcheron vers l'arbre depuis sa case d'approche.
    const target = board.cellMap.get(toId);
    const chopQ = Number(chopFromId.split(',')[0]);
    if (target && target.q !== chopQ) {
        chopper = {...chopper, facing: target.q > chopQ ? 'right' : 'left'};
    }

    const placements = new Map(state.placements);
    placements.delete(toId); // l'arbre abattu disparaît
    placements.delete(fromId); // le soldat quitte sa case de départ
    placements.set(toId, chopper); // il AVANCE sur la case de l'arbre abattu
    // La case prise devient sa propriété : un soldat se tient toujours sur son
    // propre territoire (même invariant qu'une conquête).
    let ownership = state.ownership;
    if (state.ownership.get(toId) !== state.activePlayerId) {
        ownership = new Map(state.ownership);
        ownership.set(toId, state.activePlayerId);
    }
    // Récompense configurable ; le bonus « Bûcheron » la double.
    const baseReward = state.settings?.treeReward ?? TREE_REWARD;
    const reward = from.bonus === 'lumberjack' ? baseReward * 2 : baseReward;
    const purse = state.gold[state.activePlayerId] || 0;
    const gold = {...state.gold, [state.activePlayerId]: purse + reward};
    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return {...state, placements, ownership, gold, movedSoldiers};
}

// Apparition d'arbres en fin de tour. Chaque tour, une « vague » d'arbres a une
// certaine probabilité de survenir (`treeSpawnChance`) ; le cas échéant, elle
// pose entre `treeSpawnMin` et `treeSpawnMax` arbres. Le tout reste borné par le
// plafond global (`treeDensity` de la carte). Renvoie la nouvelle carte des items
// (inchangée si rien n'apparaît).
function spawnTrees(state, board, rng) {
    const s = state.settings;
    // Apparition des arbres désactivable en configuration.
    if (s && s.treesEnabled === false) return state.placements;
    // Densité maximale configurable (pourcentage → ratio) ; défaut = barème.
    const ratio = s?.treeDensity != null ? s.treeDensity / 100 : TREE_MAX_RATIO;
    const cap = Math.floor(board.cells.length * ratio);
    let treeCount = 0;
    for (const p of state.placements.values()) if (p.type === 'tree') treeCount += 1;
    const room = cap - treeCount;
    if (room <= 0) return state.placements;

    // Probabilité qu'une vague apparaisse ce tour (0..1).
    const chance = (s?.treeSpawnChance ?? 50) / 100;
    if (rng.next() >= chance) return state.placements;
    // Nombre d'arbres de la vague : entier tiré dans [min, max] (min ≤ max).
    const min = Math.max(0, s?.treeSpawnMin ?? 0);
    const max = Math.max(min, s?.treeSpawnMax ?? 2);
    let want = min + rng.int(max - min + 1);
    want = Math.min(want, room);
    if (want <= 0) return state.placements;

    // Cases éligibles : libres, non bloquées (eau), hors base.
    const eligible = board.cells.filter(
        (c) => !c.blocked && !board.baseIds.has(c.id) && !state.placements.has(c.id)
    );
    if (!eligible.length) return state.placements;

    const placements = new Map(state.placements);
    for (let i = 0; i < want && eligible.length; i += 1) {
        const idx = rng.int(eligible.length);
        const [cell] = eligible.splice(idx, 1);
        placements.set(cell.id, {type: 'tree'});
    }
    return placements;
}

// Bonus « Fermier » : chaque soldat-fermier du joueur actif fait apparaître 0 à
// 2 arbres sur des cases collées à SON territoire (frontière), indépendamment du
// système d'apparition normal (n'entre pas dans le plafond / la montée en
// intensité). Prend la carte des items déjà mise à jour par `spawnTrees`.
function spawnFarmerTrees(state, board, placementsIn, rng) {
    // Rien à faire si les arbres sont désactivés en configuration.
    if (state.settings && state.settings.treesEnabled === false) return placementsIn;
    const pid = state.activePlayerId;
    // Combien de soldats-fermiers possède le joueur actif ?
    let farmers = 0;
    for (const p of placementsIn.values()) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === 'farmer') farmers += 1;
    }
    if (farmers === 0) return placementsIn;

    // Cases frontalières INTÉRIEURES : possédées par le joueur, libres, non
    // bloquées, hors base, et bordant au moins une case qui n'est PAS à lui
    // (l'arbre pousse donc du côté intérieur de la frontière, pas à l'extérieur).
    const eligible = board.cells.filter((c) => {
        if (c.blocked || board.baseIds.has(c.id) || placementsIn.has(c.id)) return false;
        if (state.ownership.get(c.id) !== pid) return false; // seulement sur son sol
        return getNeighbors(c.q, c.r).some((n) => state.ownership.get(hexId(n.q, n.r)) !== pid);
    });
    if (!eligible.length) return placementsIn;

    const placements = new Map(placementsIn);
    for (let f = 0; f < farmers; f += 1) {
        const want = rng.int(3); // 0, 1 ou 2 arbres
        for (let i = 0; i < want && eligible.length; i += 1) {
            const idx = rng.int(eligible.length);
            const [cell] = eligible.splice(idx, 1); // case consommée (un arbre max)
            placements.set(cell.id, {type: 'tree'});
        }
    }
    return placements;
}

// Bonus « Alchimiste » : à la fin du tour de son propriétaire, chaque alchimiste
// renforce UN allié adjacent — le soldat allié voisin sans affinité ayant le
// plus de PV — de +1 attaque et +2 PV (plafonnés). Chaque alchimiste agit sur sa
// propre cible ; un même allié peut cumuler les buffs de plusieurs alchimistes.
function applyAlchemists(state, board, placementsIn) {
    const pid = state.activePlayerId;
    // Repère les cases des alchimistes du joueur actif via la géométrie de la carte.
    const alchemistCells = [];
    for (const [id, p] of placementsIn) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === 'alchemist') {
            alchemistCells.push(id);
        }
    }
    if (!alchemistCells.length) return placementsIn;

    const placements = new Map(placementsIn);
    for (const id of alchemistCells) {
        const cell = board.cellMap.get(id);
        if (!cell) continue;
        // Cibles éligibles : soldats alliés adjacents SANS affinité (jamais soi-même).
        let bestId = null;
        let bestHp = -1;
        for (const n of getNeighbors(cell.q, cell.r)) {
            const nid = hexId(n.q, n.r);
            const ally = placements.get(nid);
            if (
                ally &&
                ally.type === 'soldier' &&
                ally.playerId === pid &&
                ally.affinity == null &&
                (ally.hp || 0) > bestHp
            ) {
                bestHp = ally.hp || 0;
                bestId = nid;
            }
        }
        if (bestId == null) continue;
        const ally = placements.get(bestId);
        placements.set(bestId, {
            ...ally,
            hp: Math.min((ally.hp || 0) + ALCHEMIST_HP_BUFF, SOLDIER_HP_MAX),
            atk: Math.min((ally.atk || 0) + ALCHEMIST_ATK_BUFF, SOLDIER_ATK_MAX),
        });
    }
    return placements;
}

// Bonus « Démoniste » : à la fin du tour de son propriétaire, chaque démoniste
// invoque un squelette allié fragile (skeleton2, 10/1) sur une case voisine
// CONQUISE par le joueur (libre, non bloquée, hors base). L'invocation n'est pas
// systématique : elle a une chance fixe de se produire chaque tour. Renvoie la
// carte des items et le compteur d'uid mis à jour.
function spawnWarlockSkeletons(state, board, placementsIn, uidSeqIn, rng) {
    const pid = state.activePlayerId;
    const warlockCells = [];
    for (const [id, p] of placementsIn) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === 'warlock') {
            warlockCells.push(id);
        }
    }
    if (!warlockCells.length) return {placements: placementsIn, uidSeq: uidSeqIn};

    const placements = new Map(placementsIn);
    let uidSeq = uidSeqIn;
    for (const id of warlockCells) {
        const cell = board.cellMap.get(id);
        if (!cell) continue;
        // Tirage : l'invocation ne se déclenche qu'avec une certaine probabilité.
        if (rng.next() >= WARLOCK_SUMMON_CHANCE) continue;
        // Première case voisine accueillante ET possédée par le joueur.
        const spot = getNeighbors(cell.q, cell.r)
            .map((n) => hexId(n.q, n.r))
            .find((nid) => {
                const ncell = board.cellMap.get(nid);
                return (
                    ncell &&
                    !ncell.blocked &&
                    !board.baseIds.has(nid) &&
                    !placements.has(nid) &&
                    state.ownership.get(nid) === pid
                );
            });
        if (!spot) continue;
        uidSeq += 1;
        placements.set(
            spot,
            makeSkeleton(pid, `s${uidSeq}`, {
                skin: SKELETON2_SRC,
                hp: SKELETON2_HP,
                atk: SKELETON2_ATK,
            })
        );
    }
    return {placements, uidSeq};
}

// Bonus « Paladin » : à la fin du tour de son propriétaire, chaque paladin
// régénère quelques PV (plafonnés au maximum d'un soldat).
function healPaladins(state, placementsIn) {
    const pid = state.activePlayerId;
    let placements = null; // copié à la volée seulement si un paladin soigne
    for (const [id, p] of placementsIn) {
        if (p.type !== 'soldier' || p.playerId !== pid || p.bonus !== 'paladin') continue;
        const healed = Math.min((p.hp || 0) + PALADIN_HP_REGEN, SOLDIER_HP_MAX);
        if (healed === p.hp) continue;
        if (!placements) placements = new Map(placementsIn);
        placements.set(id, {...p, hp: healed});
    }
    return placements || placementsIn;
}

// Pose d'un item (soldat, maison, tour) sur une case du territoire actif.
function reducePlace(state, {cellId, itemType, level = 1}) {
    const board = getLogicalBoard(state.mapId);
    const cell = board.cellMap.get(cellId);
    if (!cell || cell.blocked || board.baseIds.has(cellId)) return state;
    if (state.ownership.get(cellId) !== state.activePlayerId) return state;
    if (state.placements.has(cellId)) return state; // case déjà occupée

    // Achat : le joueur actif doit avoir assez d'or ; le coût est débité. Le prix
    // de chaque item est configurable (retombe sur le barème par défaut). Pour un
    // soldat, le niveau acheté fixe le prix (doublé à chaque niveau).
    const cost = itemType === 'soldier'
        ? soldierCostForLevel(level, state.settings)
        : (state.settings?.itemCost?.[itemType] ?? ITEM_COST[itemType] ?? 0);
    const purse = state.gold[state.activePlayerId] || 0;
    if (purse < cost) return state; // fonds insuffisants

    const placements = new Map(state.placements);
    let uidSeq = state.uidSeq;
    let item;
    if (itemType === 'soldier') {
        uidSeq += 1;
        item = makeSoldier(state.activePlayerId, `s${uidSeq}`, state.settings);
        // Soldat de niveau > 1 acheté directement : on lui applique les stats du
        // niveau (équivalentes à des fusions successives).
        const stats = purchasedSoldierStats(level, state.settings);
        item.level = stats.level;
        item.hp = stats.hp;
        item.atk = stats.atk;
    } else {
        const stats = BUILDING_STATS[itemType];
        item = {type: itemType, playerId: state.activePlayerId, hp: stats?.hp ?? 0};
        if (stats?.atk != null) item.atk = stats.atk; // tours : attaque de riposte
    }
    placements.set(cellId, item);
    const gold = {...state.gold, [state.activePlayerId]: purse - cost};
    return {...state, placements, gold, uidSeq};
}

// Achat/équipement d'un bonus pour un soldat. Conditions : c'est bien le soldat
// du joueur actif, le défi du bonus est accompli, le soldat n'a pas déjà un
// bonus (un seul par soldat) et le joueur a de quoi payer. Le prix est débité et
// le soldat prend le bonus (son sprite change côté affichage).
function reduceBuyBonus(state, {cellId, bonusId}) {
    if (state.settings && state.settings.bonusesEnabled === false) return state; // bonus désactivés
    const soldier = state.placements.get(cellId);
    if (!soldier || soldier.type !== 'soldier') return state;
    if (isSkeleton(soldier)) return state; // un squelette ne porte jamais de bonus
    if (soldier.playerId !== state.activePlayerId) return state;
    if (soldier.bonus) return state; // déjà un bonus

    if (state.settings?.bonusEnabled?.[bonusId] === false) return state; // bonus désactivé
    const bonus = BONUS_OFFERS.find((b) => b.id === bonusId);
    if (!bonus || bonus.requiredLevel !== (soldier.level || 1)) return state;
    if (!isBonusUnlocked(soldier, bonus)) return state; // défi non accompli

    const price = bonusPriceOf(bonus, state.settings); // prix configurable
    const purse = state.gold[state.activePlayerId] || 0;
    if (purse < price) return state; // fonds insuffisants

    // Bonus « Guerrier » : équiper le bonus porte aussitôt les statistiques du
    // soldat à leur nouveau palier.
    const equipped = {...soldier, bonus: bonusId};
    if (bonusId === 'warrior') {
        equipped.hp = WARRIOR_HP;
        equipped.atk = WARRIOR_ATK;
    } else if (bonusId === 'warlock') {
        equipped.hp = WARLOCK_HP;
        equipped.atk = WARLOCK_ATK;
    }

    const placements = new Map(state.placements);
    placements.set(cellId, equipped);
    const gold = {...state.gold, [state.activePlayerId]: purse - price};
    return {...state, placements, gold};
}

// Fin de tour : le joueur actif encaisse son revenu, puis la main passe au
// suivant. Un tour complet écoulé (retour au premier joueur) incrémente le
// compteur, et chaque soldat retrouve son droit de déplacement.
function reduceEndTurn(state) {
    const {players, activePlayerId} = state;
    const idx = players.findIndex((p) => p.id === activePlayerId);
    const nextIdx = (idx + 1) % players.length;
    let income = incomeFor(state, activePlayerId); // net de l'entretien des unités
    // Bonus « Roi » : tant qu'un soldat-roi du joueur est en vie, +50% de revenu.
    let hasKing = false;
    for (const p of state.placements.values()) {
        if (p.type === 'soldier' && p.playerId === activePlayerId && p.bonus === 'king') {
            hasKing = true;
            break;
        }
    }
    if (hasKing) income = Math.floor(income * KING_INCOME_MULT);
    const board = getLogicalBoard(state.mapId);
    // Générateur aléatoire déterministe repris à la graine courante de l'état.
    // Toutes les apparitions/invocations de ce tour puisent dans ce flux, puis
    // on persiste la graine avancée pour que le prochain tour continue la suite.
    const rng = makeRng(state.rngSeed);
    // Apparition normale des arbres, puis apparition « Fermier » (frontière).
    let placements = spawnTrees(state, board, rng);
    placements = spawnFarmerTrees(state, board, placements, rng);
    // Renfort « Alchimiste » sur les alliés adjacents avant de passer la main.
    placements = applyAlchemists(state, board, placements);
    // Régénération « Paladin ».
    placements = healPaladins(state, placements);
    // Invocation « Démoniste » : un squelette fragile par démoniste.
    const summon = spawnWarlockSkeletons(state, board, placements, state.uidSeq, rng);
    placements = summon.placements;
    // Acquittement des notifications de bonus : les bonus débloqués et réclamables
    // des soldats du joueur qui vient de jouer rejoignent leur `bonusSeen`. La
    // notification ne réapparaîtra donc plus, même si le bonus reste non réclamé.
    const acked = new Map(placements);
    for (const [id, p] of acked) {
        if (p.type !== 'soldier' || p.playerId !== activePlayerId) continue;
        const ids = unlockedBonusIds(p, state.settings, state.settings?.bonusesEnabled !== false);
        const fresh = ids.filter((bid) => !p.bonusSeen?.includes(bid));
        if (fresh.length) {
            acked.set(id, {...p, bonusSeen: [...(p.bonusSeen || []), ...fresh]});
        }
    }
    placements = acked;
    return {
        ...state,
        placements,
        uidSeq: summon.uidSeq,
        rngSeed: rng.seed, // graine avancée : la suite de la partie reste déterministe
        gold: {...state.gold, [activePlayerId]: (state.gold[activePlayerId] || 0) + income},
        turn: nextIdx === 0 ? state.turn + 1 : state.turn,
        activePlayerId: players[nextIdx].id,
        movedSoldiers: new Set(),
    };
}

export function gameReducer(state, action) {
    // Réinitialisation d'une carte (menu latéral) : repart des joueurs/réglages
    // par défaut de la carte. Rejouer la partie courante conserve, lui, la
    // configuration choisie (mêmes joueurs, mêmes réglages).
    if (action.type === SET_MAP) return createInitialState(action.mapId, null, action.seed);
    if (action.type === RESET_GAME) {
        return createInitialState(
            state.mapId,
            {players: state.players, settings: state.settings},
            action.seed
        );
    }
    // Partie terminée : plus aucune action de jeu n'est acceptée (seules la
    // sortie et la réinitialisation, traitées ci-dessus, restent possibles).
    if (state.status === 'over') return state;

    let next;
    switch (action.type) {
        case MOVE_SOLDIER:
            next = reduceMove(state, action);
            break;
        case MERGE_SOLDIER:
            next = reduceMerge(state, action);
            break;
        case ATTACK_SOLDIER:
            next = reduceAttack(state, action);
            break;
        case CHOP_TREE:
            next = reduceChop(state, action);
            break;
        case PLACE_ITEM:
            next = reducePlace(state, action);
            break;
        case BUY_BONUS:
            next = reduceBuyBonus(state, action);
            break;
        case END_TURN:
            next = reduceEndTurn(state);
            break;
        default:
            return state;
    }
    // L'action n'a rien changé : inutile de réévaluer les conditions de victoire.
    if (next === state) return state;
    return checkVictory(next);
}
