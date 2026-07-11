// Écran de navigation des parties en ligne. Structure :
//   1. Une barre d'actions : CRÉER une partie (à gauche) · REJOINDRE par code (à droite).
//   2. Les parties EN ATTENTE (repliable, ouvert par défaut).
//   3. Les parties EN COURS (repliable, fermé par défaut).
// Créer une partie n'exige PLUS de choisir une carte : on ouvre directement un
// lobby en attente (carte par défaut côté serveur) que l'on paramétrera ensuite
// dans la salle d'attente. Réutilise le langage visuel des écrans de menu.

import { useState } from "react";
import { MAPS } from "@conquest/shared-engine/data/maps.js";

const LobbyBrowser = ({ lobbies = [], error, onCreate, onJoin, onRefresh, onBack }) => {
    const [code, setCode] = useState("");
    const [showWaiting, setShowWaiting] = useState(true);
    const [showPlaying, setShowPlaying] = useState(false);

    const waiting = lobbies.filter((l) => l.status === "waiting");
    const playing = lobbies.filter((l) => l.status === "playing");

    const submitJoin = () => {
        if (code.trim()) onJoin(code);
    };

    return (
        <div className="setup-screen">
            <header className="setup-topbar">
                <button className="menu-btn menu-btn--ghost" onClick={onBack}>
                    ← Retour
                </button>
                <h1 className="setup-topbar__title">Jouer en ligne</h1>
                <button
                    className="menu-btn menu-btn--ghost"
                    style={{ width: "96px" }}
                    onClick={onRefresh}
                >
                    ⟳ Actualiser
                </button>
            </header>

            <div className="setup-body">
                {error && <div className="lobby-error">{libelleErreur(error)}</div>}

                {/* Barre d'actions : créer (gauche) · rejoindre par code (droite) */}
                <section className="lobby-actions">
                    <button className="menu-btn menu-btn--online" onClick={() => onCreate()}>
                        Créer une partie
                    </button>

                    <div className="lobby-join">
                        <input
                            className="lobby-join__code"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === "Enter" && submitJoin()}
                            placeholder="CODE"
                            maxLength={6}
                            aria-label="Code de la partie"
                        />
                        <button
                            className="menu-btn"
                            disabled={!code.trim()}
                            onClick={submitJoin}
                        >
                            Rejoindre
                        </button>
                    </div>
                </section>

                {/* Parties en attente (ouvert par défaut) */}
                <LobbySection
                    title="Parties en attente"
                    open={showWaiting}
                    onToggle={() => setShowWaiting((v) => !v)}
                    count={waiting.length}
                    lobbies={waiting}
                    emptyLabel="Aucune partie en attente. Crée la première !"
                    onJoin={onJoin}
                />

                {/* Parties en cours (fermé par défaut) */}
                <LobbySection
                    title="Parties en cours"
                    open={showPlaying}
                    onToggle={() => setShowPlaying((v) => !v)}
                    count={playing.length}
                    lobbies={playing}
                    emptyLabel="Aucune partie en cours."
                    onJoin={onJoin}
                    joinLabel="Observer"
                />
            </div>
        </div>
    );
};

// Section repliable listant des lobbies.
const LobbySection = ({ title, open, onToggle, count, lobbies, emptyLabel, onJoin, joinLabel = "Rejoindre" }) => (
    <section className="setup-section">
        <button className="lobby-toggle" onClick={onToggle} aria-expanded={open}>
            <span className="lobby-toggle__chevron">{open ? "▾" : "▸"}</span>
            <span className="lobby-toggle__title">{title}</span>
            <span className="lobby-toggle__count">{count}</span>
        </button>

        {open && (
            <div className="lobby-list">
                {lobbies.length === 0 ? (
                    <p className="lobby-empty">{emptyLabel}</p>
                ) : (
                    lobbies.map((l) => (
                        <div key={l.code} className="lobby-row">
                            <span className="lobby-row__info">
                                <strong className="lobby-row__code">{l.code}</strong>
                                <span className="lobby-row__map">{mapName(l.mapId)}</span>
                                <span className="lobby-row__seats">
                                    {l.seatsTaken}/{l.seatsTotal} joueurs
                                </span>
                            </span>
                            <button className="menu-btn menu-btn--ghost" onClick={() => onJoin(l.code)}>
                                {joinLabel}
                            </button>
                        </div>
                    ))
                )}
            </div>
        )}
    </section>
);

const mapName = (id) => MAPS.find((m) => m.id === id)?.name || id;
const libelleErreur = (reason) => {
    const table = {
        "not-found": "Partie introuvable (mauvais code ?).",
        "create-failed": "Échec de la création de la partie.",
        "join-failed": "Échec pour rejoindre la partie.",
        "list-failed": "Échec du chargement de la liste.",
    };
    return table[reason] || `Erreur : ${reason}`;
};

export default LobbyBrowser;
