// Journal (traces de mise au point demandées)

// Dernier mode connu par joueur, pour ne signaler QUE les changements en plus du
// mode joué à chaque tour.
const lastMode = new Map();

/* eslint-disable no-console */
export function logMode(state, playerId, mode) {
    const before = lastMode.get(playerId);
    lastMode.set(playerId, mode);
    if (before !== mode) {
        console.log(`[bot] ${playerId} — CHANGEMENT de mode : ${before ?? 'aucun'} -> ${mode}`);
    }
    console.log(`[bot] ${playerId} (tour ${state.turn}) joue en mode : ${mode}`);
}

// Étiquette d'un soldat pour le journal (« contact » / « visuel » / « renfort »).
export function logSoldier(cellId, unit, label) {
    console.log(`[bot]   soldat ${cellId} (lvl ${unit.level || 1}) : ${label}`);
}
/* eslint-enable no-console */
