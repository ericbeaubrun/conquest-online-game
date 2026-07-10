// Écran de navigation des parties en ligne : choisir une carte et CRÉER une
// partie, REJOINDRE par code, ou piocher dans la liste des parties ouvertes.
// Réutilise le style de la page de configuration hors-ligne pour la cohérence.

import { useState } from "react";
import { MAPS, DEFAULT_MAP_ID } from "@shared/data/maps.js";

const LobbyBrowser = ({ lobbies = [], error, onCreate, onJoin, onRefresh, onBack }) => {
    const [mapId, setMapId] = useState(DEFAULT_MAP_ID);
    const [code, setCode] = useState("");

    return (
        <div className="setup-screen">
            <header className="setup-topbar">
                <button className="menu-btn menu-btn--ghost" onClick={onBack}>
                    ← Retour
                </button>
                <h1 className="setup-topbar__title">Jouer en ligne</h1>
                <span className="setup-topbar__spacer" />
            </header>

            <div className="setup-body">
                {error && (
                    <div
                        style={{
                            padding: ".6rem .8rem",
                            borderRadius: "8px",
                            background: "#d6454522",
                            border: "1px solid #d64545",
                        }}
                    >
                        {libelleErreur(error)}
                    </div>
                )}

                {/* Créer une partie */}
                <section className="setup-section">
                    <h2 className="setup-section__title">Créer une partie</h2>
                    <div className="map-grid">
                        {MAPS.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                className={`map-card ${m.id === mapId ? "map-card--active" : ""}`}
                                onClick={() => setMapId(m.id)}
                            >
                                <span className="map-card__name">{m.name}</span>
                                <span className="map-card__desc">{m.description}</span>
                                <span className="map-card__cap">{m.spawns.length} joueurs max</span>
                            </button>
                        ))}
                    </div>
                    <div style={{ marginTop: "1rem" }}>
                        <button className="menu-btn menu-btn--play" onClick={() => onCreate(mapId)}>
                            Créer la partie
                        </button>
                    </div>
                </section>

                {/* Rejoindre par code */}
                <section className="setup-section">
                    <h2 className="setup-section__title">Rejoindre par code</h2>
                    <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            placeholder="CODE"
                            maxLength={6}
                            style={{
                                textTransform: "uppercase",
                                letterSpacing: ".15em",
                                padding: ".5rem .8rem",
                                borderRadius: "8px",
                                border: "1px solid #8886",
                                background: "#8882",
                                font: "inherit",
                                width: "8rem",
                            }}
                        />
                        <button
                            className="menu-btn menu-btn--ghost"
                            disabled={!code.trim()}
                            onClick={() => onJoin(code)}
                        >
                            Rejoindre
                        </button>
                    </div>
                </section>

                {/* Parties ouvertes */}
                <section className="setup-section">
                    <h2 className="setup-section__title">
                        Parties ouvertes
                        <button
                            className="menu-btn menu-btn--ghost"
                            style={{ marginLeft: "auto", padding: ".3rem .7rem" }}
                            onClick={onRefresh}
                        >
                            ⟳ Rafraîchir
                        </button>
                    </h2>
                    {lobbies.length === 0 ? (
                        <p style={{ opacity: 0.7 }}>Aucune partie ouverte. Crée la première !</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                            {lobbies.map((l) => (
                                <div
                                    key={l.code}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        gap: ".8rem",
                                        padding: ".5rem .8rem",
                                        border: "1px solid #8884",
                                        borderRadius: "8px",
                                    }}
                                >
                                    <span>
                                        <strong style={{ letterSpacing: ".1em" }}>{l.code}</strong>
                                        {" · "}
                                        {mapName(l.mapId)}
                                        {" · "}
                                        <span style={{ opacity: 0.7 }}>
                                            {statutLabel(l.status)} — {l.seatsTaken}/{l.seatsTotal}
                                        </span>
                                    </span>
                                    <button className="menu-btn menu-btn--ghost" onClick={() => onJoin(l.code)}>
                                        Rejoindre
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

const mapName = (id) => MAPS.find((m) => m.id === id)?.name || id;
const statutLabel = (s) => (s === "waiting" ? "en attente" : s === "playing" ? "en cours" : s);
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
