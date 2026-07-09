// (Dé)sérialisation de l'état de jeu : SOURCE DE VÉRITÉ UNIQUE du format réseau.
// L'état interne utilise des `Map`/`Set` (`ownership`, `placements`,
// `movedSoldiers`) pour l'ergonomie et la performance — mais `JSON.stringify`
// ne sait pas les transporter (il les réduit à `{}`). Ces deux fonctions sont
// le seul endroit qui connaît la correspondance état interne ⇆ objet JSON.
//
// Le mode « online » (socket.io) enverra `serializeState(state)` sur le fil et
// reconstruira l'état avec `deserializeState`. Tous les autres champs (joueurs,
// réglages, or, compteurs...) sont déjà des valeurs JSON simples : on les
// recopie tels quels via l'étalement, ce qui rend la sérialisation robuste à
// l'ajout futur de champs scalaires sans toucher à ce fichier.
//
// Invariant : `deserializeState(JSON.parse(JSON.stringify(serializeState(s))))`
// reproduit un état fonctionnellement équivalent à `s`.

// État interne (Map/Set) -> objet 100 % JSON-sérialisable.
export function serializeState(state) {
    return {
        ...state,
        ownership: [...state.ownership],       // Map -> [[cellId, playerId], ...]
        placements: [...state.placements],     // Map -> [[cellId, unit], ...]
        movedSoldiers: [...state.movedSoldiers], // Set -> [uid, ...]
    };
}

// Objet JSON (issu du réseau) -> état interne prêt pour le reducer.
export function deserializeState(raw) {
    return {
        ...raw,
        ownership: new Map(raw.ownership),
        placements: new Map(raw.placements),
        movedSoldiers: new Set(raw.movedSoldiers),
    };
}
