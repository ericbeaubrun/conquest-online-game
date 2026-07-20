// Effets de fin de tour : INVOCATIONS et SORTS (« Démoniste », « Sorcier »).
// Seuls effets à faire naître de nouvelles unités : ils consomment donc le
// compteur d'identifiants `uidSeq`, qui doit rester monotone et déterministe.

import {WARLOCK_SUMMON_CHANCE} from '../../data/soldier.js';
import {curseFor, isCursable} from '../../data/units.js';
import {makeUnit, makeCursed} from '../factories.js';
import {soldiersWithBonus, freeOwnedNeighbor} from './helpers.js';

// Bonus « Démoniste » : chaque démoniste N'AYANT PAS AGI ce tour (ni déplacé, ni
// fusionné, ni attaqué, ni abattu — absent de `movedSoldiers`) invoque un
// squelette allié fragile (espèce `skeleton2`) sur une case voisine CONQUISE par
// le joueur. L'invocation n'est pas systématique : elle a une chance fixe de se
// produire chaque tour. Le squelette hérite de l'élément de son invocateur.
export function spawnWarlockSkeletons(ctx) {
    const {state, board, rng, events, placements: placementsIn} = ctx;
    const pid = state.activePlayerId;
    const warlocks = soldiersWithBonus(placementsIn, pid, 'warlock').filter(
        ([, p]) => !state.movedSoldiers.has(p.uid)
    );
    if (!warlocks.length) return ctx;

    const placements = new Map(placementsIn);
    let uidSeq = ctx.uidSeq;
    for (const [id, warlock] of warlocks) {
        if (!board.cellMap.get(id)) continue;
        // Tirage : l'invocation ne se déclenche qu'avec une certaine probabilité.
        if (rng.next() >= WARLOCK_SUMMON_CHANCE) continue;
        const spot = freeOwnedNeighbor(state, board, placements, pid, id);
        if (!spot) continue;
        uidSeq += 1;
        placements.set(spot, makeUnit('skeleton2', pid, `s${uidSeq}`, warlock.affinity ?? null));
        events.push({kind: 'bonusWarlock', playerId: pid});
    }
    return {...ctx, placements, uidSeq};
}

// Bonus « Sorcier » : chaque sorcier jette son sort sur TOUS les soldats ENNEMIS
// portant l'un des trois autres bonus de niveau 5 — le roi devient un cochon, le
// démoniste une couronne, le conquérant une grenouille : des créatures 1/1 sans
// effet, qui gardent leur affinité et restent à leur propriétaire.
//
// Si le plateau ne porte AUCUNE de ces trois cibles (ni chez l'ennemi, ni chez
// soi), le sort se reporte sur une invocation : un dragon sur une case libre du
// territoire, voisine du sorcier. Une seule fois par sorcier (`dragonSummoned`),
// sans quoi il en produirait un à chaque tour.
export function applySorcerers(ctx) {
    const {state, board, events, placements: placementsIn} = ctx;
    const pid = state.activePlayerId;
    const sorcerers = soldiersWithBonus(placementsIn, pid, 'sorcerer');
    if (!sorcerers.length) return ctx;

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

    if (victims.length) {
        const placements = new Map(placementsIn);
        for (const id of victims) {
            const victim = placements.get(id);
            placements.set(id, makeCursed(victim, curseFor(victim.bonus)));
        }
        events.push({kind: 'bonusSorcerer', playerId: pid, count: victims.length});
        return {...ctx, placements};
    }
    if (anyOnBoard) return ctx; // cibles alliées seules : rien à faire

    // Aucune cible nulle part : invocation du dragon, une fois par sorcier.
    const placements = new Map(placementsIn);
    let uidSeq = ctx.uidSeq;
    let summoned = false;
    for (const [id] of sorcerers) {
        const sorcerer = placements.get(id);
        if (sorcerer.dragonSummoned) continue;
        if (!board.cellMap.get(id)) continue;
        const spot = freeOwnedNeighbor(state, board, placements, pid, id);
        if (!spot) continue; // aucune case d'accueil : le sorcier retentera au prochain tour
        uidSeq += 1;
        placements.set(spot, makeUnit('dragon', pid, `s${uidSeq}`));
        placements.set(id, {...sorcerer, dragonSummoned: true});
        summoned = true;
        events.push({kind: 'bonusSorcererDragon', playerId: pid});
    }
    return summoned ? {...ctx, placements, uidSeq} : ctx;
}
