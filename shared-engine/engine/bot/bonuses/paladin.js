// Bonus « Paladin » (niveau 4, 150 or, 32 or/tour tout compris) — le BÉLIER.
//
// Ce qu'il change tient entièrement dans `canFight` : équiper le paladin lui
// donne le BOUCLIER divin, et le bouclier refuse le combat contre tout soldat
// SANS affinité, dans les deux sens. Comme l'immense majorité des soldats n'en
// portent pas, un paladin est intouchable par presque toute l'armée adverse —
// et incapable de la toucher. Seuls les porteurs d'un élément (feu/glace/foudre)
// et les autres boucliers peuvent croiser le fer avec lui.
//
// Mais la même règle s'arrête aux STRUCTURES : « une structure sans affinité
// reste assiégeable ». Un paladin peut donc démolir maisons, tours et bases
// pendant que les soldats qui les gardent le regardent faire. C'est là toute sa
// valeur, et c'est l'emploi que ce module lui donne : marcher sur les
// structures adverses, sans se soucier de l'escorte.
//
// Les chiffres qui commandent le siège (`rules.js`, BUILDING_STATS) :
//   - maison : 2 PV, aucune riposte → détruite en un coup, chaque tour ;
//   - tour d'attaque : 2 PV mais 10 d'attaque → un coup la détruit, et coûte 10
//     des 12 PV du paladin : jamais deux dans le même tour ni à PV entamés ;
//   - tour de défense : 10 PV, riposte 2 ; base : 64 PV, aucune riposte.
// D'où la règle unique de ce module : on ne frappe que ce à quoi on SURVIT.
//
// Le défi (deux tours consécutifs sans agir) n'est pas provoqué : il arrive
// tout seul (mesuré : dans 4 à 9 parties sur 10, un niveau 4 finit par rester
// deux tours sans rien faire). On saisit l'occasion, comme le Moine avec ses
// niveaux 2 restés purs — geler volontairement un niveau 4 deux tours coûterait
// plus que le bonus ne rapporte.

import {getLogicalBoard} from '../../board.js';
import {hexDistance} from '../../../data/hex.js';
import {BUILDING_STATS, combatResult} from '../../rules.js';
import {BONUS_OFFERS, bonusPriceOf, isBonusUnlocked, bonusTotalUpkeep} from '../../../data/soldier.js';
import {buyBonus, attackSoldier, moveSoldier} from '../../actions.js';
import {incomeFor} from '../../selectors.js';
import {reachableFor, cellQR} from '../helpers.js';
import {stepCells} from '../movement.js';

// Un seul paladin : à 32 or/tour tout compris, c'est déjà le poste le plus cher
// du bot, et un bélier suffit à ouvrir une brèche — c'est l'armée derrière qui
// exploite, pas lui.
const MAX_PALADINS = 1;
// Revenu (or/tour) qui doit RESTER une fois son entretien payé.
const PALADIN_INCOME_FLOOR = 20;

// Valeur de siège d'une structure, du plus urgent au moins pressé :
//   - la tour d'attaque tue nos soldats à 10 par coup : la faire tomber vaut
//     mieux que tout le reste, et elle n'a que 2 PV ;
//   - la maison est le revenu adverse, et tombe en un coup ;
//   - la tour de défense bloque un passage sans vraiment mordre ;
//   - la base est un chantier (64 PV) : on ne s'y met que faute de mieux.
const SIEGE_VALUE = {attackTower: 400, house: 300, defenseTower: 150, base: 100};

function paladinCount(state, playerId) {
    let n = 0;
    for (const u of state.placements.values()) {
        if (u.type === 'soldier' && u.playerId === playerId && u.bonus === 'paladin') n += 1;
    }
    return n;
}

// Structures ennemies de la carte : bâtiments posés + bases encore debout.
// Renvoie [{id, kind}] trié par case (déterminisme).
function enemyStructures(state, playerId) {
    const board = getLogicalBoard(state.mapId);
    const out = [];
    for (const [id, u] of state.placements) {
        if (u.type === 'soldier' || u.type === 'tree' || u.type === 'chest') continue;
        if (u.playerId === playerId || !SIEGE_VALUE[u.type]) continue;
        out.push({id, kind: u.type});
    }
    for (const id of board.baseIds) {
        if (state.destroyedBases?.has(id)) continue;
        const owner = state.ownership.get(id);
        if (owner && owner !== playerId) out.push({id, kind: 'base'});
    }
    out.sort((a, b) => (a.id < b.id ? -1 : 1));
    return out;
}

// Le paladin survit-il au coup qu'il porte ? Les tours ripostent (voir
// `BUILDING_STATS`) : une tour d'attaque emporte 10 des 12 PV du paladin, donc
// se prend à PV pleins et une seule fois.
function survivesSiege(P, kind, target) {
    const stats = BUILDING_STATS[kind] ?? {};
    const defender = target ?? {type: kind, hp: stats.hp ?? 1, atk: stats.atk ?? 0};
    const res = combatResult(P, {...defender, atk: defender.atk ?? stats.atk ?? 0});
    return !res.attacker.dead;
}

// Meilleur siège jouable ce tour par le paladin de `fromId` : la structure
// ennemie atteignable la plus utile à laquelle il survit. `null` si aucune.
function bestSiege(state, fromId) {
    const P = state.placements.get(fromId);
    if (!P) return null;
    const reach = reachableFor(state, P.playerId, fromId);
    const targets = enemyStructures(state, P.playerId);
    let best = null;
    for (const {id, kind} of targets) {
        if (reach.moves.get(id)?.kind !== 'combat') continue;
        if (!survivesSiege(P, kind, state.placements.get(id))) continue;
        const score = SIEGE_VALUE[kind];
        if (!best || score > best.score || (score === best.score && id < best.id)) {
            best = {id, score};
        }
    }
    return best;
}

// Case sûre qui rapproche le plus de la structure ennemie la plus proche. « Sûre »
// a ici un sens particulier : le paladin ne craint QUE les porteurs d'affinité
// (les seuls à pouvoir le combattre), pas l'armée ordinaire — c'est tout
// l'intérêt de l'envoyer devant.
function marchStep(state, fromId) {
    const P = state.placements.get(fromId);
    if (!P) return null;
    const targets = enemyStructures(state, P.playerId).map((s) => cellQR(s.id));
    if (!targets.length) return null;
    const distTo = (id) => {
        const c = cellQR(id);
        let d = Infinity;
        for (const t of targets) d = Math.min(d, hexDistance(c, t));
        return d;
    };

    let best = null;
    let bestDist = distTo(fromId);
    for (const {toId} of stepCells(state, P, fromId)) {
        if (threatenedByAffinity(state, toId, P)) continue;
        const d = distTo(toId);
        if (d < bestDist || (d === bestDist && best && toId < best)) {
            bestDist = d;
            best = toId;
        }
    }
    return best;
}

// Un ennemi CAPABLE de le combattre (donc porteur d'une affinité, bouclier
// compris) peut-il l'atteindre sur cette case, et en sortir gagnant ? Le reste
// de l'armée adverse ne compte pas : elle ne peut pas le toucher.
function threatenedByAffinity(state, cellId, P) {
    for (const [eid, e] of state.placements) {
        if (e.type !== 'soldier' || e.playerId === P.playerId || !e.affinity) continue;
        if (reachableFor(state, e.playerId, eid).moves.get(cellId)?.kind !== 'combat') continue;
        if (combatResult(e, P).defender.dead) return true;
    }
    return false;
}

// Fait jouer les paladins AVANT les phases ordinaires : ils marchent sur les
// structures adverses au lieu d'être employés comme des soldats quelconques (ce
// que ferait le reste du bot, qui ne sait rien de leur immunité et les verrait
// simplement comme des unités sans cible).
export function runPaladins(state, playerId, apply) {
    let cur = state;
    for (const [fromId, u] of [...cur.placements].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus !== 'paladin') continue;
        if (cur.movedSoldiers.has(u.uid)) continue;

        const siege = bestSiege(cur, fromId);
        if (siege) {
            const next = apply(attackSoldier(fromId, siege.id));
            if (next) {
                cur = next;
                /* eslint-disable-next-line no-console */
                console.log(`[bot]   paladin ${fromId} assiège ${siege.id}`);
                continue;
            }
        }
        const step = marchStep(cur, fromId);
        if (step) {
            const next = apply(moveSoldier(fromId, step));
            if (next) cur = next;
        }
    }
    return cur;
}

// Équipe le Paladin sur un niveau 4 dont le défi (deux tours consécutifs sans
// agir) s'est rempli tout seul, quand la bourse ET le revenu suivent : c'est le
// poste le plus cher du bot (32 or/tour), il ne se prend pas sur un revenu
// juste. À égalité, le niveau 4 le plus proche des structures adverses — c'est
// là qu'il va.
export function equipPaladins(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.paladin === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'paladin');
    if (!bonus) return state;
    if (paladinCount(state, playerId) >= MAX_PALADINS) return state;

    const price = bonusPriceOf(bonus, state.settings);
    if ((state.gold?.[playerId] || 0) < price) return state;
    const upkeep = bonusTotalUpkeep(bonus, state.settings);
    if (incomeFor(state, playerId) - upkeep < PALADIN_INCOME_FLOOR) return state;

    const structures = enemyStructures(state, playerId).map((s) => cellQR(s.id));
    if (!structures.length) return state; // rien à assiéger : le bélier ne sert à rien

    const candidates = [];
    for (const [id, u] of state.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || u.unit) continue;
        if ((u.level || 1) !== bonus.requiredLevel) continue;
        if (!isBonusUnlocked(u, bonus, state.settings, state)) continue; // défi pas (encore) rempli
        const c = cellQR(id);
        let d = Infinity;
        for (const s of structures) d = Math.min(d, hexDistance(c, s));
        candidates.push({id, dist: d});
    }
    candidates.sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : 1));

    for (const c of candidates) {
        const next = apply(buyBonus(c.id, 'paladin'));
        if (!next) continue;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${c.id} équipé Paladin (structure adverse à ${c.dist} cases)`);
        return next;
    }
    return state;
}
