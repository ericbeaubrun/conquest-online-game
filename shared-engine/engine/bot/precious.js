// Protection des unités précieuses (roi, guerrier, soutiens)

import {moveSoldier, chopTree} from '../actions.js';
import {soldiersOf, isProtectedUnit, isMeditatingLvl4, probeMoved} from './helpers.js';
import {preciousCellUnsafe} from './threat.js';
import {distToNearestEnemy, stepCells} from './movement.js';
import {bestConquestAction, conquestActionCreator} from './conquest.js';
import {magicianMove} from './bonuses/magician.js';
import {alchemistMove} from './bonuses/alchemist.js';
import {priestMove} from './bonuses/priest.js';
import {druidTreeTarget, druidForbiddenCells, druidApproachCell} from './bonuses/druid.js';

// Bonus de SOUTIEN À L'ADJACENCE : leur contribution n'est pas la conquête mais
// un DON à leurs voisins alliés (affinité, attaque, PV — voir `endturn/support.js`),
// et un porteur isolé ne donne RIEN. Chacun sait dire où il vaut mieux se tenir ;
// c'est la seule chose qui distingue leur tour de celui des autres précieuses.
const SUPPORT_MOVES = {
    magician: magicianMove,
    alchemist: alchemistMove,
    priest: priestMove,
};

// Joue une unité précieuse : elle ne se bat JAMAIS. La fuite n'est priorisée QUE
// si un ennemi semble vouloir s'en approcher (sa case est dangereuse — voir
// `preciousCellUnsafe`, portée d'attaque ou d'achat-frappe) ; elle recule alors
// vers la case la plus SÛRE atteignable. SANS ce signe de danger, elle n'est pas
// menacée : elle contribue normalement (conquête de cases neutres, récolte de
// coffres/arbres), en restant simplement à l'écart de toute case dangereuse.
function playPreciousUnit(state, fromId, apply) {
    const S = state.placements.get(fromId);
    if (!S || S.type !== 'soldier') return state;
    const owner = S.playerId;

    // Niveau 4 en méditation (voir `isMeditatingLvl4`) : son tour consiste
    // précisément à NE RIEN FAIRE — agir remettrait à zéro le compteur qui lui
    // ouvre le Paladin. Sauf si ce bonus est hors jeu : il n'aurait alors plus
    // rien à attendre de son immobilité et joue comme les autres.
    if (isMeditatingLvl4(S) && state.settings?.bonusesEnabled !== false &&
        state.settings?.bonusEnabled?.paladin !== false) {
        return state;
    }

    if (!preciousCellUnsafe(state, fromId, owner)) {
        // Démoniste : sa seule vraie action est de NE RIEN FAIRE (voir
        // `bonuses/warlock.js`) — bouger, même pour conquérir une case vide,
        // lui coûte sa chance d'invocation de ce tour. Contrairement aux
        // soutiens à l'adjacence ci-dessous, il n'y a ici NI case à rejoindre
        // NI récolte qui vaille mieux que l'inaction : on s'arrête avant
        // `bestConquestAction`.
        if (S.bonus === 'warlock') return state;

        // Soutien à l'adjacence (magicien : une affinité ; alchimiste : de
        // l'attaque ; prêtre : des PV) — tant qu'il est tranquille, il va se
        // coller au paquet d'alliés qu'il sert le mieux, en ne considérant que
        // des cases sûres. Sans meilleure case, il joue comme les autres
        // précieuses (conquête / récolte, ci-dessous).
        const supportMove = SUPPORT_MOVES[S.bonus];
        if (supportMove) {
            const safe = stepCells(state, S, fromId).filter(
                ({toId}) => !preciousCellUnsafe(probeMoved(state, fromId, toId), toId, owner)
            );
            const to = supportMove(state, fromId, safe);
            if (to) return apply(moveSoldier(fromId, to)) || state;
        }
        // Druide : abattre un arbre, pour lui, c'est RECRUTER une unité à 16
        // or/tour (voir `bonuses/druid.js`). Sa transformation est jouée ICI,
        // directement, et jamais laissée à `bestConquestAction` : celle-ci
        // réserve chaque arbre au bûcheron le plus proche (`nearestLumberjack`)
        // — une règle faite pour l'économie, qui privait le druide de la
        // totalité de la forêt. À défaut d'arbre transformable ce tour, il
        // AVANCE vers le plus proche qui vaille la peine.
        let reserved = new Set();
        if (S.bonus === 'druid') {
            const tree = druidTreeTarget(state, fromId);
            if (tree) return apply(chopTree(fromId, tree)) || state;
            const safeSteps = stepCells(state, S, fromId).filter(
                ({toId}) => !preciousCellUnsafe(probeMoved(state, fromId, toId), toId, owner)
            );
            const step = druidApproachCell(state, fromId, safeSteps);
            if (step) return apply(moveSoldier(fromId, step)) || state;
            // Aucun arbre à rejoindre : il joue comme les autres, mais sans
            // jamais transformer par opportunisme (tous les arbres réservés).
            reserved = druidForbiddenCells(state, fromId);
        }
        // Aucun ennemi ne semble s'approcher : pas de danger, on avance librement
        // (conquête / récolte), en évitant toute case qui deviendrait dangereuse.
        const act = bestConquestAction(state, S, fromId, reserved, {
            avoidRange: true,
            unsafeCheck: preciousCellUnsafe,
        });
        if (act) {
            const next = apply(conquestActionCreator(act.kind, fromId, act.toId));
            return next || state;
        }
        return state;
    }

    // Clé de sûreté d'une case (plus haut = plus sûr), par ordre lexicographique :
    //   1. hors de TOUT danger (soldat ennemi ET achat-frappe) — le plus important ;
    //   2. le plus loin possible de l'ennemi le plus proche (plus dur à atteindre) ;
    //   3. rester sur notre territoire (protection des structures/alliés).
    const safetyKey = (toId) => {
        const probe = toId === fromId ? state : probeMoved(state, fromId, toId);
        const safe = preciousCellUnsafe(probe, toId, owner) ? 0 : 1;
        const dist = distToNearestEnemy(state, toId, owner);
        const own = state.ownership.get(toId) === owner ? 1 : 0;
        return safe * 1e7 + Math.min(dist, 99) * 100 + own;
    };

    let best = fromId;
    let bestKey = safetyKey(fromId);
    for (const {toId} of stepCells(state, S, fromId)) {
        const k = safetyKey(toId);
        if (k > bestKey || (k === bestKey && toId < best)) {
            bestKey = k;
            best = toId;
        }
    }
    if (best !== fromId) return apply(moveSoldier(fromId, best)) || state;
    return state; // acculée : rester est déjà le moins pire
}

// Met à l'abri toutes nos unités précieuses AVANT le reste du tour. Chacune est
// ensuite ignorée par les autres phases (elles filtrent `isProtectedUnit`).
export function protectPreciousUnits(state, playerId, apply) {
    let cur = state;
    for (const [fromId] of soldiersOf(cur, (u) => u.playerId === playerId && isProtectedUnit(u))) {
        const s = cur.placements.get(fromId);
        if (!s || s.playerId !== playerId || cur.movedSoldiers.has(s.uid)) continue;
        cur = playPreciousUnit(cur, fromId, apply);
    }
    return cur;
}
