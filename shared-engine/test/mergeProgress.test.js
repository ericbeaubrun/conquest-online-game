// RÈGLE : la fusion de deux soldats ne doit jamais faire perdre un avancement
// de défi. Avant ce test, `mergedSoldier` ne recopiait QUE `to.progress` (via
// `...to`) : un soldat ayant ouvert un coffre (`chestsOpened: 1`) perdait ce
// crédit s'il fusionnait DANS un soldat qui ne l'avait pas ouvert, alors que la
// fusion inverse le conservait — un résultat qui dépendait de l'ordre choisi
// par le joueur. Chaque métrique doit désormais retenir la valeur la PLUS
// AVANCÉE des deux soldats, quel que soit le sens de la fusion.

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {mergedSoldier} from '../engine/rules.js';
import {CHALLENGE_METRICS} from '../data/soldier.js';

const soldier = (progress) => ({
    type: 'soldier',
    level: 1,
    hp: 4,
    atk: 4,
    bonus: null,
    affinity: null,
    progress,
});

test('la fusion conserve le défi le plus avancé, peu importe le sens', () => {
    const withChest = soldier({[CHALLENGE_METRICS.CHESTS_OPENED]: 1});
    const withoutChest = soldier({});

    const intoWithoutChest = mergedSoldier(withChest, withoutChest);
    assert.equal(intoWithoutChest.progress[CHALLENGE_METRICS.CHESTS_OPENED], 1);

    const intoWithChest = mergedSoldier(withoutChest, withChest);
    assert.equal(intoWithChest.progress[CHALLENGE_METRICS.CHESTS_OPENED], 1);
});

test('la fusion prend le maximum de chaque métrique indépendamment', () => {
    const a = soldier({
        [CHALLENGE_METRICS.TREES_CHOPPED]: 3,
        [CHALLENGE_METRICS.CASES_CONQUERED]: 0,
    });
    const b = soldier({
        [CHALLENGE_METRICS.TREES_CHOPPED]: 1,
        [CHALLENGE_METRICS.CASES_CONQUERED]: 2,
    });

    const merged = mergedSoldier(a, b);
    assert.equal(merged.progress[CHALLENGE_METRICS.TREES_CHOPPED], 3);
    assert.equal(merged.progress[CHALLENGE_METRICS.CASES_CONQUERED], 2);
});
