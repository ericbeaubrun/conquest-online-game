// Fabriques d'unités : tout ce qui CRÉE un soldat ou une créature part d'ici.
//
// Extrait de `reducer.js` pour être partagé entre les handlers d'action et les
// effets de fin de tour (`endturn/`), qui invoquent squelettes et dragons.

import {SOLDIER_HP_DEFAULT, SOLDIER_ATK_DEFAULT} from './rules.js';
import {unitKindById} from '../data/units.js';

// Fabrique un soldat neuf avec ses caractéristiques par défaut. Centralisé ici
// pour que toute création de soldat parte du même modèle (stats + specs).
export function makeSoldier(playerId, uid, settings) {
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
export function makeUnit(kindId, playerId, uid, affinity = null) {
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
export function makeCursed(victim, kind) {
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
export function withProgress(soldier, metric, amount = 1) {
    const progress = {...soldier.progress, [metric]: (soldier.progress?.[metric] || 0) + amount};
    return {...soldier, progress};
}
