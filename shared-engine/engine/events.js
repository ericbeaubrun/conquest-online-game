// Journal d'évènements de l'état : ajout PUR et DÉTERMINISTE.
//
// Extrait de `reducer.js` pour que les effets de fin de tour (voir `endturn/`)
// puissent produire des évènements sans dépendre du reducer lui-même.

// Nombre maximum d'évènements conservés dans le journal (`state.events`). Le
// front n'affiche que les nouveaux (via `seq`), mais le journal voyage dans
// l'état sérialisé/persisté : on le borne pour ne pas le laisser croître sans fin.
export const EVENT_CAP = 40;

// Ajoute un ou plusieurs évènements au journal de l'état, de façon PURE et
// DÉTERMINISTE (mêmes entrées -> mêmes `seq`). Chaque évènement reçoit une `seq`
// monotone croissante (`eventSeq`) ; le journal est tronqué aux `EVENT_CAP`
// derniers. Les évènements sont des objets de DONNÉES (kind + payload) : leur
// mise en forme en texte se fait côté front (voir `toastMessages.js`), afin que
// l'engine reste sans dépendance d'affichage. Ignorer les entrées `null`/`false`
// permet d'écrire `emit(state, cond && {...})`.
export function emit(state, ...events) {
    const list = events.filter(Boolean);
    if (!list.length) return state;
    let seq = state.eventSeq || 0;
    const stamped = list.map((e) => ({...e, seq: (seq += 1)}));
    const merged = [...(state.events || []), ...stamped];
    const events2 = merged.length > EVENT_CAP ? merged.slice(merged.length - EVENT_CAP) : merged;
    return {...state, events: events2, eventSeq: seq};
}

// Instantané minimal d'une unité pour un évènement (titre du soldat, camp,
// structure…). Le front reconstitue le libellé complet à partir de ces champs.
export function unitSnapshot(unit) {
    if (!unit) return null;
    return {
        type: unit.type,
        playerId: unit.playerId,
        atk: unit.atk,
        level: unit.level,
        bonus: unit.bonus ?? null,
        unit: unit.unit ?? null, // sous-type invoqué (skeleton / druidTree) le cas échéant
    };
}
