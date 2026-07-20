// Enveloppe du mode HORS-LIGNE : crée la session locale (reducer en mémoire) et
// la passe à GameLayout. Pendant du flux online (OnlineFlow), qui fournit lui une
// session pilotée par le serveur. GameLayout, lui, ignore le transport.

import GameLayout from "./GameLayout.jsx";
import { useGameSession } from "./game/session/useGameSession.js";

const OfflineGame = ({ config = null, savedState = null, onExit }) => {
    // `savedState` (rechargement d'une sauvegarde) prime sur `config` (nouvelle
    // partie) : la session reprend l'état figé plutôt que d'en créer un neuf.
    const session = useGameSession({
        mode: "local",
        mapId: config?.mapId,
        setup: config,
        savedState,
    });
    return <GameLayout session={session} onExit={onExit} />;
};

export default OfflineGame;
