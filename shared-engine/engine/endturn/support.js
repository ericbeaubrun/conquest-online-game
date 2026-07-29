// Effets de fin de tour : ENTRAIDE (et prédation) entre soldats voisins.
//
// Tous repèrent d'abord leurs porteurs, puis servent leurs voisins alliés. Deux
// familles s'y distinguent : le « Vampire » et le « Magicien » n'élisent QU'UNE
// cible (d'où `pickAlly`, qui porte la règle de départage commune — à égalité, le
// premier voisin l'emporte) ; l'« Alchimiste » et le « Prêtre » servent TOUT leur
// voisinage, en payant leur don allié par allié.

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

// Bonus « Alchimiste » : chaque alchimiste arme TOUS ses voisins alliés d'un
// coup — +1 attaque (plafonnée) à chacun — et paie ALCHEMIST_HP_COST PV PAR
// allié servi. Un même allié peut cumuler les dons de plusieurs alchimistes.
//
// L'échange ne se fait que s'il profite aux deux bouts : un allié dont l'attaque
// est déjà au plafond est sauté (sans rien coûter), et l'alchimiste s'arrête dès
// que le don suivant le tuerait — il finit toujours son tour à 1 PV au moins.
// Entouré de six alliés, un alchimiste à 3 PV n'en arme donc que deux.
export function applyAlchemists(ctx) {
    const {state, board, events, placements: placementsIn} = ctx;
    const pid = state.activePlayerId;
    const alchemists = soldiersWithBonus(placementsIn, pid, 'alchemist');
    if (!alchemists.length) return ctx;

    const placements = new Map(placementsIn);
    for (const [id] of alchemists) {
        let alchemist = placements.get(id);
        let served = 0;
        for (const [nid] of neighborAllies(board, placements, pid, id)) {
            // Un alchimiste ne se sacrifie pas jusqu'à la mort.
            if ((alchemist.hp || 0) - ALCHEMIST_HP_COST < 1) break;
            const ally = placements.get(nid); // relu : un autre porteur a pu le servir
            if ((ally.atk || 0) >= SOLDIER_ATK_MAX) continue;
            alchemist = {...alchemist, hp: (alchemist.hp || 0) - ALCHEMIST_HP_COST};
            placements.set(nid, {
                ...ally,
                atk: Math.min((ally.atk || 0) + ALCHEMIST_ATK_BUFF, SOLDIER_ATK_MAX),
            });
            served += 1;
        }
        if (!served) continue;
        placements.set(id, alchemist);
        events.push({kind: 'bonusAlchemist', playerId: pid, count: served});
    }
    return {...ctx, placements};
}

// Bonus « Prêtre » : chaque prêtre prend sur sa propre vie pour soigner TOUS ses
// voisins alliés d'un coup (jamais lui-même), au prix de PRIEST_HP_COST PV PAR
// allié soigné. Mêmes garde-fous que l'« Alchimiste », dont il est le pendant :
// un allié déjà au maximum de ses PV est sauté sans rien coûter, et le prêtre
// s'arrête avant le don qui le tuerait. L'échange lui est FAVORABLE (il rend
// PRIEST_HP_GIFT PV pour PRIEST_HP_COST prélevé) : entouré, il transforme sa
// réserve de PV en une réserve plus grande, répartie sur son escorte.
export function applyPriests(ctx) {
    const {state, board, events, placements: placementsIn} = ctx;
    const pid = state.activePlayerId;
    const priests = soldiersWithBonus(placementsIn, pid, 'priest');
    if (!priests.length) return ctx;

    const placements = new Map(placementsIn);
    for (const [id] of priests) {
        let priest = placements.get(id);
        let healed = 0;
        for (const [nid] of neighborAllies(board, placements, pid, id)) {
            if ((priest.hp || 0) - PRIEST_HP_COST < 1) break;
            const ally = placements.get(nid); // relu : un autre prêtre a pu le soigner
            if ((ally.hp || 0) >= SOLDIER_HP_MAX) continue;
            priest = {...priest, hp: (priest.hp || 0) - PRIEST_HP_COST};
            placements.set(nid, {...ally, hp: Math.min((ally.hp || 0) + PRIEST_HP_GIFT, SOLDIER_HP_MAX)});
            healed += 1;
        }
        if (!healed) continue;
        placements.set(id, priest);
        events.push({kind: 'bonusPriest', playerId: pid, count: healed});
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
