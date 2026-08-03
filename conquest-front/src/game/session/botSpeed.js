// Vitesse d'exécution du bot en HORS-LIGNE : délai (ms) inséré entre deux coups
// du bot pour qu'on puisse les suivre à l'œil.
//
// Ce réglage vit dans un petit magasin de module plutôt que dans l'état React :
// il est LU par la session (`useGameSession`, montée par App) et ÉCRIT par le
// menu burger (`SideMenu`, monté par GameLayout) — deux branches de l'arbre sans
// ancêtre commun autre que la racine. Le passer en prop obligerait à le remonter
// jusqu'à App pour le redescendre des deux côtés.
//
// Sans objet en ligne : là-bas le bot joue côté serveur, son rythme n'est pas du
// ressort d'un client.

const STORAGE_KEY = 'conquest.botDelay';

// Paliers de la jauge, en millisecondes par coup. 0 = comportement historique
// (tout le tour du bot appliqué d'un bloc, sans attente). Un demi-tempo suffit
// à suivre un coup ; au-delà l'attente devient pénible sur un tour de bot qui
// compte facilement une dizaine de coups.
//
// Le DÉFAUT est le premier palier non nul : de quoi voir que le bot a joué,
// sans faire patienter — mais on peut toujours retomber sur l'instantané.
export const BOT_DELAY_STEPS = [0, 100, 200, 300, 400, 500];
export const DEFAULT_BOT_DELAY = 100;

export const botDelayLabel = (ms) => (ms <= 0 ? 'Instantané' : `${(ms / 1000).toFixed(1)} s / coup`);

// Borné aux paliers de la jauge : une valeur mémorisée par une version
// antérieure (qui montait bien plus haut) figerait sinon le jeu à un rythme que
// le curseur ne sait plus afficher.
const MAX_BOT_DELAY = BOT_DELAY_STEPS[BOT_DELAY_STEPS.length - 1];
const clamp = (ms) => Math.min(Math.max(ms, 0), MAX_BOT_DELAY);

const readStored = () => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw == null) return DEFAULT_BOT_DELAY;
        const ms = Number(raw);
        return Number.isFinite(ms) ? clamp(ms) : DEFAULT_BOT_DELAY;
    } catch {
        return DEFAULT_BOT_DELAY; // localStorage indisponible (mode privé strict)
    }
};

let current = readStored();
const listeners = new Set();

export const getBotDelay = () => current;

export const setBotDelay = (ms) => {
    const value = Number.isFinite(ms) ? clamp(ms) : 0;
    if (value === current) return;
    current = value;
    try {
        window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
        // Réglage non persisté : la partie en cours l'utilise quand même.
    }
    listeners.forEach((fn) => fn());
};

export const subscribeBotDelay = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
