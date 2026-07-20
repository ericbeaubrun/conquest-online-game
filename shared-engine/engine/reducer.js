// Reducer du jeu : fonction PURE (state, action) -> state. Toutes les règles
// de mutation vivent ici et nulle part ailleurs. C'est le point unique qui
// pourra être rejoué à l'identique côté serveur en mode « online ».

import {
    MOVE_SOLDIER,
    MERGE_SOLDIER,
    ATTACK_SOLDIER,
    CHOP_TREE,
    OPEN_CHEST,
    PLACE_ITEM,
    BUY_BONUS,
    SET_BEHAVIOR,
    END_TURN,
    SET_MAP,
    RESET_GAME,
} from './actions.js';
import {pickBehaviorAction, IDLE} from './behaviors.js';
import {getLogicalBoard, createInitialState} from './board.js';
import {makeRng} from './rng.js';
import {computeReachable, incomeFor, checkVictory} from './selectors.js';
import {statsSnapshot} from './stats.js';
import {emit, unitSnapshot} from './events.js';
import {makeSoldier, makeUnit, withProgress} from './factories.js';
import {runEndTurnEffects} from './endturn/index.js';
import {
    SOLDIER_HP_MAX,
    SOLDIER_ATK_MAX,
    BUILDING_STATS,
    canMerge,
    mergedSoldier,
    combatResult,
    canFight,
    isTower,
    TREE_REWARD,
    SHIELD_AFFINITY,
} from './rules.js';
import {ITEM_COST, isAffinityItem} from '../data/items.js';
import {treeReward, treeAffinity, canChopTree} from '../data/trees.js';
import {makeLoot, lootGold, lootHp, lootAtk, lootAffinity, lootUnit} from '../data/chests.js';
import {
    CHALLENGE_METRICS,
    BONUS_OFFERS,
    bonusPriceOf,
    isBonusUnlocked,
    WARRIOR_KILL_REWARD,
    isSkeleton,
    canReceiveAffinity,
    purchasedSoldierStats,
    soldierCostForLevel,
    BEHAVIORS,
} from '../data/soldier.js';
import {getNeighbors, hexId} from '../data/hex.js';

// Déplacement (repositionnement dans le territoire ou conquête d'une case).
function reduceMove(state, {fromId, toId}) {
    const soldier = state.placements.get(fromId);
    if (!soldier || soldier.type !== 'soldier') return state;
    if (soldier.playerId !== state.activePlayerId) return state; // pas ton soldat
    if (state.movedSoldiers.has(soldier.uid)) return state; // déjà joué ce tour

    const board = getLogicalBoard(state.mapId);
    const reachable = computeReachable(state, board, fromId);
    const dest = reachable.moves.get(toId);
    if (!dest || (dest.kind !== 'move' && dest.kind !== 'conquer' && dest.kind !== 'loot')) return state;
    // Ramassage d'un butin de coffre : c'est un déplacement comme un autre, mais
    // la case porte un objet à s'approprier — traité à part pour ne pas alourdir
    // le déplacement ordinaire.
    if (dest.kind === 'loot') return reduceTakeLoot(state, fromId, toId, soldier);

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

    const merged = mergedSoldier(from, to);

    const placements = new Map(state.placements);
    placements.delete(fromId);
    placements.set(toId, merged);
    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return emit(
        {...state, placements, movedSoldiers},
        {kind: 'merge', playerId: merged.playerId, atk: merged.atk, level: merged.level}
    );
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
        // Case d'approche = case où le soldat peut réellement se tenir (jamais un
        // relais traversé par le ninja). Pour un soldat ordinaire, `standable`
        // couvre toutes les cases atteintes : le comportement est inchangé.
        const canStand = !reachable.standable || reachable.standable.has(nid);
        if (d != null && canStand && d < bestDist) {
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
    if (!canFight(mover, to)) return state; // affinités identiques : combat refusé

    const {attacker, defender} = combatResult(mover, to);
    const placements = new Map(state.placements);
    // Le soldat quitte toujours sa case de départ : il a pu s'approcher au corps
    // à corps et/ou il va AVANCER sur la case de la cible qu'il tue (voir plus
    // bas). `settle` le repositionne ensuite sur sa case finale.
    placements.delete(fromId);
    let uidSeq = state.uidSeq;

    // Évènements du combat (notifications), dans l'ordre : l'engagement, puis les
    // morts et effets de bonus au fil du règlement. Instantanés pris AVANT combat
    // (le titre du soldat mort reflète bien ce qu'il était).
    const events = [{kind: 'attack', attacker: unitSnapshot(mover), defender: unitSnapshot(to)}];

    // Applique l'issue du combat sur une case : l'unité survivante garde ses PV
    // à jour ; l'unité morte quitte le plateau, sauf « Mort-vivant » qui laisse
    // un squelette allié (5/10) sur sa case. Renvoie l'unité morte (ou null).
    // Défi « Guerrier » : seuls les combats contre un AUTRE SOLDAT comptent —
    // tours, maisons et bases (structures) sont exclues.
    const countsForWarriorChallenge = !isBaseTarget && !isTower(to) && to?.type === 'soldier';
    const settle = (id, unit, outcome, countsForWarrior = true) => {
        if (!outcome.dead) {
            let survivor = {...unit, hp: outcome.hp};
            if (unit.type === 'soldier' && countsForWarrior) {
                survivor = withProgress(survivor, CHALLENGE_METRICS.COMBATS_SURVIVED, 1);
            }
            placements.set(id, survivor);
            return null;
        }
        // L'unité meurt : notification de mort (avec son titre/camp). « Mort-vivant »
        // laisse en plus un squelette allié sur sa case — un effet de bonus notifié.
        events.push({kind: 'death', unit: unitSnapshot(unit)});
        if (unit.type === 'soldier' && unit.bonus === 'undead') {
            uidSeq += 1;
            // Le squelette se relève avec l'élément de celui dont il est la dépouille.
            placements.set(id, makeUnit('skeleton', unit.playerId, `s${uidSeq}`, unit.affinity ?? null));
            events.push({kind: 'bonusUndead', playerId: unit.playerId});
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
            events.push({kind: 'death', unit: unitSnapshot(to)}); // base rasée
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
    settle(attackerFinalId, mover, attacker, countsForWarriorChallenge);

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
                events.push({kind: 'bonusBlackKnight', playerId: from.playerId});
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
    return emit(
        {...state, placements, ownership, gold, movedSoldiers, uidSeq, baseHp, destroyedBases},
        ...events
    );
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
    // Un arbre élémentaire refuse la hache d'un soldat de même affinité.
    if (!canChopTree(from, tree)) return state;

    // Case d'où abattre l'arbre : la case du soldat s'il est déjà collé, sinon la
    // case libre adjacente à l'arbre la plus proche qu'il puisse atteindre.
    const chopFromId = approachCell(board, reachable, fromId, toId);
    if (chopFromId == null) return state; // aucune approche possible

    // Bonus « Druide » : au lieu de récolter l'arbre, il le TRANSFORME en une
    // unité alliée « arbre-druide » sur la case de l'arbre. Le druide reste sur
    // sa case d'approche (adjacente) ; son tour est consommé, sans gain d'or.
    if (from.bonus === 'druid') {
        const targetCell = board.cellMap.get(toId);
        const dq = Number(chopFromId.split(',')[0]);
        let druid = from;
        if (targetCell && targetCell.q !== dq) {
            druid = {...druid, facing: targetCell.q > dq ? 'right' : 'left'};
        }
        const placements = new Map(state.placements);
        placements.delete(toId); // l'arbre disparaît…
        placements.delete(fromId); // …et le druide quitte sa case de départ
        placements.set(chopFromId, druid); // le druide se tient sur sa case d'approche
        const uidSeq = state.uidSeq + 1;
        // …remplacé par l'unité, qui hérite de l'élément de l'arbre transformé
        // (un arbre de feu donne un arbre-druide de feu ; un arbre ordinaire, une
        // unité neutre).
        placements.set(toId, makeUnit('druidTree', state.activePlayerId, `s${uidSeq}`, treeAffinity(tree)));
        // Les deux cases portent une unité alliée : elles appartiennent désormais
        // au joueur (invariant : une unité se tient sur son propre territoire).
        let ownership = state.ownership;
        if (
            state.ownership.get(toId) !== state.activePlayerId ||
            state.ownership.get(chopFromId) !== state.activePlayerId
        ) {
            ownership = new Map(state.ownership);
            ownership.set(toId, state.activePlayerId);
            ownership.set(chopFromId, state.activePlayerId);
        }
        const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
        return emit(
            {...state, placements, ownership, movedSoldiers, uidSeq},
            {kind: 'bonusDruid', playerId: from.playerId}
        );
    }

    // Avancement des défis : +1 arbre abattu, et +1 si l'arbre était sur une
    // case possédée par un adversaire (territoire ennemi).
    let chopper = withProgress(from, CHALLENGE_METRICS.TREES_CHOPPED, 1);
    const treeOwner = state.ownership.get(toId);
    if (treeOwner != null && treeOwner !== state.activePlayerId) {
        chopper = withProgress(chopper, CHALLENGE_METRICS.ENEMY_TREES_CHOPPED, 1);
    }

    // Arbre élémentaire abattu par un soldat SANS affinité : l'élément de
    // l'arbre passe au bûcheron (une affinité ne se remplace jamais, et le cas
    // « même affinité » est déjà refusé plus haut).
    const gained = treeAffinity(tree);
    if (gained && chopper.affinity == null) {
        chopper = {...chopper, affinity: gained};
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
    // Récompense modulée par l'essence de l'arbre ; le bonus « Bûcheron » la double.
    const kindReward = treeReward(tree, baseReward);
    const reward = from.bonus === 'lumberjack' ? kindReward * 2 : kindReward;
    const purse = state.gold[state.activePlayerId] || 0;
    const gold = {...state.gold, [state.activePlayerId]: purse + reward};
    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return {...state, placements, ownership, gold, movedSoldiers};
}

// Ouverture d'un coffre : action au CORPS À CORPS, comme l'abattage — le soldat
// s'approche si besoin, puis ouvre. À la différence de l'abattage il ne PREND
// PAS la case : le coffre y laisse un butin, qu'il faudra venir ramasser en s'y
// déplaçant (un tour plus tard, ou avec un autre soldat). Le contenu est tiré au
// sort ICI (et non à l'apparition du coffre) ; la graine avancée est persistée.
function reduceOpenChest(state, {fromId, toId}) {
    const from = state.placements.get(fromId);
    if (!from || from.type !== 'soldier') return state;
    if (from.playerId !== state.activePlayerId) return state;
    if (state.movedSoldiers.has(from.uid)) return state;

    const board = getLogicalBoard(state.mapId);
    const reachable = computeReachable(state, board, fromId);
    const dest = reachable.moves.get(toId);
    if (!dest || dest.kind !== 'openChest') return state;

    const chest = state.placements.get(toId);
    if (!chest || chest.type !== 'chest') return state;

    // Case d'où ouvrir le coffre : celle du soldat s'il est déjà collé, sinon la
    // case libre adjacente au coffre la plus proche qu'il puisse atteindre.
    const openFromId = approachCell(board, reachable, fromId, toId);
    if (openFromId == null) return state; // aucune approche possible

    // Avancement du défi « Ninja » : +1 coffre ouvert au crédit de l'ouvreur.
    let opener = withProgress(from, CHALLENGE_METRICS.CHESTS_OPENED, 1);
    // Oriente l'ouvreur vers le coffre depuis sa case d'approche.
    const target = board.cellMap.get(toId);
    const openQ = Number(openFromId.split(',')[0]);
    if (target && target.q !== openQ) {
        opener = {...opener, facing: target.q > openQ ? 'right' : 'left'};
    }

    const rng = makeRng(state.rngSeed);
    const pid = state.activePlayerId;
    const loot = makeLoot(rng);
    const placements = new Map(state.placements);
    placements.delete(fromId); // le soldat quitte sa case de départ…
    placements.set(openFromId, opener); // …et se tient sur sa case d'approche

    // Le RENFORT fait exception : il ne se ramasse pas. La créature sort du
    // coffre déjà ralliée à l'ouvreur et prend la case du coffre (personne ne
    // peut donc la lui souffler). Les autres butins restent au sol à ramasser.
    const reinforcement = lootUnit(loot);
    let uidSeq = state.uidSeq;
    let ownership = state.ownership;
    if (reinforcement) {
        uidSeq += 1;
        placements.set(toId, makeUnit(reinforcement, pid, `s${uidSeq}`));
        // Une unité se tient toujours sur son propre territoire.
        if (state.ownership.get(toId) !== pid) {
            ownership = new Map(state.ownership);
            ownership.set(toId, pid);
        }
    } else {
        placements.set(toId, loot); // le coffre laisse place à son butin
    }

    const movedSoldiers = new Set(state.movedSoldiers).add(from.uid);
    return emit(
        {...state, placements, ownership, movedSoldiers, uidSeq, rngSeed: rng.seed},
        {kind: 'chestOpened', playerId: pid, loot: loot.kind},
        reinforcement && {kind: 'lootUnit', playerId: pid, unit: reinforcement}
    );
}

// Ramassage du butin d'un coffre ouvert : un déplacement ordinaire sur la case
// du butin, qui applique aussitôt son effet (or, statistique ou affinité — le
// renfort, lui, est déjà rallié dès l'ouverture). La case est prise au passage, comme une
// conquête : le butin est neutre et peut se trouver n'importe où. Le tour du
// soldat est consommé.
function reduceTakeLoot(state, fromId, toId, soldier) {
    const loot = state.placements.get(toId);
    if (!loot || loot.type !== 'loot') return state;

    let taker = soldier;
    const fromQ = Number(fromId.split(',')[0]);
    const toQ = Number(toId.split(',')[0]);
    if (toQ !== fromQ) taker = {...taker, facing: toQ > fromQ ? 'right' : 'left'};

    const pid = state.activePlayerId;
    const events = [];
    let gold = state.gold;

    // Or : versé directement dans la bourse.
    const coins = lootGold(loot);
    if (coins > 0) {
        gold = {...state.gold, [pid]: (state.gold[pid] || 0) + coins};
        events.push({kind: 'lootGold', playerId: pid, amount: coins});
    }

    // Cœur / épée : renforcent le ramasseur, sans dépasser les plafonds du jeu.
    // Un butin ramassé au plafond est perdu — l'évènement le dit (`gained`).
    const hp = lootHp(loot);
    if (hp > 0) {
        const before = taker.hp || 0;
        const after = Math.min(before + hp, SOLDIER_HP_MAX);
        taker = {...taker, hp: after};
        events.push({kind: 'lootStat', playerId: pid, stat: 'hp', amount: after - before});
    }
    const atk = lootAtk(loot);
    if (atk > 0) {
        const before = taker.atk || 0;
        const after = Math.min(before + atk, SOLDIER_ATK_MAX);
        taker = {...taker, atk: after};
        events.push({kind: 'lootStat', playerId: pid, stat: 'atk', amount: after - before});
    }

    // Affinité : offerte au ramasseur, s'il n'en a pas déjà une (une affinité ne
    // se remplace jamais).
    const affinity = lootAffinity(loot);
    if (affinity) {
        const gained = taker.affinity == null;
        if (gained) taker = {...taker, affinity};
        events.push({kind: 'lootAffinity', playerId: pid, affinity, gained});
    }

    const placements = new Map(state.placements);
    placements.delete(fromId); // le soldat quitte sa case…
    placements.set(toId, taker); // …et s'installe sur celle du butin

    // La case du butin devient sienne (même invariant qu'une conquête : un
    // soldat se tient toujours sur son propre territoire).
    let ownership = state.ownership;
    if (state.ownership.get(toId) !== pid) {
        ownership = new Map(state.ownership);
        ownership.set(toId, pid);
    }
    const movedSoldiers = new Set(state.movedSoldiers).add(soldier.uid);
    return emit({...state, placements, ownership, gold, movedSoldiers}, ...events);
}
// Achat d'une affinité (feu / glace / foudre) en boutique : elle ne se pose pas
// sur une case libre mais s'APPLIQUE au soldat qui occupe la case — un soldat du
// joueur actif encore sans affinité, à qui elle donne l'élément. Le prix est
// débité ; le soldat CONSERVE son droit d'action (comme l'achat d'un bonus).
function reducePlaceAffinity(state, cellId, affinity) {
    const soldier = state.placements.get(cellId);
    if (!canReceiveAffinity(soldier)) return state; // pas un soldat, ou déjà une affinité
    if (soldier.playerId !== state.activePlayerId) return state; // jamais un soldat adverse

    const cost = state.settings?.itemCost?.[affinity] ?? ITEM_COST[affinity] ?? 0;
    const purse = state.gold[state.activePlayerId] || 0;
    if (purse < cost) return state; // fonds insuffisants

    const placements = new Map(state.placements);
    placements.set(cellId, {...soldier, affinity});
    const gold = {...state.gold, [state.activePlayerId]: purse - cost};
    return emit(
        {...state, placements, gold},
        {kind: 'buyAffinity', playerId: state.activePlayerId, affinity, cost}
    );
}

// Pose d'un item (soldat, maison, tour) sur une case du territoire actif, ou
// achat d'une affinité pour le soldat qui l'occupe.
function reducePlace(state, {cellId, itemType, level = 1}) {
    const board = getLogicalBoard(state.mapId);
    const cell = board.cellMap.get(cellId);
    if (!cell || cell.blocked || board.baseIds.has(cellId)) return state;
    // Les affinités ciblent un SOLDAT posé et non une case libre : elles ont
    // leurs propres conditions (voir `reducePlaceAffinity`).
    if (isAffinityItem(itemType)) return reducePlaceAffinity(state, cellId, itemType);
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
    // Défi « Viking » : plus rien à créditer ici — « posséder une tour d'attaque
    // ET une tour de défense » est un défi d'ÉTAT, lu en direct sur le plateau
    // (voir `STATE_CHALLENGES` dans `data/soldier.js`). Il se referme donc aussi
    // dès qu'une des deux tours est détruite.
    const gold = {...state.gold, [state.activePlayerId]: purse - cost};
    // Notification d'achat : un soldat (avec son niveau) ou une structure.
    const bought = itemType === 'soldier'
        ? {kind: 'buySoldier', playerId: state.activePlayerId, level, cost}
        : {kind: 'buyBuilding', playerId: state.activePlayerId, itemType, cost};
    return emit({...state, placements, gold, uidSeq}, bought);
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
    // Défi non accompli (ou défi désactivé : débloqué). Les défis d'ÉTAT sont
    // évalués ICI, sur l'état courant — c'est ce qui garantit qu'on n'achète
    // jamais contre une condition périmée.
    if (!isBonusUnlocked(soldier, bonus, state.settings, state)) return state;

    const price = bonusPriceOf(bonus, state.settings); // prix configurable
    const purse = state.gold[state.activePlayerId] || 0;
    if (purse < price) return state; // fonds insuffisants

    // Équiper un bonus, c'est PRENDRE SON PROFIL de statistiques : chaque bonus
    // porte les siennes au catalogue (voir `BONUS_OFFERS.stats`), et elles
    // remplacent celles du niveau. C'est le levier d'équilibrage principal — un
    // Prêtre devient un mur (1/32), un Vampire une lame de verre (8/1).
    const equipped = {...soldier, bonus: bonusId};
    if (bonus.stats) {
        equipped.atk = bonus.stats.atk;
        equipped.hp = bonus.stats.hp;
    }
    if (bonusId === 'paladin') {
        // Bonus « Paladin » : équiper le bonus, c'est prendre le BOUCLIER. Il
        // REMPLACE l'élément que le soldat portait éventuellement — le bouclier
        // est l'attribut du paladin, pas une affinité de plus.
        equipped.affinity = SHIELD_AFFINITY;
    }

    const placements = new Map(state.placements);
    placements.set(cellId, equipped);
    const gold = {...state.gold, [state.activePlayerId]: purse - price};
    return emit(
        {...state, placements, gold},
        {kind: 'buyBonus', playerId: state.activePlayerId, bonusId, cost: price, atk: soldier.atk, level: soldier.level}
    );
}

// Assigne (ou retire, avec `null`) un comportement au soldat de la case. Ne
// consomme PAS l'action du soldat : il peut toujours jouer manuellement (ce qui
// effacera son comportement — voir `clearActorBehavior`).
function reduceSetBehavior(state, {cellId, behavior}) {
    const soldier = state.placements.get(cellId);
    if (!soldier || soldier.type !== 'soldier') return state;
    if (soldier.playerId !== state.activePlayerId) return state; // pas ton soldat
    const wanted = behavior ?? null;
    if (wanted !== null && !BEHAVIORS.some((b) => b.id === wanted)) return state; // inconnu
    if ((soldier.behavior ?? null) === wanted) return state; // inchangé

    const placements = new Map(state.placements);
    placements.set(cellId, {...soldier, behavior: wanted});
    return {...state, placements};
}

// Un soldat qui joue MANUELLEMENT perd son comportement (le joueur a repris la
// main). Appelé par `gameReducer` après toute action de jeu d'un soldat — les
// coups AUTOMATIQUES de fin de tour passent, eux, directement par les fonctions
// de réduction (voir `runBehaviors`) et conservent donc le comportement.
function clearActorBehavior(next, state, action) {
    if (next === state) return next; // action refusée : le soldat n'a pas joué
    const actor = state.placements.get(action.fromId);
    if (!actor || actor.type !== 'soldier' || !actor.behavior) return next;
    // Le soldat a pu changer de case (déplacement, avancée de combat) : on le
    // retrouve par son uid. Absent (mort, fusionné) : rien à effacer.
    for (const [id, placed] of next.placements) {
        if (placed.uid === actor.uid && placed.behavior) {
            const placements = new Map(next.placements);
            placements.set(id, {...placed, behavior: null});
            return {...next, placements};
        }
    }
    return next;
}

// PILOTE AUTOMATIQUE : à la fin du tour, chaque soldat du joueur actif doté
// d'un comportement (et n'ayant pas déjà joué) exécute son coup, choisi par
// `pickBehaviorAction` et appliqué par les MÊMES fonctions de réduction que les
// joueurs. Un comportement sans coup possible (bloqué) est EFFACÉ — le soldat
// redevient un soldat ordinaire au tour suivant. L'ordre d'exécution (ids de
// case triés) est déterministe : client et serveur rejouent le même tour.
function runBehaviors(state) {
    const board = getLogicalBoard(state.mapId);
    const uids = [...state.placements.entries()]
        .filter(([, p]) =>
            p.type === 'soldier' &&
            p.playerId === state.activePlayerId &&
            p.behavior &&
            !state.movedSoldiers.has(p.uid))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, p]) => p.uid);

    let next = state;
    for (const uid of uids) {
        // Les coups précédents ont pu déplacer d'autres unités : on retrouve le
        // soldat par son uid sur l'état LE PLUS FRAIS.
        const entry = [...next.placements.entries()].find(([, p]) => p.uid === uid);
        if (!entry || next.movedSoldiers.has(uid)) continue;
        const [cellId, soldier] = entry;

        const action = pickBehaviorAction(next, board, cellId, soldier);
        if (action === IDLE) continue; // rien à jouer CE tour, comportement conservé

        let applied = next;
        if (action) {
            switch (action.type) {
                case MOVE_SOLDIER:
                    applied = reduceMove(next, action);
                    break;
                case ATTACK_SOLDIER:
                    applied = reduceAttack(next, action);
                    break;
                case CHOP_TREE:
                    applied = reduceChop(next, action);
                    break;
                default:
                    break;
            }
        }
        if (applied === next) {
            // Bloqué (aucun coup, ou coup refusé par les règles) : le
            // comportement s'efface, le joueur reprend la main sur ce soldat.
            const placements = new Map(next.placements);
            placements.set(cellId, {...soldier, behavior: null});
            next = {...next, placements};
        } else {
            next = applied;
        }
    }
    return next;
}

// Fin de tour : les comportements des soldats s'exécutent, le joueur actif
// encaisse son revenu, puis la main passe au suivant. Un tour complet écoulé
// (retour au premier joueur) incrémente le compteur, et chaque soldat retrouve
// son droit de déplacement.
function reduceEndTurn(prev) {
    // Les soldats à comportement jouent D'ABORD — comme si le joueur les avait
    // déplacés lui-même, juste avant de terminer son tour. Ils comptent donc
    // comme « ayant joué » pour les effets de fin de tour (Paladin, Sorcier…),
    // et leurs conquêtes entrent dans le revenu encaissé ci-dessous.
    const state = runBehaviors(prev);
    const {players, activePlayerId} = state;
    const idx = players.findIndex((p) => p.id === activePlayerId);
    const nextIdx = (idx + 1) % players.length;
    // Générateur aléatoire déterministe repris à la graine courante de l'état.
    // Toutes les apparitions/invocations de ce tour puisent dans ce flux, puis
    // on persiste la graine avancée pour que le prochain tour continue la suite.
    const rng = makeRng(state.rngSeed);
    // Effets automatiques du tour (apparitions, bonus passifs, annexions) : voir
    // `endturn/index.js`, dont la liste porte l'ordre d'application — qui fait
    // partie des règles. `events` est alimenté au fil du pipeline, puis estampillé
    // en une fois par `emit`.
    const ctx = runEndTurnEffects({
        state,
        board: getLogicalBoard(state.mapId),
        rng,
        events: [],
        placements: state.placements,
        ownership: state.ownership,
        uidSeq: state.uidSeq,
        income: incomeFor(state, activePlayerId), // net de l'entretien des unités
    });
    let next = {
        ...state,
        placements: ctx.placements,
        ownership: ctx.ownership,
        uidSeq: ctx.uidSeq,
        rngSeed: rng.seed, // graine avancée : la suite de la partie reste déterministe
        gold: {...state.gold, [activePlayerId]: (state.gold[activePlayerId] || 0) + ctx.income},
        turn: nextIdx === 0 ? state.turn + 1 : state.turn,
        activePlayerId: players[nextIdx].id,
        movedSoldiers: new Set(),
    };
    // Historique statistique : à chaque TOUR COMPLET (retour au premier joueur),
    // photo des indicateurs de chaque joueur, étiquetée du tour qui s'achève.
    // Alimente les graphiques d'évolution (menu latéral) ; déterministe, il
    // voyage dans l'état sérialisé (mêmes courbes en local et en online).
    if (nextIdx === 0) {
        next = {...next, statsHistory: [...(state.statsHistory || []), statsSnapshot(next, state.turn)]};
    }
    return emit(next, ...ctx.events);
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
        // Les cinq actions DE JEU d'un soldat : jouées à la main, elles effacent
        // son comportement (le joueur a repris le contrôle). Les coups
        // automatiques de fin de tour ne passent pas par ici (voir
        // `runBehaviors`) et le conservent.
        case MOVE_SOLDIER:
            next = clearActorBehavior(reduceMove(state, action), state, action);
            break;
        case MERGE_SOLDIER:
            next = clearActorBehavior(reduceMerge(state, action), state, action);
            break;
        case ATTACK_SOLDIER:
            next = clearActorBehavior(reduceAttack(state, action), state, action);
            break;
        case CHOP_TREE:
            next = clearActorBehavior(reduceChop(state, action), state, action);
            break;
        case OPEN_CHEST:
            next = clearActorBehavior(reduceOpenChest(state, action), state, action);
            break;
        case PLACE_ITEM:
            next = reducePlace(state, action);
            break;
        case BUY_BONUS:
            next = reduceBuyBonus(state, action);
            break;
        case SET_BEHAVIOR:
            next = reduceSetBehavior(state, action);
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
