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
        destroyedBases: [...(state.destroyedBases || [])], // Set -> [cellId, ...]
    };
}

// --- Format de DIFFUSION (online) : l'état privé de ce que le client a déjà ---
//
// Le serveur rediffuse l'état à CHAQUE action ; renvoyer l'état entier à chaque
// fois est du gaspillage pur, car deux parties du payload ne changent
// pratiquement jamais :
//   - `mapId`, `players`, `settings` sont FIXÉS au démarrage et ne bougent plus
//     de toute la partie ;
//   - `statsHistory` ne grandit qu'une fois par RONDE complète (voir le reducer),
//     alors qu'il est renvoyé à chaque déplacement de soldat.
// Ces deux blocs pèsent un tiers du payload. On les envoie donc une fois (à la
// jointure et au démarrage, en format COMPLET), puis on les omet des diffusions.
//
// La persistance (`lobbyStore`) et les sauvegardes locales continuent d'employer
// `serializeState` : seul le fil de diffusion est allégé.
const CONSTANT_KEYS = ['mapId', 'players', 'settings'];

// État sérialisé allégé pour diffusion. `prevStatsLen` = longueur de
// `statsHistory` lors de la DERNIÈRE diffusion à cette salle ; l'historique
// n'est renvoyé que s'il a effectivement grandi depuis.
export function serializeStateWire(state, prevStatsLen) {
    const wire = serializeState(state);
    for (const key of CONSTANT_KEYS) delete wire[key];
    if (wire.statsHistory?.length === prevStatsLen) delete wire.statsHistory;
    return wire;
}

// Un payload est-il COMPLET (jointure/démarrage) plutôt qu'allégé ? Sert au
// client à savoir s'il peut fonder sa base de reconstruction dessus.
export const isFullWire = (raw) => !!raw && CONSTANT_KEYS.every((k) => raw[k] !== undefined);

// Reconstitue un état sérialisé COMPLET à partir d'une diffusion allégée et du
// dernier état complet connu du client. Renvoie `null` si la base manque et que
// le payload est lui-même incomplet : mieux vaut ignorer une diffusion que
// d'afficher un plateau amputé de sa carte ou de ses joueurs.
export function mergeStateWire(raw, base) {
    if (isFullWire(raw)) return raw;
    if (!base) return null;
    // On part de la BASE (un état complet) et on écrase avec ce que la diffusion
    // apporte : les champs omis gardent donc naturellement leur valeur
    // précédente, et l'objet conserve l'ORDRE DES CLÉS du format complet. Ce
    // dernier point n'a aucune incidence sur le moteur (qui lit par nom), mais
    // rend le résultat littéralement indiscernable d'un état non allégé —
    // y compris pour une comparaison texte.
    return {...base, ...raw};
}

// Objet JSON (issu du réseau) -> état interne prêt pour le reducer.
export function deserializeState(raw) {
    return {
        ...raw,
        ownership: new Map(raw.ownership),
        placements: new Map(raw.placements),
        movedSoldiers: new Set(raw.movedSoldiers),
        destroyedBases: new Set(raw.destroyedBases || []),
        // Parties persistées avant l'ajout des statistiques : historique vide.
        statsHistory: raw.statsHistory || [],
        // Parties persistées avant le suivi du Chevalier noir : aucun achat connu.
        blackKnightBoughtBy: raw.blackKnightBoughtBy || {},
    };
}
