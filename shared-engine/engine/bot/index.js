// IA de bot, PARTAGÉE front/back — TABLE RASE.
//
// Toute l'ancienne logique de décision a été retirée pour repartir de zéro :
// il ne reste que le POINT D'ANCRAGE, c'est-à-dire le contrat que les deux
// appelants attendent. Un bot ne fait donc pour l'instant rien du tout et
// passe son tour, sans casser la partie ni la synchronisation en ligne.
//
// --- CONTRAT À RESPECTER PAR LA FUTURE IA ---
//
// `runBotTurn(state, apply)` joue le tour du joueur ACTIF (toujours un bot
// quand elle est appelée) et renvoie le dernier état connu.
//
//   - `apply(action)` applique une action et renvoie le NOUVEL état, ou une
//     valeur fausse si l'action a été refusée / n'a rien changé. C'est la SEULE
//     façon de faire avancer la partie : jamais de mutation directe de `state`.
//   - Il faut donc travailler sur l'état RENVOYÉ par `apply`, pas sur celui
//     reçu en argument, sous peine de décider à partir d'un plateau périmé.
//   - Ne JAMAIS jouer `endTurn` : l'appelant s'en charge lui-même juste après
//     (`online/gameSocket.js` en ligne, `useGameSession` en hors-ligne).
//   - Rester DÉTERMINISTE : mêmes état et mêmes actions ⇒ mêmes décisions. Le
//     hasard doit passer par le PRNG du moteur (`engine/rng.js`), sans quoi le
//     client et le serveur divergent silencieusement en ligne.
//   - Rester PUR côté moteur : aucun import React ni Node, ce module est
//     chargé par le front comme par le back.
//
// La difficulté du siège (`player.difficulty`) est disponible dans l'état :
// c'est à la future IA de décider ce qu'elle en fait.
//
// `npm run botstats` (voir `balance/botReport.js`) mesure ce que le bot FAIT
// réellement : le lancer avant/après un changement reste la façon de juger une
// nouvelle routine. Sur ce socle vide, il ne rapporte évidemment que des zéros.

// Le joueur actif est-il un bot ?
export function isBotTurn(state) {
    const active = state.players?.find((p) => p.id === state.activePlayerId);
    return active?.kind === 'bot';
}

// Déroule le tour du bot actif. Sans logique, on rend la main immédiatement :
// l'appelant enchaînera sur `endTurn`, le bot aura simplement passé son tour.
// eslint-disable-next-line no-unused-vars
export function runBotTurn(state, apply) {
    return state;
}
