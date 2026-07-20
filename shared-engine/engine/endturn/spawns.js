// Effets de fin de tour : APPARITIONS (arbres, arbres de fermier, coffres).
// Seuls effets à consommer le générateur aléatoire avant les invocations : leur
// ordre dans le pipeline fixe donc tout le flux d'aléa du tour.

import {TREE_MAX_RATIO} from '../rules.js';
import {makeTree} from '../../data/trees.js';
import {makeChest} from '../../data/chests.js';
import {getNeighbors, hexId} from '../../data/hex.js';
import {soldiersWithBonus} from './helpers.js';

// Apparition d'arbres en fin de tour. Chaque tour, une « vague » d'arbres a une
// certaine probabilité de survenir (`treeSpawnChance`) ; le cas échéant, elle
// pose entre `treeSpawnMin` et `treeSpawnMax` arbres. Le tout reste borné par le
// plafond global (`treeDensity` de la carte).
export function spawnTrees(ctx) {
    const {state, board, rng, placements: placementsIn} = ctx;
    const s = state.settings;
    // Apparition des arbres désactivable en configuration.
    if (s && s.treesEnabled === false) return ctx;
    // Densité maximale configurable (pourcentage → ratio) ; défaut = barème.
    const ratio = s?.treeDensity != null ? s.treeDensity / 100 : TREE_MAX_RATIO;
    const cap = Math.floor(board.cells.length * ratio);
    let treeCount = 0;
    for (const p of placementsIn.values()) if (p.type === 'tree') treeCount += 1;
    const room = cap - treeCount;
    if (room <= 0) return ctx;

    // Probabilité qu'une vague apparaisse ce tour (0..1).
    const chance = (s?.treeSpawnChance ?? 50) / 100;
    if (rng.next() >= chance) return ctx;
    // Nombre d'arbres de la vague : entier tiré dans [min, max] (min ≤ max).
    const min = Math.max(0, s?.treeSpawnMin ?? 0);
    const max = Math.max(min, s?.treeSpawnMax ?? 2);
    let want = min + rng.int(max - min + 1);
    want = Math.min(want, room);
    if (want <= 0) return ctx;

    // Cases éligibles : libres, non bloquées (eau), hors base.
    const eligible = board.cells.filter(
        (c) => !c.blocked && !board.baseIds.has(c.id) && !placementsIn.has(c.id)
    );
    if (!eligible.length) return ctx;

    const placements = new Map(placementsIn);
    for (let i = 0; i < want && eligible.length; i += 1) {
        const idx = rng.int(eligible.length);
        const [cell] = eligible.splice(idx, 1);
        placements.set(cell.id, makeTree(rng)); // essence tirée au coefficient d'apparition
    }
    return {...ctx, placements};
}

// Bonus « Fermier » : chaque soldat-fermier du joueur actif fait apparaître 0 à
// 2 arbres sur des cases collées à SON territoire (frontière), indépendamment du
// système d'apparition normal (n'entre pas dans le plafond / la montée en
// intensité). Un fermier ne produit QUE s'il se tient lui-même sur une case
// frontière (sa case borde au moins une case qui n'appartient pas au joueur) :
// un fermier enfoui au cœur du territoire ne fait rien pousser.
export function spawnFarmerTrees(ctx) {
    const {state, board, rng, events, placements: placementsIn} = ctx;
    // Rien à faire si les arbres sont désactivés en configuration.
    if (state.settings && state.settings.treesEnabled === false) return ctx;
    const pid = state.activePlayerId;
    // Une case est « frontière » quand elle borde au moins une case qui n'est pas
    // au joueur (même définition pour la case du fermier et les cases de pousse).
    const isFrontier = (q, r) =>
        getNeighbors(q, r).some((n) => state.ownership.get(hexId(n.q, n.r)) !== pid);
    // Combien de fermiers du joueur actif se tiennent SUR une case frontière ?
    let farmers = 0;
    for (const [id] of soldiersWithBonus(placementsIn, pid, 'farmer')) {
        const cell = board.cellMap.get(id);
        if (cell && isFrontier(cell.q, cell.r)) farmers += 1;
    }
    if (farmers === 0) return ctx;

    // Cases frontalières INTÉRIEURES : possédées par le joueur, libres, non
    // bloquées, hors base, et bordant au moins une case qui n'est PAS à lui
    // (l'arbre pousse donc du côté intérieur de la frontière, pas à l'extérieur).
    const eligible = board.cells.filter((c) => {
        if (c.blocked || board.baseIds.has(c.id) || placementsIn.has(c.id)) return false;
        if (state.ownership.get(c.id) !== pid) return false; // seulement sur son sol
        return isFrontier(c.q, c.r);
    });
    if (!eligible.length) return ctx;

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
    if (planted > 0) events.push({kind: 'bonusFarmer', playerId: pid, count: planted});
    return {...ctx, placements};
}

// Apparition de coffres en fin de tour, sur le même principe que les arbres mais
// bien plus rare : un seul coffre par tour au plus (`chestSpawnChance`), et
// jamais plus de `chestMax` sur le plateau à la fois.
export function spawnChests(ctx) {
    const {state, board, rng, placements: placementsIn} = ctx;
    const s = state.settings;
    if (s && s.chestsEnabled === false) return ctx;

    const max = Math.max(0, s?.chestMax ?? 5);
    let chests = 0;
    for (const p of placementsIn.values()) if (p.type === 'chest') chests += 1;
    if (chests >= max) return ctx;

    const chance = (s?.chestSpawnChance ?? 10) / 100;
    if (rng.next() >= chance) return ctx;

    // Cases éligibles : libres, non bloquées (eau), hors base.
    const eligible = board.cells.filter(
        (c) => !c.blocked && !board.baseIds.has(c.id) && !placementsIn.has(c.id)
    );
    if (!eligible.length) return ctx;

    const placements = new Map(placementsIn);
    placements.set(eligible[rng.int(eligible.length)].id, makeChest());
    return {...ctx, placements};
}
