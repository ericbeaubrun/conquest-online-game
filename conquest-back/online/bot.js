// IA de bot : la logique vit dans le moteur partagé (`engine/bot/`), pour
// être identique en local et en ligne. Ce module ne fait que la ré-exporter.
export { runBotTurn, isBotTurn } from '@conquest/shared-engine/engine/bot/index.js';
