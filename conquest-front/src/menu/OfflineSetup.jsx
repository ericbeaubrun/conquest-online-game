// Page de configuration d'une partie HORS-LIGNE. Objectif : un maximum de
// personnalisation via des champs et des toggles. Trois sections :
//   1. Carte      — choisit le plateau (fixe la capacité en joueurs).
//   2. Joueurs    — ajoute/retire des joueurs, Humain/Bot, difficulté, couleur, nom.
//   3. Réglages   — paramètres d'équilibrage rendus depuis un schéma déclaratif
//                   (voir setupConfig.js) pour pouvoir en ajouter/retirer facilement.
// Un bandeau collant en bas lance la partie.

import { useMemo, useState } from 'react';
import { MAPS } from '@conquest/shared-engine/data/maps.js';
import {
    BOT_DIFFICULTIES,
    MIN_PLAYERS,
    mapCapacity,
    makeDefaultPlayer,
    defaultSettings,
} from './setupConfig.js';
import { Segmented, ColorPicker, AdvancedSettings } from './SetupControls.jsx';

// --- Ligne d'un joueur ---
const PlayerRow = ({ index, player, usedColors, canRemove, onChange, onRemove }) => {
    const isBot = player.kind === 'bot';
    return (
        <div className="player-row">
            <span className="player-row__num">{index + 1}</span>

            <ColorPicker
                value={player.color}
                used={usedColors}
                onChange={(color) => onChange({ ...player, color })}
            />

            <Segmented
                size="sm"
                options={[
                    { value: 'human', label: 'Joueur' },
                    { value: 'bot', label: 'Bot' },
                ]}
                value={player.kind}
                onChange={(kind) => onChange({ ...player, kind })}
            />

            {/* Le nom est saisissable pour un joueur ; un bot est nommé par sa difficulté. */}
            {isBot ? (
                <Segmented
                    size="sm"
                    options={BOT_DIFFICULTIES.map((d) => ({ value: d.id, label: d.label }))}
                    value={player.botDifficulty}
                    onChange={(botDifficulty) => onChange({ ...player, botDifficulty })}
                />
            ) : (
                <input
                    className="player-row__name"
                    type="text"
                    maxLength={16}
                    value={player.name}
                    placeholder="Nom du joueur"
                    onChange={(e) => onChange({ ...player, name: e.target.value })}
                />
            )}

            <button
                type="button"
                className="player-row__remove"
                onClick={onRemove}
                disabled={!canRemove}
                title={canRemove ? 'Retirer ce joueur' : `Minimum ${MIN_PLAYERS} joueurs`}
            >
                ×
            </button>
        </div>
    );
};

const OfflineSetup = ({ initialConfig, onBack, onLaunch }) => {
    const [mapId, setMapId] = useState(initialConfig?.mapId ?? MAPS[0].id);
    const [players, setPlayers] = useState(
        initialConfig?.players ?? [makeDefaultPlayer(0, []), makeDefaultPlayer(1, [makeDefaultPlayer(0, [])])]
    );
    // On garnit toujours des valeurs par défaut : une config héritée (relance /
    // ré-édition) peut précéder l'ajout d'un réglage — le champ manquant serait
    // alors `undefined` (contrôle non éditable). Même garde que la salle en ligne.
    const [settings, setSettings] = useState(() => ({
        ...defaultSettings(),
        ...(initialConfig?.settings || {}),
    }));
    // Section « Réglages avancés » repliable, fermée par défaut.
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const capacity = mapCapacity(mapId);
    const usedColors = useMemo(() => new Set(players.map((p) => p.color)), [players]);

    // Sélection de carte : si la nouvelle carte accueille moins de joueurs que
    // la configuration actuelle, on tronque la liste à sa capacité.
    const selectMap = (id) => {
        setMapId(id);
        const cap = mapCapacity(id);
        setPlayers((prev) => (prev.length > cap ? prev.slice(0, cap) : prev));
    };

    const updatePlayer = (index, next) =>
        setPlayers((prev) => prev.map((p, i) => (i === index ? next : p)));

    const addPlayer = () =>
        setPlayers((prev) => (prev.length >= capacity ? prev : [...prev, makeDefaultPlayer(prev.length, prev)]));

    const removePlayer = (index) =>
        setPlayers((prev) =>
            prev.length <= MIN_PLAYERS
                ? prev
                : prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, id: `p${i + 1}` }))
        );

    const updateSetting = (id, value) => setSettings((prev) => ({ ...prev, [id]: value }));

    const launch = () => onLaunch({ mapId, players, settings });

    const selectedMap = MAPS.find((m) => m.id === mapId);

    return (
        <div className="setup-screen">
            {/* En-tête */}
            <header className="setup-topbar">
                <button className="menu-btn menu-btn--ghost" onClick={onBack}>
                    ← Retour
                </button>
                <h1 className="setup-topbar__title">Partie hors-ligne</h1>
                <span className="setup-topbar__spacer" />
            </header>

            <div className="setup-body">
                {/* --- Section CARTE --- */}
                <section className="setup-section">
                    <h2 className="setup-section__title">Carte</h2>
                    <div className="map-grid">
                        {MAPS.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                className={`map-card ${m.id === mapId ? 'map-card--active' : ''}`}
                                onClick={() => selectMap(m.id)}
                            >
                                <span className="map-card__name">{m.name}</span>
                                <span className="map-card__desc">{m.description}</span>
                                <span className="map-card__cap">{m.spawns.length} joueurs max</span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* --- Section JOUEURS --- */}
                <section className="setup-section">
                    <h2 className="setup-section__title">
                        Joueurs
                        <span className="setup-section__count">
                            {players.length}/{capacity}
                        </span>
                    </h2>
                    <div className="player-list">
                        {players.map((p, i) => (
                            <PlayerRow
                                key={p.id}
                                index={i}
                                player={p}
                                usedColors={usedColors}
                                canRemove={players.length > MIN_PLAYERS}
                                onChange={(next) => updatePlayer(i, next)}
                                onRemove={() => removePlayer(i)}
                            />
                        ))}
                    </div>
                    <button
                        type="button"
                        className="add-player-btn"
                        onClick={addPlayer}
                        disabled={players.length >= capacity}
                    >
                        {players.length >= capacity
                            ? `Capacité de « ${selectedMap?.name} » atteinte`
                            : '+ Ajouter un joueur'}
                    </button>
                </section>

                {/* --- Section RÉGLAGES (partagée avec la salle d'attente en ligne) --- */}
                <section className="setup-section">
                    <button
                        type="button"
                        className={`setup-section__toggle ${advancedOpen ? "setup-section__toggle--open" : ""}`}
                        onClick={() => setAdvancedOpen((o) => !o)}
                        aria-expanded={advancedOpen}
                    >
                        <span className="setup-section__title">Réglages avancés</span>
                        <span className="setup-section__chevron">{advancedOpen ? "▲" : "▼"}</span>
                    </button>
                    {advancedOpen && (
                        <AdvancedSettings settings={settings} onChange={updateSetting} />
                    )}
                </section>
            </div>

            {/* Bandeau de lancement */}
            <footer className="setup-launchbar">
                <span className="setup-launchbar__summary">
                    {selectedMap?.name} · {players.length} joueurs
                </span>
                <button className="menu-btn menu-btn--play menu-btn--launch" onClick={launch}>
                    Lancer la partie ▶
                </button>
            </footer>
        </div>
    );
};

export default OfflineSetup;
