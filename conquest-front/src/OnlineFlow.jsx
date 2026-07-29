// Flux du mode EN LIGNE. Possède la session online (UNE connexion socket, du
// lobby jusqu'au jeu) et choisit l'écran à afficher selon la phase :
//   connexion → navigation des parties → salle d'attente → partie.
// Quitter (onExit) démonte ce composant : la socket se ferme et le siège est
// libéré côté serveur.

import GameLayout from "./GameLayout.jsx";
import LobbyBrowser from "./menu/LobbyBrowser.jsx";
import LobbyWaiting from "./menu/LobbyWaiting.jsx";
import SeatPickerModal from "./menu/SeatPickerModal.jsx";
import { useOnlineSession } from "./game/session/useOnlineSession.js";

// Petit écran plein centré (connexion / erreur).
const Centered = ({ text, onCancel, cancelLabel = "Annuler" }) => (
    <div className="home-screen" style={{ display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "1.2rem", opacity: 0.85 }}>{text}</p>
            <button className="menu-btn menu-btn--ghost" onClick={onCancel}>
                {cancelLabel}
            </button>
        </div>
    </div>
);

const OnlineFlow = ({ onExit }) => {
    const s = useOnlineSession();

    if (s.phase === "connecting") return <Centered text="Connexion au serveur…" onCancel={onExit} />;
    if (s.phase === "error")
        return <Centered text={s.error || "Erreur de connexion."} onCancel={onExit} cancelLabel="Retour" />;

    // Partie démarrée (état de jeu reçu) : on affiche le jeu. Si on vient de
    // rejoindre une partie en cours, un modal de choix de couleur se superpose
    // tant qu'aucune place n'a été prise.
    if (s.gameState)
        return (
            <>
                <GameLayout session={s.session} onExit={onExit} />
                {s.seatOptions && (
                    <SeatPickerModal
                        options={s.seatOptions}
                        onChoose={s.chooseSeat}
                        onSpectate={s.spectate}
                    />
                )}
            </>
        );

    // Salle rejointe mais pas encore démarrée : salle d'attente.
    if (s.lobby)
        return (
            <LobbyWaiting
                lobby={s.lobby}
                memberId={s.memberId}
                onConfigure={s.configureLobby}
                onReorder={s.reorderSeat}
                onSeatKind={s.setSeatKind}
                onSetBotDifficulty={s.setBotDifficulty}
                onSetIdentity={s.setIdentity}
                onStart={s.startLobby}
                onQuit={onExit}
            />
        );

    // Sinon : navigation / création de parties.
    return (
        <LobbyBrowser
            lobbies={s.lobbies}
            error={s.error}
            onCreate={s.createLobby}
            onJoin={s.joinLobby}
            onRefresh={s.refreshList}
            onBack={onExit}
        />
    );
};

export default OnlineFlow;
