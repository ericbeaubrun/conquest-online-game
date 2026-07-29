// ENREGISTREUR DE PARTIES — OUTIL DE DÉVELOPPEMENT UNIQUEMENT.
//
// Il capte les parties jouées en local (hotseat) pour qu'on puisse les rejouer
// et disséquer un bug ou un déséquilibre hors ligne (`engine/record.js` porte
// le format et la relecture).
//
// TOUT CE MODULE EST INERTE EN PRODUCTION. `import.meta.env.DEV` est une
// constante remplacée à la compilation par Vite : en build de production, les
// tests ci-dessous sont figés à `false` et le ramasse-miettes de Rollup élimine
// le code mort. Aucun octet, aucun risque de fuite de partie chez un joueur.
//
// Le format du journal et sa relecture vivent dans le moteur partagé
// (`engine/record.js`) : producteur et analyseur ne peuvent pas diverger.

import { createRecorder } from '@conquest/shared-engine/engine/record.js';

const DEV = import.meta.env.DEV;

let current = null;

// Démarre (ou redémarre) un enregistrement. Appelé à la création de la partie et
// à chaque nouvelle partie, sinon le journal mêlerait deux parties.
export function startRecording(state, meta) {
    if (!DEV) return;
    current = createRecorder(state, meta);
    if (typeof window !== 'undefined') window.__conquestRec = api;
}

// Note une action TENTÉE. On n'attend pas de savoir si le moteur l'a acceptée :
// la relecture traverse sans bruit les coups refusés (voir `engine/record.js`).
export function recordAction(action) {
    if (!DEV || !current) return;
    current.record(action);
}

// « Recommencer mon tour » : les coups de ce tour n'ont plus eu lieu.
export function recordResetTurn() {
    if (!DEV || !current) return;
    current.resetTurn();
}

// Dépose le journal en téléchargement. Nommé avec la date pour qu'un lot de
// parties reste lisible sans être renommé à la main.
function download(name) {
    if (!DEV || !current) {
        console.warn('[rec] aucun enregistrement en cours');
        return;
    }
    const log = current.toJSON();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const blob = new Blob([JSON.stringify(log)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || `conquest-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.info(`[rec] ${log.actions.length} actions enregistrées -> ${a.download}`);
}

const api = {
    download,
    get length() {
        return current?.length ?? 0;
    },
    get log() {
        return current?.toJSON() ?? null;
    },
};

// Console du navigateur : `__conquestRec.download()` à la fin d'une partie.
// Exposé dès le chargement du module pour qu'il soit là avant la première partie.
if (DEV && typeof window !== 'undefined') window.__conquestRec = api;

export default api;
