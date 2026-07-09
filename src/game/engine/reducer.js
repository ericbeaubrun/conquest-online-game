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
} from './actions.js';
import { getLogicalBoard, createInitialState } from './board.js';
import { computeReachable, incomeFor } from './selectors.js';
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
    TREE_TURN_RAMP,
    TREE_SPAWN_CHANCE,
} from './rules.js';
import { ITEM_COST } from '../items.js';
import {
    CHALLENGE_METRICS,
    BONUS_OFFERS,
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
} from '../soldier.js';
import { getNeighbors, hexId } from '../hex.js';

// Fabrique un soldat neuf avec ses caractéristiques par défaut. Centralisé ici
// pour que toute création de soldat parte du même modèle (stats + specs).
function makeSoldier(playerId, uid) {
    return {
        type: 'soldier',
        playerId,
        uid,
        level: 1,
        hp: SOLDIER_HP_DEFAULT,
        atk: SOLDIER_ATK_DEFAULT,
        affinity: null, // feu | glace | foudre | null
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
function makeSkeleton(playerId, uid, { skin = SKELETON_SRC, hp = SKELETON_HP, atk = SKELETON_ATK } = {}) {
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
    const progress = { ...soldier.progress, [metric]: (soldier.progress?.[metric] || 0) + amount };
    return { ...soldier, progress };
}

// Déplacement (repositionnement dans le territoire ou conquête d'une case).
function reduceMove(state, { fromId, toId }) {
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
            gold = { ...state.gold, [state.activePlayerId]: purse + reward };
        }
    }
    const movedSoldiers = new Set(state.movedSoldiers).add(soldier.uid);
    return { ...state, placements, ownership, gold, movedSoldiers };
}

// Fusion d'un soldat dans un soldat allié (niveau cumulé, plafonné).
function reduceMerge(state, { fromId, toId }) {
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
    return { ...state, placements, movedSoldiers };
}

// Combat : le soldat actif attaque un soldat ennemi adjacent. Les deux unités
// se retirent mutuellement des PV (égaux à l'attaque adverse) ; celles tombées
// à 0 meurent (retirées du plateau). L'attaquant reste sur sa case et son tour
// est consommé.
function reduceAttack(state, { fromId, toId }) {
    const from = state.placements.get(fromId);
    if (!from || from.type !== 'soldier') return state;
    if (from.playerId !== state.activePlayerId) return state;
    if (state.movedSoldiers.has(from.uid)) return state;

    const board = getLogicalBoard(state.mapId);
    const dest = computeReachable(state, board, fromId).moves.get(toId);
    if (!dest || dest.kind !== 'combat') return state;

    // La cible peut être un soldat OU une tour ennemie (déjà validée `combat`).
    const to = state.placements.get(toId);
    if (!to || to.playerId === state.activePlayerId) return state;

    const { attacker, defender } = combatResult(from, to);
    const placements = new Map(state.placements);
    let uidSeq = state.uidSeq;

    // Applique l'issue du combat sur une case : l'unité survivante garde ses PV
    // à jour ; l'unité morte quitte le plateau, sauf « Mort-vivant » qui laisse
    // un squelette allié (5/10) sur sa case. Renvoie l'unité morte (ou null).
    const settle = (id, unit, outcome) => {
        if (!outcome.dead) {
            let survivor = { ...unit, hp: outcome.hp };
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

    settle(fromId, from, attacker);
    const deadDefender = settle(toId, to, defender);

    // Défi « Mort-vivant » : tuer un soldat ennemi de niveau ≥ 2. Crédité à
    // l'attaquant seulement s'il survit (sinon sa progression disparaît avec lui).
    if (
        !attacker.dead &&
        deadDefender?.type === 'soldier' &&
        (deadDefender.level || 1) >= 2
    ) {
        const alive = placements.get(fromId);
        if (alive?.uid === from.uid) {
            placements.set(fromId, withProgress(alive, CHALLENGE_METRICS.ENEMIES_KILLED_L2, 1));
        }
    }

    // Défi & bonus « Chevalier noir » : tuer un squelette au combat le crédite
    // (débloque le bonus), et un chevalier noir équipé ABSORBE ses statistiques
    // (les additionne aux siennes, comme une fusion, plafonnées).
    if (!attacker.dead && isSkeleton(deadDefender)) {
        const alive = placements.get(fromId);
        if (alive?.uid === from.uid) {
            let knight = withProgress(alive, CHALLENGE_METRICS.SKELETONS_KILLED, 1);
            if (from.bonus === 'blackKnight') {
                knight = {
                    ...knight,
                    hp: Math.min((knight.hp || 0) + (to.hp || 0), SOLDIER_HP_MAX),
                    atk: Math.min((knight.atk || 0) + (to.atk || 0), SOLDIER_ATK_MAX),
                };
            }
            placements.set(fromId, knight);
        }
    }

    // Bonus « Guerrier » : tuer un ennemi (soldat ou tour) rapporte une prime,
    // à condition que l'attaquant survive au combat.
    let gold = state.gold;
    if (from.bonus === 'warrior' && !attacker.dead && deadDefender) {
        const purse = state.gold[state.activePlayerId] || 0;
        gold = { ...state.gold, [state.activePlayerId]: purse + WARRIOR_KILL_REWARD };
    }

    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return { ...state, placements, gold, movedSoldiers, uidSeq };
}

// Abattage d'un arbre : un soldat actif adjacent détruit l'arbre, le joueur
// gagne aussitôt de l'or, et le tour du soldat est consommé.
function reduceChop(state, { fromId, toId }) {
    const from = state.placements.get(fromId);
    if (!from || from.type !== 'soldier') return state;
    if (from.playerId !== state.activePlayerId) return state;
    if (state.movedSoldiers.has(from.uid)) return state;

    const board = getLogicalBoard(state.mapId);
    const dest = computeReachable(state, board, fromId).moves.get(toId);
    if (!dest || dest.kind !== 'chop') return state;

    const tree = state.placements.get(toId);
    if (!tree || tree.type !== 'tree') return state;

    // Avancement des défis : +1 arbre abattu, et +1 si l'arbre était sur une
    // case possédée par un adversaire (territoire ennemi).
    let chopper = withProgress(from, CHALLENGE_METRICS.TREES_CHOPPED, 1);
    const treeOwner = state.ownership.get(toId);
    if (treeOwner != null && treeOwner !== state.activePlayerId) {
        chopper = withProgress(chopper, CHALLENGE_METRICS.ENEMY_TREES_CHOPPED, 1);
    }

    const placements = new Map(state.placements);
    placements.delete(toId);
    placements.set(fromId, chopper); // le soldat reste sur place, progression à jour
    // Bonus « Bûcheron » : gagne 2× plus d'or en coupant les arbres.
    const reward = from.bonus === 'lumberjack' ? TREE_REWARD * 2 : TREE_REWARD;
    const purse = state.gold[state.activePlayerId] || 0;
    const gold = { ...state.gold, [state.activePlayerId]: purse + reward };
    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return { ...state, placements, gold, movedSoldiers };
}

// Apparition d'arbres en fin de tour. Le nombre tiré croît avec l'avancée de la
// partie (jusqu'à `TREE_TURN_RAMP`) et le nombre de joueurs, mais reste borné
// par le plafond global (`TREE_MAX_RATIO` de la carte). Renvoie la nouvelle
// carte des items (inchangée si rien n'apparaît).
function spawnTrees(state, board) {
    const cap = Math.floor(board.cells.length * TREE_MAX_RATIO);
    let treeCount = 0;
    for (const p of state.placements.values()) if (p.type === 'tree') treeCount += 1;
    const room = cap - treeCount;
    if (room <= 0) return state.placements;

    // Intensité 0→1 selon l'avancée ; une tentative par joueur (les parties à
    // plus de joueurs voient donc davantage d'arbres).
    const progress = Math.min(state.turn / TREE_TURN_RAMP, 1);
    let want = 0;
    for (let i = 0; i < state.players.length; i += 1) {
        if (Math.random() < TREE_SPAWN_CHANCE * progress) want += 1;
    }
    want = Math.min(want, room);
    if (want <= 0) return state.placements;

    // Cases éligibles : libres, non bloquées (eau), hors base.
    const eligible = board.cells.filter(
        (c) => !c.blocked && !board.baseIds.has(c.id) && !state.placements.has(c.id)
    );
    if (!eligible.length) return state.placements;

    const placements = new Map(state.placements);
    for (let i = 0; i < want && eligible.length; i += 1) {
        const idx = Math.floor(Math.random() * eligible.length);
        const [cell] = eligible.splice(idx, 1);
        placements.set(cell.id, { type: 'tree' });
    }
    return placements;
}

// Bonus « Fermier » : chaque soldat-fermier du joueur actif fait apparaître 0 à
// 2 arbres sur des cases collées à SON territoire (frontière), indépendamment du
// système d'apparition normal (n'entre pas dans le plafond / la montée en
// intensité). Prend la carte des items déjà mise à jour par `spawnTrees`.
function spawnFarmerTrees(state, board, placementsIn) {
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
        const want = Math.floor(Math.random() * 3); // 0, 1 ou 2 arbres
        for (let i = 0; i < want && eligible.length; i += 1) {
            const idx = Math.floor(Math.random() * eligible.length);
            const [cell] = eligible.splice(idx, 1); // case consommée (un arbre max)
            placements.set(cell.id, { type: 'tree' });
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
function spawnWarlockSkeletons(state, board, placementsIn, uidSeqIn) {
    const pid = state.activePlayerId;
    const warlockCells = [];
    for (const [id, p] of placementsIn) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === 'warlock') {
            warlockCells.push(id);
        }
    }
    if (!warlockCells.length) return { placements: placementsIn, uidSeq: uidSeqIn };

    const placements = new Map(placementsIn);
    let uidSeq = uidSeqIn;
    for (const id of warlockCells) {
        const cell = board.cellMap.get(id);
        if (!cell) continue;
        // Tirage : l'invocation ne se déclenche qu'avec une certaine probabilité.
        if (Math.random() >= WARLOCK_SUMMON_CHANCE) continue;
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
    return { placements, uidSeq };
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
        placements.set(id, { ...p, hp: healed });
    }
    return placements || placementsIn;
}

// Pose d'un item (soldat, maison, tour) sur une case du territoire actif.
function reducePlace(state, { cellId, itemType }) {
    const board = getLogicalBoard(state.mapId);
    const cell = board.cellMap.get(cellId);
    if (!cell || cell.blocked || board.baseIds.has(cellId)) return state;
    if (state.ownership.get(cellId) !== state.activePlayerId) return state;
    if (state.placements.has(cellId)) return state; // case déjà occupée

    // Achat : le joueur actif doit avoir assez d'or ; le coût est débité.
    const cost = ITEM_COST[itemType] || 0;
    const purse = state.gold[state.activePlayerId] || 0;
    if (purse < cost) return state; // fonds insuffisants

    const placements = new Map(state.placements);
    let uidSeq = state.uidSeq;
    let item;
    if (itemType === 'soldier') {
        uidSeq += 1;
        item = makeSoldier(state.activePlayerId, `s${uidSeq}`);
    } else {
        const stats = BUILDING_STATS[itemType];
        item = { type: itemType, playerId: state.activePlayerId, hp: stats?.hp ?? 0 };
        if (stats?.atk != null) item.atk = stats.atk; // tours : attaque de riposte
    }
    placements.set(cellId, item);
    const gold = { ...state.gold, [state.activePlayerId]: purse - cost };
    return { ...state, placements, gold, uidSeq };
}

// Achat/équipement d'un bonus pour un soldat. Conditions : c'est bien le soldat
// du joueur actif, le défi du bonus est accompli, le soldat n'a pas déjà un
// bonus (un seul par soldat) et le joueur a de quoi payer. Le prix est débité et
// le soldat prend le bonus (son sprite change côté affichage).
function reduceBuyBonus(state, { cellId, bonusId }) {
    const soldier = state.placements.get(cellId);
    if (!soldier || soldier.type !== 'soldier') return state;
    if (isSkeleton(soldier)) return state; // un squelette ne porte jamais de bonus
    if (soldier.playerId !== state.activePlayerId) return state;
    if (soldier.bonus) return state; // déjà un bonus

    const bonus = BONUS_OFFERS.find((b) => b.id === bonusId);
    if (!bonus || bonus.requiredLevel !== (soldier.level || 1)) return state;
    if (!isBonusUnlocked(soldier, bonus)) return state; // défi non accompli

    const price = bonus.price || 0;
    const purse = state.gold[state.activePlayerId] || 0;
    if (purse < price) return state; // fonds insuffisants

    // Bonus « Guerrier » : équiper le bonus porte aussitôt les statistiques du
    // soldat à leur nouveau palier.
    const equipped = { ...soldier, bonus: bonusId };
    if (bonusId === 'warrior') {
        equipped.hp = WARRIOR_HP;
        equipped.atk = WARRIOR_ATK;
    } else if (bonusId === 'warlock') {
        equipped.hp = WARLOCK_HP;
        equipped.atk = WARLOCK_ATK;
    }

    const placements = new Map(state.placements);
    placements.set(cellId, equipped);
    const gold = { ...state.gold, [state.activePlayerId]: purse - price };
    return { ...state, placements, gold };
}

// Fin de tour : le joueur actif encaisse son revenu, puis la main passe au
// suivant. Un tour complet écoulé (retour au premier joueur) incrémente le
// compteur, et chaque soldat retrouve son droit de déplacement.
function reduceEndTurn(state) {
    const { players, activePlayerId } = state;
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
    // Apparition normale des arbres, puis apparition « Fermier » (frontière).
    let placements = spawnTrees(state, board);
    placements = spawnFarmerTrees(state, board, placements);
    // Renfort « Alchimiste » sur les alliés adjacents avant de passer la main.
    placements = applyAlchemists(state, board, placements);
    // Régénération « Paladin ».
    placements = healPaladins(state, placements);
    // Invocation « Démoniste » : un squelette fragile par démoniste.
    const summon = spawnWarlockSkeletons(state, board, placements, state.uidSeq);
    placements = summon.placements;
    return {
        ...state,
        placements,
        uidSeq: summon.uidSeq,
        gold: { ...state.gold, [activePlayerId]: (state.gold[activePlayerId] || 0) + income },
        turn: nextIdx === 0 ? state.turn + 1 : state.turn,
        activePlayerId: players[nextIdx].id,
        movedSoldiers: new Set(),
    };
}

export function gameReducer(state, action) {
    switch (action.type) {
        case MOVE_SOLDIER:
            return reduceMove(state, action);
        case MERGE_SOLDIER:
            return reduceMerge(state, action);
        case ATTACK_SOLDIER:
            return reduceAttack(state, action);
        case CHOP_TREE:
            return reduceChop(state, action);
        case PLACE_ITEM:
            return reducePlace(state, action);
        case BUY_BONUS:
            return reduceBuyBonus(state, action);
        case END_TURN:
            return reduceEndTurn(state);
        case SET_MAP:
            return createInitialState(action.mapId);
        default:
            return state;
    }
}
