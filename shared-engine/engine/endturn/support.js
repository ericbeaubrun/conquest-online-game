// Effets de fin de tour : ENTRAIDE (et prédation) entre soldats voisins.
//
// Les quatre suivent la même trame — repérer les porteurs du bonus, élire UNE
// cible adjacente, procéder à l'échange — d'où l'usage de `pickAlly`, qui porte
// la règle de départage commune (à égalité, le premier voisin l'emporte).

import {SOLDIER_ATK_MAX, SOLDIER_HP_MAX} from '../rules.js';
import {
    ALCHEMIST_ATK_BUFF,
    ALCHEMIST_HP_COST,
    PRIEST_HP_GIFT,
    PRIEST_HP_COST,
    VAMPIRE_DRAIN,
    MAGICIAN_GOLD_REWARD,
} from '../../data/soldier.js';
import {soldiersWithBonus, pickAlly, neighborAllies} from './helpers.js';

// Bonus « Alchimiste » : chaque alchimiste SACRIFIE 1 de ses PV pour donner +1
// attaque (plafonnée) à UN allié adjacent — le soldat allié voisin le MOINS
// offensif, celui qui en a le plus besoin. Chaque alchimiste agit sur sa propre
// cible ; un même allié peut cumuler les dons de plusieurs alchimistes.
//
// L'échange n'a lieu que s'il profite aux deux bouts : un alchimiste à 1 PV ne
// se sacrifie pas (il mourrait), et personne ne se saigne pour un allié dont
// l'attaque est déjà au plafond.
export function applyAlchemists(ctx) {
    const {state, board, events, placements: placementsIn} = ctx;
    const pid = state.activePlayerId;
    const alchemists = soldiersWithBonus(placementsIn, pid, 'alchemist');
    if (!alchemists.length) return ctx;

    const placements = new Map(placementsIn);
    for (const [id] of alchemists) {
        // Un alchimiste ne se sacrifie pas jusqu'à la mort : il lui faut plus de
        // PV que ce que coûte la transmutation.
        const alchemist = placements.get(id);
        if ((alchemist.hp || 0) <= ALCHEMIST_HP_COST) continue;
        const bestId = pickAlly(board, placements, pid, id, (ally) =>
            (ally.atk || 0) < SOLDIER_ATK_MAX ? ally.atk || 0 : null
        );
        if (bestId == null) continue;
        placements.set(id, {...alchemist, hp: (alchemist.hp || 0) - ALCHEMIST_HP_COST});
        const ally = placements.get(bestId);
        placements.set(bestId, {
            ...ally,
            atk: Math.min((ally.atk || 0) + ALCHEMIST_ATK_BUFF, SOLDIER_ATK_MAX),
        });
        events.push({kind: 'bonusAlchemist', playerId: pid});
    }
    return {...ctx, placements};
}

// Bonus « Prêtre » : chaque prêtre prend sur sa propre vie pour soigner l'allié
// adjacent le PLUS MAL EN POINT (jamais lui-même). Sans cible éligible, il ne
// perd rien. Comme pour l'« Alchimiste », l'échange n'a lieu que s'il profite aux
// deux bouts : un prêtre à 1 PV ne se sacrifie pas, et personne ne se saigne
// pour un allié déjà au maximum de ses PV.
export function applyPriests(ctx) {
    const {state, board, events, placements: placementsIn} = ctx;
    const pid = state.activePlayerId;
    const priests = soldiersWithBonus(placementsIn, pid, 'priest');
    if (!priests.length) return ctx;

    const placements = new Map(placementsIn);
    for (const [id] of priests) {
        const priest = placements.get(id);
        if ((priest.hp || 0) <= PRIEST_HP_COST) continue;
        const bestId = pickAlly(board, placements, pid, id, (ally) =>
            (ally.hp || 0) < SOLDIER_HP_MAX ? ally.hp || 0 : null
        );
        if (bestId == null) continue;
        placements.set(id, {...priest, hp: (priest.hp || 0) - PRIEST_HP_COST});
        const ally = placements.get(bestId);
        placements.set(bestId, {...ally, hp: Math.min((ally.hp || 0) + PRIEST_HP_GIFT, SOLDIER_HP_MAX)});
        events.push({kind: 'bonusPriest', playerId: pid});
    }
    return {...ctx, placements};
}

// Bonus « Vampire » : chaque vampire draine VAMPIRE_DRAIN PV à UN SEUL soldat
// allié adjacent — le MIEUX PORTANT, celui qui s'en remettra le mieux — et
// récupère pour lui les PV volés (plafonnés au maximum d'un soldat). Un allié à
// 1 PV n'est jamais mordu : le vampire n'achève pas les siens, et un voisin
// exsangue ne fait donc pas écran à un autre.
export function applyVampires(ctx) {
    const {state, board, events, placements: placementsIn} = ctx;
    const pid = state.activePlayerId;
    const vampires = soldiersWithBonus(placementsIn, pid, 'vampire');
    if (!vampires.length) return ctx;

    const placements = new Map(placementsIn);
    for (const [id] of vampires) {
        // Victime : l'allié adjacent ayant le PLUS de PV, à condition qu'il lui
        // en reste à céder (jamais en dessous de 1 PV).
        const victimId = pickAlly(
            board,
            placements,
            pid,
            id,
            (ally) => ((ally.hp || 0) > 1 ? ally.hp || 0 : null),
            'max'
        );
        if (victimId == null) continue;
        const victim = placements.get(victimId);
        // On draine au plus VAMPIRE_DRAIN, sans jamais descendre la victime sous 1 PV.
        const stolen = Math.min(VAMPIRE_DRAIN, (victim.hp || 0) - 1);
        placements.set(victimId, {...victim, hp: (victim.hp || 0) - stolen});
        const vamp = placements.get(id);
        placements.set(id, {...vamp, hp: Math.min((vamp.hp || 0) + stolen, SOLDIER_HP_MAX)});
        events.push({kind: 'bonusVampire', playerId: pid, amount: stolen});
    }
    return {...ctx, placements};
}

// Bonus « Magicien » : chaque magicien transmet SA PROPRE affinité à UN allié
// adjacent sans affinité — jamais lui-même — et rapporte MAGICIAN_GOLD_REWARD or
// à son propriétaire par don. Le bénéficiaire est TIRÉ AU SORT parmi les alliés
// éligibles : cet effet consomme donc le générateur aléatoire.
export function applyMagicians(ctx) {
    const {state, board, rng, events, placements: placementsIn} = ctx;
    const pid = state.activePlayerId;
    const magicians = soldiersWithBonus(placementsIn, pid, 'magician');
    if (!magicians.length) return ctx;

    const placements = new Map(placementsIn);
    let goldGained = 0;
    for (const [id] of magicians) {
        // Le magicien transmet SA PROPRE affinité : sans affinité, rien à donner.
        const affinity = placements.get(id)?.affinity ?? null;
        if (!affinity) continue;
        const targets = neighborAllies(board, placements, pid, id)
            .filter(([, ally]) => ally.affinity == null)
            .map(([nid]) => nid);
        if (!targets.length) continue;
        const targetId = targets[rng.int(targets.length)];
        const ally = placements.get(targetId);
        placements.set(targetId, {...ally, affinity});
        goldGained += MAGICIAN_GOLD_REWARD;
        events.push({kind: 'bonusMagician', playerId: pid, affinity, gold: MAGICIAN_GOLD_REWARD});
    }
    if (!goldGained) return {...ctx, placements};
    return {...ctx, placements, income: ctx.income + goldGained};
}
