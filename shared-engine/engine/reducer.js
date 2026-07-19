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
    END_TURN,
    SET_MAP,
    RESET_GAME,
} from './actions.js';
import {getLogicalBoard, createInitialState} from './board.js';
import {makeRng} from './rng.js';
import {computeReachable, incomeFor, checkVictory} from './selectors.js';
import {statsSnapshot} from './stats.js';
import {
    SOLDIER_HP_DEFAULT,
    SOLDIER_ATK_DEFAULT,
    SOLDIER_HP_MAX,
    SOLDIER_ATK_MAX,
    BUILDING_STATS,
    canMerge,
    mergedSoldier,
    combatResult,
    canFight,
    isTower,
    TREE_REWARD,
    TREE_MAX_RATIO,
    SHIELD_AFFINITY,
} from './rules.js';
import {ITEM_COST, isAffinityItem} from '../data/items.js';
import {makeTree, treeReward, treeAffinity, canChopTree} from '../data/trees.js';
import {makeChest, makeLoot, lootGold, lootHp, lootAtk, lootAffinity, lootUnit} from '../data/chests.js';
import {unitKindById, curseFor, isCursable} from '../data/units.js';
import {
    CHALLENGE_METRICS,
    BONUS_OFFERS,
    bonusPriceOf,
    isBonusUnlocked,
    WARRIOR_KILL_REWARD,
    ALCHEMIST_ATK_BUFF,
    ALCHEMIST_HP_COST,
    PRIEST_HP_GIFT,
    PRIEST_HP_COST,
    KING_INCOME_MULT,
    isSkeleton,
    WARLOCK_SUMMON_CHANCE,
    PALADIN_IDLE_TURNS,
    VAMPIRE_DRAIN,
    isSummonedUnit,
    canReceiveAffinity,
    unlockedBonusIds,
    purchasedSoldierStats,
    soldierCostForLevel,
    MAGICIAN_GOLD_REWARD,
} from '../data/soldier.js';
import {getNeighbors, hexId} from '../data/hex.js';

// Nombre maximum d'évènements conservés dans le journal (`state.events`). Le
// front n'affiche que les nouveaux (via `seq`), mais le journal voyage dans
// l'état sérialisé/persisté : on le borne pour ne pas le laisser croître sans fin.
const EVENT_CAP = 40;

// Ajoute un ou plusieurs évènements au journal de l'état, de façon PURE et
// DÉTERMINISTE (mêmes entrées -> mêmes `seq`). Chaque évènement reçoit une `seq`
// monotone croissante (`eventSeq`) ; le journal est tronqué aux `EVENT_CAP`
// derniers. Les évènements sont des objets de DONNÉES (kind + payload) : leur
// mise en forme en texte se fait côté front (voir `toastMessages.js`), afin que
// l'engine reste sans dépendance d'affichage. Ignorer les entrées `null`/`false`
// permet d'écrire `emit(state, cond && {...})`.
function emit(state, ...events) {
    const list = events.filter(Boolean);
    if (!list.length) return state;
    let seq = state.eventSeq || 0;
    const stamped = list.map((e) => ({...e, seq: (seq += 1)}));
    const merged = [...(state.events || []), ...stamped];
    const events2 = merged.length > EVENT_CAP ? merged.slice(merged.length - EVENT_CAP) : merged;
    return {...state, events: events2, eventSeq: seq};
}

// Instantané minimal d'une unité pour un évènement (titre du soldat, camp,
// structure…). Le front reconstitue le libellé complet à partir de ces champs.
function unitSnapshot(unit) {
    if (!unit) return null;
    return {
        type: unit.type,
        playerId: unit.playerId,
        atk: unit.atk,
        level: unit.level,
        bonus: unit.bonus ?? null,
        unit: unit.unit ?? null, // sous-type invoqué (skeleton / druidTree) le cas échéant
    };
}

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

// Fabrique une unité INVOQUÉE d'après son espèce au catalogue (`data/units.js`) :
// squelette (« Mort-vivant », « Démoniste »), arbre-druide (« Druide »), dragon
// (« Sorcier »). Toutes sont des soldats alliés à part entière — elles se
// déplacent, combattent et tiennent du territoire — mais leur marqueur `unit`
// leur interdit la fusion et les bonus. Sprite, statistiques et niveau viennent
// tous de l'espèce : cette fonction est le seul endroit qui les assemble.
//
// `affinity` est l'élément dont l'unité NAÎT, hérité de son origine : celle de
// l'invocateur pour un squelette, celle de l'arbre pour un arbre-druide. Sans
// élément à hériter elle naît neutre (dragon, gobelin) — et pourra en gagner un
// plus tard comme n'importe quelle unité (boutique, coffre, arbre élémentaire).
function makeUnit(kindId, playerId, uid, affinity = null) {
    const kind = unitKindById(kindId);
    return {
        type: 'soldier',
        unit: kind.unit ?? kind.id,
        playerId,
        uid,
        level: kind.level ?? 1,
        hp: kind.hp,
        atk: kind.atk,
        affinity,
        bonus: null,
        behavior: null,
        skin: kind.src,
        progress: {},
    };
}

// Créature issue d'un envoûtement du « Sorcier ». Contrairement à une invocation,
// elle REMPLACE un soldat existant : celui-ci garde son propriétaire, sa case,
// son orientation et son AFFINITÉ, mais prend les traits de l'espèce (1/1) et
// perd bonus, comportement et défis. Le marqueur `unit` rend le sort définitif :
// la créature ne fusionne plus et ne peut plus recevoir de bonus.
function makeCursed(victim, kind) {
    return {
        ...victim,
        unit: kind.unit ?? kind.id,
        level: kind.level ?? 1,
        hp: kind.hp,
        atk: kind.atk,
        bonus: null,
        behavior: null,
        skin: kind.src,
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

// Apparition de coffres en fin de tour, sur le même principe que les arbres mais
// bien plus rare : un seul coffre par tour au plus (`chestSpawnChance`), et
// jamais plus de `chestMax` sur le plateau à la fois. Prend la carte des items
// déjà mise à jour par les apparitions précédentes.
function spawnChests(state, board, placementsIn, rng) {
    const s = state.settings;
    if (s && s.chestsEnabled === false) return placementsIn;

    const max = Math.max(0, s?.chestMax ?? 5);
    let chests = 0;
    for (const p of placementsIn.values()) if (p.type === 'chest') chests += 1;
    if (chests >= max) return placementsIn;

    const chance = (s?.chestSpawnChance ?? 10) / 100;
    if (rng.next() >= chance) return placementsIn;

    // Cases éligibles : libres, non bloquées (eau), hors base.
    const eligible = board.cells.filter(
        (c) => !c.blocked && !board.baseIds.has(c.id) && !placementsIn.has(c.id)
    );
    if (!eligible.length) return placementsIn;

    const placements = new Map(placementsIn);
    placements.set(eligible[rng.int(eligible.length)].id, makeChest());
    return placements;
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
        placements.set(cell.id, makeTree(rng)); // essence tirée au coefficient d'apparition
    }
    return placements;
}

// Bonus « Fermier » : chaque soldat-fermier du joueur actif fait apparaître 0 à
// 2 arbres sur des cases collées à SON territoire (frontière), indépendamment du
// système d'apparition normal (n'entre pas dans le plafond / la montée en
// intensité). Prend la carte des items déjà mise à jour par `spawnTrees`.
// Un fermier ne produit QUE s'il se tient lui-même sur une case frontière (sa
// case borde au moins une case qui n'appartient pas au joueur) : un fermier
// enfoui au cœur du territoire ne fait rien pousser.
function spawnFarmerTrees(state, board, placementsIn, rng, events) {
    // Rien à faire si les arbres sont désactivés en configuration.
    if (state.settings && state.settings.treesEnabled === false) return placementsIn;
    const pid = state.activePlayerId;
    // Une case est « frontière » quand elle borde au moins une case qui n'est pas
    // au joueur (même définition pour la case du fermier et les cases de pousse).
    const isFrontier = (q, r) =>
        getNeighbors(q, r).some((n) => state.ownership.get(hexId(n.q, n.r)) !== pid);
    // Combien de fermiers du joueur actif se tiennent SUR une case frontière ?
    let farmers = 0;
    for (const [id, p] of placementsIn) {
        if (p.type !== 'soldier' || p.playerId !== pid || p.bonus !== 'farmer') continue;
        const cell = board.cellMap.get(id);
        if (cell && isFrontier(cell.q, cell.r)) farmers += 1;
    }
    if (farmers === 0) return placementsIn;

    // Cases frontalières INTÉRIEURES : possédées par le joueur, libres, non
    // bloquées, hors base, et bordant au moins une case qui n'est PAS à lui
    // (l'arbre pousse donc du côté intérieur de la frontière, pas à l'extérieur).
    const eligible = board.cells.filter((c) => {
        if (c.blocked || board.baseIds.has(c.id) || placementsIn.has(c.id)) return false;
        if (state.ownership.get(c.id) !== pid) return false; // seulement sur son sol
        return isFrontier(c.q, c.r);
    });
    if (!eligible.length) return placementsIn;

    const placements = new Map(placementsIn);
    let planted = 0;
    for (let f = 0; f < farmers; f += 1) {
        const want = rng.int(3); // 0, 1 ou 2 arbres
        for (let i = 0; i < want && eligible.length; i += 1) {
            const idx = rng.int(eligible.length);
            const [cell] = eligible.splice(idx, 1); // case consommée (un arbre max)
            placements.set(cell.id, makeTree(rng)); // essence tirée au coefficient d'apparition
            planted += 1;
        }
    }
    if (planted > 0) events?.push({kind: 'bonusFarmer', playerId: pid, count: planted});
    return placements;
}

// Bonus « Alchimiste » : à la fin du tour de son propriétaire, chaque alchimiste
// SACRIFIE 1 de ses PV pour donner +1 attaque (plafonnée) à UN allié adjacent —
// le soldat allié voisin le MOINS offensif, celui qui en a le plus besoin.
// Chaque alchimiste agit sur sa propre cible ; un même allié peut cumuler les
// dons de plusieurs alchimistes.
//
// L'échange n'a lieu que s'il profite aux deux bouts : un alchimiste à 1 PV ne
// se sacrifie pas (il mourrait), et personne ne se saigne pour un allié dont
// l'attaque est déjà au plafond.
function applyAlchemists(state, board, placementsIn, events) {
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
        // Un alchimiste ne se sacrifie pas jusqu'à la mort : il lui faut plus de
        // PV que ce que coûte la transmutation.
        const alchemist = placements.get(id);
        if ((alchemist.hp || 0) <= ALCHEMIST_HP_COST) continue;
        // Cible : le soldat allié adjacent le MOINS offensif (jamais soi-même),
        // en ignorant ceux dont l'attaque est déjà au plafond — les armer de
        // plus ne ferait que gâcher les PV de l'alchimiste.
        let bestId = null;
        let bestAtk = Infinity;
        for (const n of getNeighbors(cell.q, cell.r)) {
            const nid = hexId(n.q, n.r);
            const ally = placements.get(nid);
            if (
                ally &&
                ally.type === 'soldier' &&
                ally.playerId === pid &&
                (ally.atk || 0) < SOLDIER_ATK_MAX &&
                (ally.atk || 0) < bestAtk
            ) {
                bestAtk = ally.atk || 0;
                bestId = nid;
            }
        }
        if (bestId == null) continue;
        placements.set(id, {...alchemist, hp: (alchemist.hp || 0) - ALCHEMIST_HP_COST});
        const ally = placements.get(bestId);
        placements.set(bestId, {
            ...ally,
            atk: Math.min((ally.atk || 0) + ALCHEMIST_ATK_BUFF, SOLDIER_ATK_MAX),
        });
        events?.push({kind: 'bonusAlchemist', playerId: pid});
    }
    return placements;
}

// Bonus « Magicien » : à la fin du tour de son propriétaire, chaque magicien
// transmet SA PROPRE affinité à UN allié adjacent sans affinité — jamais
// lui-même — et rapporte MAGICIAN_GOLD_REWARD or à son propriétaire par don.
// Renvoie la carte des items ET l'or gagné (0 si aucun don).
function applyMagicians(state, board, placementsIn, rng, events) {
    const pid = state.activePlayerId;
    const magicianCells = [];
    for (const [id, p] of placementsIn) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === 'magician') {
            magicianCells.push(id);
        }
    }
    if (!magicianCells.length) return {placements: placementsIn, goldGained: 0};

    const placements = new Map(placementsIn);
    let goldGained = 0;
    for (const id of magicianCells) {
        const cell = board.cellMap.get(id);
        if (!cell) continue;
        // Le magicien transmet SA PROPRE affinité : sans affinité, rien à donner.
        const affinity = placements.get(id)?.affinity ?? null;
        if (!affinity) continue;
        const targets = [];
        for (const n of getNeighbors(cell.q, cell.r)) {
            const nid = hexId(n.q, n.r);
            const ally = placements.get(nid);
            if (ally && ally.type === 'soldier' && ally.playerId === pid && nid !== id && ally.affinity == null) {
                targets.push(nid);
            }
        }
        if (!targets.length) continue;
        const targetId = targets[rng.int(targets.length)];
        const ally = placements.get(targetId);
        placements.set(targetId, {...ally, affinity});
        goldGained += MAGICIAN_GOLD_REWARD;
        events?.push({kind: 'bonusMagician', playerId: pid, affinity, gold: MAGICIAN_GOLD_REWARD});
    }
    return {placements, goldGained};
}

// Bonus « Prêtre » : à la fin du tour de son propriétaire, chaque prêtre prend
// sur sa propre vie pour soigner l'allié adjacent le PLUS MAL EN POINT (jamais
// lui-même). Sans cible éligible, il ne perd rien.
//
// Comme pour l'« Alchimiste », l'échange n'a lieu que s'il profite aux deux
// bouts : un prêtre à 1 PV ne se sacrifie pas (il mourrait), et personne ne se
// saigne pour un allié déjà au maximum de ses PV.
function applyPriests(state, board, placementsIn, events) {
    const pid = state.activePlayerId;
    const priestCells = [];
    for (const [id, p] of placementsIn) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === 'priest') {
            priestCells.push(id);
        }
    }
    if (!priestCells.length) return placementsIn;

    const placements = new Map(placementsIn);
    for (const id of priestCells) {
        const cell = board.cellMap.get(id);
        if (!cell) continue;
        // Un prêtre ne se sacrifie pas jusqu'à la mort : il lui faut plus de PV
        // que ce qu'il donne.
        const priest = placements.get(id);
        if ((priest.hp || 0) <= PRIEST_HP_COST) continue;
        // Cible : le soldat allié adjacent ayant le MOINS de PV, en ignorant
        // ceux déjà au maximum — les soigner gâcherait la vie du prêtre.
        let bestId = null;
        let bestHp = Infinity;
        for (const n of getNeighbors(cell.q, cell.r)) {
            const nid = hexId(n.q, n.r);
            const ally = placements.get(nid);
            if (
                ally &&
                ally.type === 'soldier' &&
                ally.playerId === pid &&
                (ally.hp || 0) < SOLDIER_HP_MAX &&
                (ally.hp || 0) < bestHp
            ) {
                bestHp = ally.hp || 0;
                bestId = nid;
            }
        }
        if (bestId == null) continue;
        placements.set(id, {...priest, hp: (priest.hp || 0) - PRIEST_HP_COST});
        const ally = placements.get(bestId);
        placements.set(bestId, {...ally, hp: Math.min((ally.hp || 0) + PRIEST_HP_GIFT, SOLDIER_HP_MAX)});
        events?.push({kind: 'bonusPriest', playerId: pid});
    }
    return placements;
}

// Bonus « Démoniste » : à la fin du tour de son propriétaire, chaque démoniste
// N'AYANT PAS AGI ce tour (ni déplacé, ni fusionné, ni attaqué, ni abattu —
// absent de `movedSoldiers`) invoque un squelette allié fragile (espèce
// `skeleton2`) sur une case voisine CONQUISE par le joueur (libre, non bloquée, hors
// base). L'invocation n'est pas systématique : elle a une chance fixe de se
// produire chaque tour. Renvoie la carte des items et le compteur d'uid mis à
// jour.
function spawnWarlockSkeletons(state, board, placementsIn, uidSeqIn, rng, events) {
    const pid = state.activePlayerId;
    // On retient le démoniste LUI-MÊME et pas seulement sa case : son squelette
    // héritera de son élément.
    const warlocks = [];
    for (const [id, p] of placementsIn) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === 'warlock' && !state.movedSoldiers.has(p.uid)) {
            warlocks.push([id, p]);
        }
    }
    if (!warlocks.length) return {placements: placementsIn, uidSeq: uidSeqIn};

    const placements = new Map(placementsIn);
    let uidSeq = uidSeqIn;
    for (const [id, warlock] of warlocks) {
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
        placements.set(spot, makeUnit('skeleton2', pid, `s${uidSeq}`, warlock.affinity ?? null));
        events?.push({kind: 'bonusWarlock', playerId: pid});
    }
    return {placements, uidSeq};
}

// Bonus « Sorcier » : à la fin du tour de son propriétaire, chaque sorcier jette
// son sort sur TOUS les soldats ENNEMIS portant l'un des trois autres bonus de
// niveau 5 — le roi devient un cochon, le démoniste une couronne, le conquérant
// une grenouille : des créatures 1/1 sans effet, qui gardent leur affinité et
// restent à leur propriétaire (voir `makeCursed`).
//
// Si le plateau ne porte AUCUNE de ces trois cibles (ni chez l'ennemi, ni chez
// soi), le sort se reporte sur une invocation : un dragon (statistiques au
// catalogue `units.js`) sur une case
// libre du territoire, voisine du sorcier. Une seule fois par sorcier
// (`dragonSummoned`), sans quoi il en produirait un à chaque tour.
function applySorcerers(state, board, placementsIn, uidSeqIn, events) {
    const pid = state.activePlayerId;
    const sorcererCells = [];
    for (const [id, p] of placementsIn) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === 'sorcerer') sorcererCells.push(id);
    }
    if (!sorcererCells.length) return {placements: placementsIn, uidSeq: uidSeqIn};

    // Cibles : les porteurs des bonus envoûtables. On distingue les ENNEMIS (à
    // envoûter) de la présence GLOBALE, qui seule conditionne l'invocation du
    // dragon : un roi allié suffit à priver le sorcier de son dragon.
    const victims = [];
    let anyOnBoard = false;
    for (const [id, p] of placementsIn) {
        if (p.type !== 'soldier' || !isCursable(p.bonus)) continue;
        anyOnBoard = true;
        if (p.playerId !== pid) victims.push(id);
    }

    const placements = new Map(placementsIn);
    let uidSeq = uidSeqIn;

    if (victims.length) {
        for (const id of victims) {
            const victim = placements.get(id);
            placements.set(id, makeCursed(victim, curseFor(victim.bonus)));
        }
        events?.push({kind: 'bonusSorcerer', playerId: pid, count: victims.length});
        return {placements, uidSeq};
    }
    if (anyOnBoard) return {placements: placementsIn, uidSeq}; // cibles alliées seules : rien à faire

    // Aucune cible nulle part : invocation du dragon, une fois par sorcier.
    let summoned = false;
    for (const id of sorcererCells) {
        const sorcerer = placements.get(id);
        if (sorcerer.dragonSummoned) continue;
        const cell = board.cellMap.get(id);
        if (!cell) continue;
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
        if (!spot) continue; // aucune case d'accueil : le sorcier retentera au prochain tour
        uidSeq += 1;
        placements.set(spot, makeUnit('dragon', pid, `s${uidSeq}`));
        placements.set(id, {...sorcerer, dragonSummoned: true});
        summoned = true;
        events?.push({kind: 'bonusSorcererDragon', playerId: pid});
    }
    return summoned ? {placements, uidSeq} : {placements: placementsIn, uidSeq: uidSeqIn};
}

// Bonus « Vampire » : à la fin du tour de son propriétaire, chaque vampire draine
// VAMPIRE_DRAIN PV à UN SEUL soldat allié adjacent — le MIEUX PORTANT, celui qui
// s'en remettra le mieux — et récupère pour lui les PV volés (plafonnés au
// maximum d'un soldat). Un allié à 1 PV n'est jamais mordu : le vampire n'achève
// pas les siens, et un voisin exsangue ne fait donc pas écran à un autre.
// Modifie la carte des items.
function applyVampires(state, board, placementsIn, events) {
    const pid = state.activePlayerId;
    const vampireCells = [];
    for (const [id, p] of placementsIn) {
        if (p.type === 'soldier' && p.playerId === pid && p.bonus === 'vampire') vampireCells.push(id);
    }
    if (!vampireCells.length) return placementsIn;

    const placements = new Map(placementsIn);
    for (const id of vampireCells) {
        const cell = board.cellMap.get(id);
        if (!cell) continue;
        // Victime : le soldat allié adjacent ayant le PLUS de PV, à condition
        // qu'il lui en reste à donner (jamais en dessous de 1 PV).
        let victimId = null;
        let bestHp = 1; // un allié à 1 PV n'a rien à céder : il ne peut pas être choisi
        for (const n of getNeighbors(cell.q, cell.r)) {
            const nid = hexId(n.q, n.r);
            const ally = placements.get(nid);
            if (!ally || ally.type !== 'soldier' || ally.playerId !== pid) continue;
            if ((ally.hp || 0) > bestHp) {
                bestHp = ally.hp || 0;
                victimId = nid;
            }
        }
        if (victimId == null) continue;
        const victim = placements.get(victimId);
        // On draine au plus VAMPIRE_DRAIN, sans jamais descendre la victime sous 1 PV.
        const stolen = Math.min(VAMPIRE_DRAIN, (victim.hp || 0) - 1);
        placements.set(victimId, {...victim, hp: (victim.hp || 0) - stolen});
        const vamp = placements.get(id);
        placements.set(id, {...vamp, hp: Math.min((vamp.hp || 0) + stolen, SOLDIER_HP_MAX)});
        events?.push({kind: 'bonusVampire', playerId: pid, amount: stolen});
    }
    return placements;
}

// Bonus « Conquérant » : à la fin du tour de son propriétaire, chaque conquérant
// annexe toutes les cases VIDES adjacentes — libres (aucune unité ni structure),
// non bloquées, hors base — qu'elles soient neutres OU déjà possédées par un
// adversaire. Modifie la carte des propriétés (`ownership`), pas les items ; prend
// la carte des items de fin de tour pour savoir quelles cases sont vraiment vides.
function applyConquerors(state, board, placements, ownershipIn, events) {
    const pid = state.activePlayerId;
    let ownership = null; // copié à la volée seulement si une case est annexée
    let annexed = 0;
    for (const [id, p] of placements) {
        if (p.type !== 'soldier' || p.playerId !== pid || p.bonus !== 'conqueror') continue;
        const cell = board.cellMap.get(id);
        if (!cell) continue;
        for (const n of getNeighbors(cell.q, cell.r)) {
            const nid = hexId(n.q, n.r);
            const ncell = board.cellMap.get(nid);
            if (!ncell || ncell.blocked || board.baseIds.has(nid)) continue; // hors carte / eau / base
            if (placements.has(nid)) continue; // case occupée (non vide) : pas d'annexion
            if ((ownership || ownershipIn).get(nid) === pid) continue; // déjà à nous
            if (!ownership) ownership = new Map(ownershipIn);
            ownership.set(nid, pid);
            annexed += 1;
        }
    }
    if (annexed > 0) events?.push({kind: 'bonusConqueror', playerId: pid, count: annexed});
    return ownership || ownershipIn;
}

// Défi « Paladin » : un soldat qui termine son tour SANS AVOIR AGI (ni déplacé,
// ni fusionné, ni attaqué, ni abattu — absent de `movedSoldiers`) progresse ; agir
// remet son compteur à zéro. Le défi se débloque après PALADIN_IDLE_TURNS tours
// consécutifs d'inactivité, puis reste acquis (comme le défi « Druide »). Appelée
// AVANT la réinitialisation de `movedSoldiers` en fin de tour.
function trackPaladinChallenge(state, placementsIn) {
    const pid = state.activePlayerId;
    const metric = CHALLENGE_METRICS.PALADIN_IDLE_TURNS;
    let placements = null; // copié à la volée seulement si un compteur change
    for (const [id, p] of placementsIn) {
        if (p.type !== 'soldier' || p.playerId !== pid || isSummonedUnit(p)) continue;
        const cur = p.progress?.[metric] || 0;
        let next;
        if (cur >= PALADIN_IDLE_TURNS) next = cur; // déjà accompli : reste acquis
        else if (!state.movedSoldiers.has(p.uid)) next = cur + 1; // resté immobile
        else next = 0; // a agi : série interrompue
        if (next === cur) continue;
        if (!placements) placements = new Map(placementsIn);
        placements.set(id, {...p, progress: {...p.progress, [metric]: next}});
    }
    return placements || placementsIn;
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

// Fin de tour : le joueur actif encaisse son revenu, puis la main passe au
// suivant. Un tour complet écoulé (retour au premier joueur) incrémente le
// compteur, et chaque soldat retrouve son droit de déplacement.
function reduceEndTurn(state) {
    const {players, activePlayerId} = state;
    const idx = players.findIndex((p) => p.id === activePlayerId);
    const nextIdx = (idx + 1) % players.length;
    // Évènements accumulés pendant les effets de fin de tour (bonus automatiques),
    // émis en une fois à la fin (voir `emit`).
    const events = [];
    let income = incomeFor(state, activePlayerId); // net de l'entretien des unités
    // Bonus « Roi » : tant qu'un soldat-roi du joueur est en vie, +50% de revenu.
    let hasKing = false;
    for (const p of state.placements.values()) {
        if (p.type === 'soldier' && p.playerId === activePlayerId && p.bonus === 'king') {
            hasKing = true;
            break;
        }
    }
    if (hasKing) {
        const boosted = Math.floor(income * KING_INCOME_MULT);
        if (boosted > income) events.push({kind: 'bonusKing', playerId: activePlayerId, amount: boosted - income});
        income = boosted;
    }
    const board = getLogicalBoard(state.mapId);
    // Générateur aléatoire déterministe repris à la graine courante de l'état.
    // Toutes les apparitions/invocations de ce tour puisent dans ce flux, puis
    // on persiste la graine avancée pour que le prochain tour continue la suite.
    const rng = makeRng(state.rngSeed);
    // Apparition normale des arbres, puis apparition « Fermier » (frontière).
    let placements = spawnTrees(state, board, rng);
    placements = spawnFarmerTrees(state, board, placements, rng, events);
    // Apparition (rare) d'un coffre à ouvrir.
    placements = spawnChests(state, board, placements, rng);
    // Renfort « Alchimiste » sur les alliés adjacents avant de passer la main.
    placements = applyAlchemists(state, board, placements, events);
    // Soin « Prêtre » : sacrifie 1 attaque pour soigner l'allié le plus offensif.
    placements = applyPriests(state, board, placements, events);
    // Ponction « Vampire » : draine 1 PV à UN allié adjacent, au profit du vampire.
    placements = applyVampires(state, board, placements, events);
    // Don « Magicien » : offre une affinité à un allié adjacent, contre de l'or.
    const magicianResult = applyMagicians(state, board, placements, rng, events);
    placements = magicianResult.placements;
    income += magicianResult.goldGained;
    // Invocation « Démoniste » : un squelette fragile par démoniste.
    const summon = spawnWarlockSkeletons(state, board, placements, state.uidSeq, rng, events);
    placements = summon.placements;
    // Sort « Sorcier » : envoûte les rois / démonistes / conquérants ennemis,
    // ou invoque un dragon s'il n'y a aucune de ces cibles sur le plateau.
    const sorcery = applySorcerers(state, board, placements, summon.uidSeq, events);
    placements = sorcery.placements;
    // Défi « Paladin » : progression du compteur « N tours sans agir ». Doit lire
    // `state.movedSoldiers` AVANT sa réinitialisation ci-dessous. C'est le SEUL
    // défi encore suivi en fin de tour : il mesure une inaction sur la DURÉE d'un
    // tour, ce qu'aucune lecture instantanée ne peut reconstituer. Tous les autres
    // défis d'état (druide, vampire, prêtre/alchimiste, chevalier noir, « aucun X
    // sur le terrain ») sont désormais évalués en direct — voir `STATE_CHALLENGES`
    // dans `data/soldier.js`.
    placements = trackPaladinChallenge(state, placements);
    // Acquittement des notifications de bonus : les bonus débloqués et réclamables
    // des soldats du joueur qui vient de jouer rejoignent leur `bonusSeen`. La
    // notification ne réapparaîtra donc plus, même si le bonus reste non réclamé.
    const acked = new Map(placements);
    // Les défis d'état se lisent sur le plateau tel qu'il est à cet instant.
    // `state.ownership` suffit : l'annexion « Conquérant » ci-dessous ne prend
    // que des cases VIDES, sans arbre ni maison à recompter.
    const world = {placements, ownership: state.ownership};
    for (const [id, p] of acked) {
        if (p.type !== 'soldier' || p.playerId !== activePlayerId) continue;
        const ids = unlockedBonusIds(p, state.settings, state.settings?.bonusesEnabled !== false, world);
        const fresh = ids.filter((bid) => !p.bonusSeen?.includes(bid));
        if (fresh.length) {
            acked.set(id, {...p, bonusSeen: [...(p.bonusSeen || []), ...fresh]});
        }
    }
    placements = acked;
    // Annexion « Conquérant » : les cases vides adjacentes rejoignent le joueur.
    const ownership = applyConquerors(state, board, placements, state.ownership, events);
    let next = {
        ...state,
        placements,
        ownership,
        uidSeq: sorcery.uidSeq,
        rngSeed: rng.seed, // graine avancée : la suite de la partie reste déterministe
        gold: {...state.gold, [activePlayerId]: (state.gold[activePlayerId] || 0) + income},
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
    return emit(next, ...events);
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
        case OPEN_CHEST:
            next = reduceOpenChest(state, action);
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
