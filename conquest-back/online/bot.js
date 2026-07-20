// IA de bot : la logique vit dans le moteur partagé (`engine/bot.js`), pour
// être rejouée à l'identique par le serveur (online) et par le client (local).
// Ce module ne fait que la ré-exporter côté serveur.
export { runBotTurn, isBotTurn } from '@conquest/shared-engine/engine/bot.js';
