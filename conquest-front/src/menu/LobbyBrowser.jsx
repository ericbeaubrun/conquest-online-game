// Écran de navigation des parties en ligne. Structure :
//   1. Une barre d'actions : CRÉER une partie (à gauche) · REJOINDRE par code (à droite).
//   2. Les parties EN ATTENTE (repliable, ouvert par défaut).
//   3. Les parties EN COURS (repliable, fermé par défaut).
//   4. Les parties SAUVEGARDÉES (repliable, fermé par défaut) : parties dont tous
//      les joueurs sont sortis mais conservées (autosave). On les reprend via un
//      mot de passe ; elles repassent alors « en cours ».
// Créer une partie n'exige PLUS de choisir une carte : on ouvre directement un
// lobby en attente (carte par défaut côté serveur) que l'on paramétrera ensuite
// dans la salle d'attente. Réutilise le langage visuel des écrans de menu.

import { useState } from "react";
import { MAPS } from "@conquest/shared-engine/data/maps.js";

const LobbyBrowser = ({ lobbies = [], error, onCreate, onJoin, onRefresh, onBack }) => {
    const [code, setCode] = useState("");
    const [showWaiting, setShowWaiting] = useState(true);
    const [showPlaying, setShowPlaying] = useState(false);
    const [showSaved, setShowSaved] = useState(false);

    const waiting = lobbies.filter((l) => l.status === "waiting");
    const playing = lobbies.filter((l) => l.status === "playing");
    const saved = lobbies.filter((l) => l.status === "saved");

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
                <span className="setup-topbar__spacer" />
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
                    onRefresh={onRefresh}
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
                    onRefresh={onRefresh}
                    joinLabel={(l) => (l.joinable ? "Rejoindre" : "Observer")}
                />

                {/* Parties sauvegardées (fermé par défaut) */}
                <SavedSection
                    open={showSaved}
                    onToggle={() => setShowSaved((v) => !v)}
                    count={saved.length}
                    lobbies={saved}
                    onJoin={onJoin}
                    onRefresh={onRefresh}
                />
            </div>
        </div>
    );
};

// En-tête commun aux sections : bascule (chevron + titre), bouton « Actualiser »
// à droite du titre, puis le compteur poussé à l'extrême droite.
const SectionHeader = ({ open, onToggle, title, count, onRefresh }) => (
    <div className="lobby-secthead">
        <button className="lobby-toggle" onClick={onToggle} aria-expanded={open}>
            <span className="lobby-toggle__chevron">{open ? "▾" : "▸"}</span>
            <span className="lobby-toggle__title">{title}</span>
        </button>
        <button
            className="lobby-refresh"
            onClick={onRefresh}
            title="Actualiser"
            aria-label="Actualiser la liste"
        >
            ⟳
        </button>
        <span className="lobby-toggle__count">{count}</span>
    </div>
);

// Section repliable listant des lobbies (en attente / en cours).
const LobbySection = ({ title, open, onToggle, count, lobbies, emptyLabel, onJoin, onRefresh, joinLabel = "Rejoindre" }) => (
    <section className="setup-section">
        <SectionHeader open={open} onToggle={onToggle} title={title} count={count} onRefresh={onRefresh} />

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
                                {typeof joinLabel === "function" ? joinLabel(l) : joinLabel}
                            </button>
                        </div>
                    ))
                )}
            </div>
        )}
    </section>
);

// Section repliable des parties SAUVEGARDÉES : chaque ligne indique la date/heure
// du dernier départ et — si la partie est protégée — un champ mot de passe à
// gauche du bouton « Rejoindre » (qui la fait repasser « en cours »).
const SavedSection = ({ open, onToggle, count, lobbies, onJoin, onRefresh }) => (
    <section className="setup-section">
        <SectionHeader
            open={open}
            onToggle={onToggle}
            title="Parties sauvegardées"
            count={count}
            onRefresh={onRefresh}
        />

        {open && (
            <div className="lobby-list">
                {lobbies.length === 0 ? (
                    <p className="lobby-empty">Aucune partie sauvegardée.</p>
                ) : (
                    lobbies.map((l) => <SavedRow key={l.code} lobby={l} onJoin={onJoin} />)
                )}
            </div>
        )}
    </section>
);

const SavedRow = ({ lobby, onJoin }) => {
    const [pw, setPw] = useState("");
    return (
        <div className="lobby-row">
            <span className="lobby-row__info">
                <strong className="lobby-row__code">{lobby.code}</strong>
                <span className="lobby-row__map">{mapName(lobby.mapId)}</span>
                <span className="lobby-row__saved">Quittée le {formatSavedAt(lobby.savedAt)}</span>
            </span>
            <div className="lobby-saved__join">
                {lobby.hasPassword && (
                    <input
                        className="lobby-join__code lobby-saved__pw"
                        type="password"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onJoin(lobby.code, pw)}
                        placeholder="Mot de passe"
                        maxLength={64}
                        aria-label="Mot de passe de la partie"
                    />
                )}
                <button className="menu-btn menu-btn--ghost" onClick={() => onJoin(lobby.code, pw)}>
                    Rejoindre
                </button>
            </div>
        </div>
    );
};

const mapName = (id) => MAPS.find((m) => m.id === id)?.name || id;
// Date/heure du dernier départ, format local lisible (repli si absente).
const formatSavedAt = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR");
};
const libelleErreur = (reason) => {
    const table = {
        "not-found": "Partie introuvable (mauvais code ?).",
        "create-failed": "Échec de la création de la partie.",
        "join-failed": "Échec pour rejoindre la partie.",
        "list-failed": "Échec du chargement de la liste.",
        "bad-password": "Mot de passe incorrect.",
    };
    return table[reason] || `Erreur : ${reason}`;
};

export default LobbyBrowser;
