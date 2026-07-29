// Bonus « Aventurier » (5 or/case conquise) — premier bonus économique du bot

import {getNeighbors, hexId} from '../../../data/hex.js';
import {getLogicalBoard} from '../../board.js';
import {BONUS_OFFERS, bonusPriceOf, isBonusUnlocked} from '../../../data/soldier.js';
import {buyBonus} from '../../actions.js';
import {inEnemyRange} from '../threat.js';

// Nombre de cases NEUTRES (jamais possédées) atteignables depuis `fromId` en
// restant dans une région SÛRE : on ne traverse que du territoire à nous ou
// neutre, praticable, et jamais à portée d'un ennemi (`inEnemyRange`) — le
// territoire adverse et les abords dangereux arrêtent le parcours (BFS, sans
// limite de portée : c'est le potentiel du soldat sur PLUSIEURS tours, pas
// seulement celui-ci). Sert à choisir QUI équiper l'Aventurier : ça ne vaut le
// coup que sur un soldat qui va encore conquérir longtemps en sécurité, pas sur
// un qui est presque à court de terrain ou en bordure d'un ennemi.
function safeExpansionPotential(state, board, ownerId, fromId) {
    const seen = new Set([fromId]);
    let front = [fromId];
    let count = 0;
    while (front.length) {
        const next = [];
        for (const id of front) {
            const cell = board.cellMap.get(id);
            if (!cell) continue;
            for (const nb of getNeighbors(cell.q, cell.r)) {
                const nid = hexId(nb.q, nb.r);
                if (seen.has(nid)) continue;
                const ncell = board.cellMap.get(nid);
                if (!ncell || ncell.blocked) continue;
                const owner = state.ownership.get(nid);
                if (owner && owner !== ownerId) continue; // territoire ennemi : la région sûre s'arrête là
                seen.add(nid);
                if (inEnemyRange(state, nid, ownerId)) continue; // à portée d'un ennemi : ni sûr, ni un relais
                next.push(nid);
                if (!owner) count += 1; // case neutre = une conquête (et 5 or) potentielle
            }
        }
        front = next;
    }
    return count;
}

// Marge au-dessus du seuil de rentabilité (prix 20 or ÷ 5 or/case = 4 cases) :
// le soldat ne capturera sans doute pas toute la région à lui seul (d'autres
// soldats à nous s'en partagent parfois l'accès), et on veut un vrai profit,
// pas un simple équilibre.
const ADVENTURER_MIN_POTENTIAL = 6;

// Équipe l'Aventurier sur les soldats de niveau 1 sans bonus qui ont déjà
// rempli son défi (3 conquêtes PAR CE soldat, voir `isBonusUnlocked`) ET qui
// ont encore une grande région sûre à conquérir devant eux. Un soldat qui
// remplit le défi mais dont le territoire touche à sa fin n'est PAS équipé :
// le bonus ne rapporterait plus grand-chose.
export function equipAdventurers(state, playerId, apply) {
    if (state.settings?.bonusesEnabled === false) return state;
    if (state.settings?.bonusEnabled?.adventurer === false) return state;
    const bonus = BONUS_OFFERS.find((b) => b.id === 'adventurer');
    if (!bonus) return state;
    const board = getLogicalBoard(state.mapId);
    const price = bonusPriceOf(bonus, state.settings);

    let cur = state;
    const candidates = [];
    for (const [id, u] of cur.placements) {
        if (u.type !== 'soldier' || u.playerId !== playerId || u.bonus || (u.level || 1) !== 1) continue;
        if (!isBonusUnlocked(u, bonus, cur.settings, cur)) continue; // défi pas encore rempli
        candidates.push(id);
    }
    candidates.sort((a, b) => (a < b ? -1 : 1)); // déterminisme

    for (const id of candidates) {
        if ((cur.gold?.[playerId] || 0) < price) break;
        const potential = safeExpansionPotential(cur, board, playerId, id);
        if (potential < ADVENTURER_MIN_POTENTIAL) continue;
        const next = apply(buyBonus(id, 'adventurer'));
        if (!next) continue;
        cur = next;
        /* eslint-disable-next-line no-console */
        console.log(`[bot]   soldat ${id} équipé Aventurier (région sûre : ${potential} cases)`);
    }
    return cur;
}
