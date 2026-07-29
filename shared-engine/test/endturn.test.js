// FILET DE SÉCURITÉ DES EFFETS DE FIN DE TOUR.
//
// `reduceEndTurn` enchaîne une dizaine d'effets automatiques (apparitions,
// bonus « Alchimiste », « Prêtre », « Vampire », « Magicien », « Démoniste »,
// « Sorcier », « Conquérant », « Roi », « Paladin »…). Ils partagent le même
// générateur aléatoire : leur ORDRE d'exécution fait partie du comportement
// observable, et le golden de `determinism.test.js` ne les atteint pas (il
// faudrait débloquer les défis correspondants).
//
// Chaque effet est donc isolé ici sur un état FABRIQUÉ à la main : un porteur
// de bonus, une cible, et rien d'autre. Une régression pointe ainsi directement
// l'effet fautif, au lieu d'une empreinte globale illisible.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gameReducer } from '../engine/reducer.js';
import { createInitialState } from '../engine/board.js';
import { endTurn } from '../engine/actions.js';
import {
    ALCHEMIST_ATK_BUFF,
    ALCHEMIST_HP_COST,
    PRIEST_HP_GIFT,
    PRIEST_HP_COST,
    VAMPIRE_DRAIN,
    MAGICIAN_GOLD_REWARD,
    KING_INCOME_MULT,
    MONK_IDLE_REWARD,
    BONUS_OFFERS,
} from '../data/soldier.js';
import { HOUSE_INCOME } from '../engine/rules.js';

// Cases contiguës de la carte « duel » : '-4,0' est la base de p1, les trois
// autres lui sont adjacentes et lui appartiennent au départ.
const BASE = '-4,0';
const A = '-3,0';
const B = '-3,-1';
const C = '-4,1';

const soldier = (over = {}) => ({
    type: 'soldier',
    playerId: 'p1',
    uid: 1,
    level: 1,
    hp: 5,
    atk: 3,
    affinity: null,
    bonus: null,
    behavior: null,
    progress: {},
    ...over,
});

// Réglages neutralisant l'ENTRETIEN de tous les bonus. Les tests ci-dessous
// mesurent l'EFFET d'un bonus par comparaison appariée (même plateau, seul le
// bonus diffère) : son entretien fausserait la mesure, puisqu'il ne pèse que sur
// la branche qui porte le bonus. Pire, un entretien supérieur au revenu ferait
// tomber les DEUX branches à zéro (le revenu est borné à 0) et la comparaison ne
// mesurerait plus rien. Les neutraliser rend ces tests indépendants de
// l'équilibrage : changer un prix ne doit pas casser un test d'effet.
const SANS_ENTRETIEN = {
    settings: {
        bonusUpkeep: Object.fromEntries(BONUS_OFFERS.map((b) => [b.id, 0])),
    },
};

// Construit un état « de laboratoire » et joue UN END_TURN pour p1.
// Les apparitions aléatoires (arbres, coffres) sont coupées pour que seul
// l'effet testé bouge — sinon le bruit rendrait les assertions instables.
function endTurnWith(units, { settings = {}, gold = 0, ownership = null } = {}) {
    const players = [
        { id: 'p1', name: 'Un', color: '#e11', kind: 'human', spawnIndex: 0 },
        { id: 'p2', name: 'Deux', color: '#11e', kind: 'human', spawnIndex: 1 },
    ];
    const base = createInitialState(
        'duel',
        { players, settings: { treesEnabled: false, chestsEnabled: false, ...settings } },
        4242
    );
    const state = {
        ...base,
        placements: new Map(Object.entries(units)),
        gold: { p1: gold, p2: 0 },
        uidSeq: 100,
        activePlayerId: 'p1',
        ...(ownership ? { ownership: new Map(ownership) } : {}),
    };
    return gameReducer(state, endTurn());
}

const at = (state, cell) => state.placements.get(cell);
const kinds = (state) => (state.events || []).map((e) => e.kind);

// --- Alchimiste : -1 PV par allié adjacent, +1 ATK à chacun -----------------
test('Alchimiste : arme TOUS les alliés adjacents, un PV par allié', () => {
    const s = endTurnWith({
        [A]: soldier({ uid: 1, bonus: 'alchemist', hp: 5, atk: 3 }),
        [B]: soldier({ uid: 2, atk: 1 }),
        [C]: soldier({ uid: 3, atk: 4 }),
    });
    assert.equal(at(s, A).hp, 5 - 2 * ALCHEMIST_HP_COST, 'l’alchimiste paie un PV par allié armé');
    assert.equal(at(s, B).atk, 1 + ALCHEMIST_ATK_BUFF);
    assert.equal(at(s, C).atk, 4 + ALCHEMIST_ATK_BUFF, 'aucun allié adjacent n’est laissé de côté');
    assert.ok(kinds(s).includes('bonusAlchemist'));
});

test('Alchimiste : s’arrête avant le don qui le tuerait', () => {
    // 2 PV : il n'a de quoi armer qu'UN seul de ses deux voisins (il doit finir
    // son tour à 1 PV au moins). Le premier voisin rencontré l'emporte.
    const s = endTurnWith({
        [A]: soldier({ uid: 1, bonus: 'alchemist', hp: 2, atk: 3 }),
        [B]: soldier({ uid: 2, atk: 1 }),
        [C]: soldier({ uid: 3, atk: 4 }),
    });
    assert.equal(at(s, A).hp, 1, 'l’alchimiste ne descend jamais sous 1 PV');
    const armed = [at(s, B).atk - 1, at(s, C).atk - 4].filter((d) => d > 0);
    assert.equal(armed.length, 1, 'un seul allié armé');
});

test('Alchimiste : ne se sacrifie pas jusqu’à la mort', () => {
    const s = endTurnWith({
        [A]: soldier({ uid: 1, bonus: 'alchemist', hp: ALCHEMIST_HP_COST }),
        [B]: soldier({ uid: 2, atk: 1 }),
    });
    assert.equal(at(s, A).hp, ALCHEMIST_HP_COST, 'PV insuffisants : aucun échange');
    assert.equal(at(s, B).atk, 1);
});

// --- Prêtre : -1 PV par allié adjacent, +1 PV à chacun ----------------------
test('Prêtre : soigne TOUS les alliés adjacents, un PV par allié', () => {
    const s = endTurnWith({
        [A]: soldier({ uid: 1, bonus: 'priest', hp: 5 }),
        [B]: soldier({ uid: 2, hp: 1 }),
        [C]: soldier({ uid: 3, hp: 4 }),
    });
    assert.equal(at(s, A).hp, 5 - 2 * PRIEST_HP_COST, 'le prêtre paie un PV par allié soigné');
    assert.equal(at(s, B).hp, 1 + PRIEST_HP_GIFT);
    assert.equal(at(s, C).hp, 4 + PRIEST_HP_GIFT, 'aucun allié adjacent n’est laissé de côté');
    assert.ok(kinds(s).includes('bonusPriest'));
});

// --- Vampire : draine 1 PV à un allié adjacent ------------------------------
test('Vampire : draine un allié adjacent à son profit', () => {
    const s = endTurnWith({
        [A]: soldier({ uid: 1, bonus: 'vampire', hp: 3 }),
        [B]: soldier({ uid: 2, hp: 4 }),
    });
    assert.equal(at(s, A).hp, 3 + VAMPIRE_DRAIN, 'le vampire doit gagner les PV drainés');
    assert.equal(at(s, B).hp, 4 - VAMPIRE_DRAIN, 'l’allié doit les perdre');
    assert.ok(kinds(s).includes('bonusVampire'));
});

// --- Magicien : transmet SON affinité et rapporte de l'or -------------------
test('Magicien : transmet son affinité à un allié neutre et rapporte de l’or', () => {
    const s = endTurnWith(
        {
            [A]: soldier({ uid: 1, bonus: 'magician', affinity: 'fire' }),
            [B]: soldier({ uid: 2, affinity: null }),
        },
        SANS_ENTRETIEN
    );
    assert.equal(at(s, B).affinity, 'fire');
    assert.ok(kinds(s).includes('bonusMagician'));

    // Contrôle APPARIÉ : même plateau, même entretien, seul le bonus diffère.
    // Comparer à une valeur absolue ne prouverait rien — le revenu de base la
    // dépasse déjà, et masquerait une récompense devenue nulle.
    const temoin = endTurnWith(
        {
            [A]: soldier({ uid: 1, affinity: 'fire' }),
            [B]: soldier({ uid: 2, affinity: null }),
        },
        SANS_ENTRETIEN
    );
    assert.equal(
        s.gold.p1 - temoin.gold.p1,
        MAGICIAN_GOLD_REWARD,
        'le don doit rapporter exactement MAGICIAN_GOLD_REWARD'
    );
});

test('Magicien sans affinité : rien à transmettre', () => {
    const s = endTurnWith({
        [A]: soldier({ uid: 1, bonus: 'magician', affinity: null }),
        [B]: soldier({ uid: 2, affinity: null }),
    });
    assert.equal(at(s, B).affinity, null);
    assert.ok(!kinds(s).includes('bonusMagician'));
});

// --- Roi : maisons ET territoire rapportent double --------------------------
// Le surplus se mesure par comparaison appariée : même plateau, seul le bonus
// diffère. Le nombre de cases possédées est celui du territoire de départ, lu
// sur l'état plutôt que recopié — il dépend de la carte.
const casesDe = (state, pid) => [...state.ownership.values()].filter((o) => o === pid).length;

test('Roi : double le rendement des maisons ET du territoire', () => {
    const maison = { type: 'house', playerId: 'p1', hp: 2 };
    const sans = endTurnWith({ [A]: soldier({ uid: 1 }), [B]: maison }, SANS_ENTRETIEN);
    const avec = endTurnWith(
        { [A]: soldier({ uid: 1, bonus: 'king' }), [B]: maison },
        SANS_ENTRETIEN
    );
    const cases = casesDe(sans, 'p1');
    assert.equal(
        avec.gold.p1 - sans.gold.p1,
        (HOUSE_INCOME + cases) * (KING_INCOME_MULT - 1),
        'maison et cases doivent rapporter leur rendement une seconde fois'
    );
    assert.ok(kinds(avec).includes('bonusKing'));
    assert.equal(KING_INCOME_MULT, 2, 'constante de référence inchangée');
});

test('Roi : sans maison, le territoire seul est doublé', () => {
    const sans = endTurnWith({ [A]: soldier({ uid: 1 }) }, SANS_ENTRETIEN);
    const avec = endTurnWith({ [A]: soldier({ uid: 1, bonus: 'king' }) }, SANS_ENTRETIEN);
    assert.equal(
        avec.gold.p1 - sans.gold.p1,
        casesDe(sans, 'p1') * (KING_INCOME_MULT - 1)
    );
    assert.ok(kinds(avec).includes('bonusKing'));
});

// --- Moine : prime d'inaction -----------------------------------------------
test('Moine : rapporte de l’or au tour qu’il termine sans agir', () => {
    const sans = endTurnWith({ [A]: soldier({ uid: 1 }) }, SANS_ENTRETIEN);
    const avec = endTurnWith({ [A]: soldier({ uid: 1, bonus: 'monk' }) }, SANS_ENTRETIEN);
    assert.equal(avec.gold.p1 - sans.gold.p1, MONK_IDLE_REWARD);
    assert.ok(kinds(avec).includes('bonusMonk'));
});

// --- Conquérant : annexe les cases vides adjacentes -------------------------
test('Conquérant : annexe les cases vides voisines', () => {
    const s = endTurnWith({ [A]: soldier({ uid: 1, bonus: 'conqueror' }) });
    const mienne = [...s.ownership].filter(([, o]) => o === 'p1').length;
    const avant = [...createInitialState('duel', null, 4242).ownership].filter(
        ([, o]) => o === 'p1'
    ).length;
    assert.ok(mienne > avant, `le conquérant doit étendre le territoire (${avant} -> ${mienne})`);
});

// --- Démoniste : invoque des squelettes -------------------------------------
test('Démoniste : peut invoquer un squelette (déterministe à graine fixe)', () => {
    const s = endTurnWith({ [A]: soldier({ uid: 1, bonus: 'warlock' }) });
    const s2 = endTurnWith({ [A]: soldier({ uid: 1, bonus: 'warlock' }) });
    // L'invocation est probabiliste : on ne fige pas SON résultat, mais on exige
    // qu'à graine égale il soit strictement reproductible.
    assert.equal(s.placements.size, s2.placements.size);
    assert.equal(s.uidSeq, s2.uidSeq);
    assert.deepEqual(kinds(s), kinds(s2));
});

// --- Passage de main & compteurs --------------------------------------------
test('END_TURN : passe la main et réinitialise les déplacements', () => {
    const s = endTurnWith({ [A]: soldier({ uid: 1 }) });
    assert.equal(s.activePlayerId, 'p2');
    assert.equal(s.movedSoldiers.size, 0);
});

// --- ORDRE DES EFFETS --------------------------------------------------------
// Les effets s'appliquent EN CHAÎNE sur la même carte d'unités : quand deux
// d'entre eux touchent la même cible, leur ordre change le résultat. Ce test
// fige l'ordre actuel — c'est le garde-fou d'une refactorisation en pipeline,
// où réordonner la liste est une faute d'inattention à un caractère près.
//
// Mise en scène : le prêtre (B) et le vampire (C) sont tous deux adjacents à
// l'allié blessé (A). Le prêtre soigne A, puis le vampire le draine. Inverser
// les deux effets donnerait un état différent — le vampire ne mord jamais un
// allié à 1 PV, donc sans le soin préalable il n'aurait rien pris.
test('l’ordre prêtre → vampire est figé (effets chaînés sur la même cible)', () => {
    const s = endTurnWith({
        [B]: soldier({ uid: 1, bonus: 'priest', hp: 5 }),
        [C]: soldier({ uid: 2, bonus: 'vampire', hp: 3 }),
        [A]: soldier({ uid: 3, hp: 1 }), // le plus blessé : cible des deux
    });
    assert.equal(at(s, B).hp, 5 - PRIEST_HP_COST, 'le prêtre paie son don');
    assert.equal(at(s, C).hp, 3 + VAMPIRE_DRAIN, 'le vampire encaisse sa ponction');
    assert.equal(
        at(s, A).hp,
        1 + PRIEST_HP_GIFT - VAMPIRE_DRAIN,
        'soigné PUIS drainé, dans cet ordre'
    );
    assert.deepEqual(
        kinds(s),
        ['bonusPriest', 'bonusVampire'],
        'les évènements doivent suivre l’ordre d’application des effets'
    );
});

// --- Reproductibilité globale des effets ------------------------------------
test('la fin de tour est strictement reproductible à graine égale', () => {
    const units = () => ({
        [BASE]: soldier({ uid: 9, bonus: 'king' }),
        [A]: soldier({ uid: 1, bonus: 'warlock', affinity: 'ice' }),
        [B]: soldier({ uid: 2, bonus: 'magician', affinity: 'fire' }),
        [C]: soldier({ uid: 3, bonus: 'priest', hp: 4 }),
    });
    const a = endTurnWith(units(), { settings: { treesEnabled: true, chestsEnabled: true } });
    const b = endTurnWith(units(), { settings: { treesEnabled: true, chestsEnabled: true } });
    assert.equal(JSON.stringify([...a.placements]), JSON.stringify([...b.placements]));
    assert.equal(a.rngSeed, b.rngSeed);
    assert.deepEqual(a.gold, b.gold);
});
