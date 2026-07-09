// Page de configuration d'une partie HORS-LIGNE. Objectif : un maximum de
// personnalisation via des champs et des toggles. Trois sections :
//   1. Carte      — choisit le plateau (fixe la capacité en joueurs).
//   2. Joueurs    — ajoute/retire des joueurs, Humain/Bot, difficulté, couleur, nom.
//   3. Réglages   — paramètres d'équilibrage rendus depuis un schéma déclaratif
//                   (voir setupConfig.js) pour pouvoir en ajouter/retirer facilement.
// Un bandeau collant en bas lance la partie.

import { useMemo, useState } from 'react';
import { MAPS } from '../game/maps.js';
import {
    COLOR_PALETTE,
    BOT_DIFFICULTIES,
    GAME_SETTINGS,
    SETTING_GROUPS,
    MIN_PLAYERS,
    mapCapacity,
    makeDefaultPlayer,
    defaultSettings,
} from './setupConfig.js';

// --- Toggle segmenté générique (deux valeurs ou plus) ---
const Segmented = ({ options, value, onChange, size }) => (
    <div className={`segmented ${size ? `segmented--${size}` : ''}`}>
        {options.map((opt) => (
            <button
                key={opt.value}
                type="button"
                className={`segmented__opt ${value === opt.value ? 'segmented__opt--active' : ''}`}
                onClick={() => onChange(opt.value)}
            >
                {opt.label}
            </button>
        ))}
    </div>
);

// --- Sélecteur de couleur (pastille + menu de la palette) ---
const ColorPicker = ({ value, used, onChange }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="color-picker">
            <button
                type="button"
                className="color-picker__swatch"
                style={{ backgroundColor: value }}
                onClick={() => setOpen((o) => !o)}
                aria-label="Changer la couleur"
                title="Changer la couleur"
            />
            {open && (
                <>
                    {/* Zone de fermeture au clic extérieur */}
                    <div className="color-picker__scrim" onClick={() => setOpen(false)} />
                    <div className="color-picker__menu">
                        {COLOR_PALETTE.map((c) => {
                            const taken = used.has(c.value) && c.value !== value;
                            return (
                                <button
                                    key={c.value}
                                    type="button"
                                    className={`color-picker__chip ${c.value === value ? 'color-picker__chip--active' : ''} ${taken ? 'color-picker__chip--taken' : ''}`}
                                    style={{ backgroundColor: c.value }}
                                    disabled={taken}
                                    title={taken ? `${c.name} (prise)` : c.name}
                                    onClick={() => {
                                        onChange(c.value);
                                        setOpen(false);
                                    }}
                                />
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

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

// --- Contrôle numérique réutilisable (steppers − / +, bornes, unité) ---
const NumberInput = ({ value, min = 0, max = 999, step = 1, unit, onChange }) => (
    <div className="setting__number">
        <button
            type="button"
            className="setting__step"
            onClick={() => onChange(Math.max(min, value - step))}
            disabled={value <= min}
        >
            −
        </button>
        <input
            type="number"
            className="setting__input"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
                const raw = Number(e.target.value);
                if (Number.isNaN(raw)) return;
                onChange(Math.min(max, Math.max(min, raw)));
            }}
        />
        {unit && <span className="setting__unit">{unit}</span>}
        <button
            type="button"
            className="setting__step"
            onClick={() => onChange(Math.min(max, value + step))}
            disabled={value >= max}
        >
            +
        </button>
    </div>
);

// --- Réglage « groupe » : sous-barème repliable (liste de champs numériques) ---
const GroupField = ({ spec, value, onChange }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className={`setting setting--group ${open ? 'setting--open' : ''}`}>
            <button type="button" className="setting__grouphead" onClick={() => setOpen((o) => !o)}>
                <span className="setting__text">
                    <span className="setting__label">{spec.label}</span>
                    {spec.help && <span className="setting__help">{spec.help}</span>}
                </span>
                <span className="setting__chevron">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div className="setting__grouplist">
                    {spec.fields.map((f) => (
                        <div className="setting__grouprow" key={f.key}>
                            <span className="setting__grouplabel">{f.label}</span>
                            {f.control === 'toggle' ? (
                                <Segmented
                                    size="sm"
                                    options={[
                                        { value: true, label: 'Oui' },
                                        { value: false, label: 'Non' },
                                    ]}
                                    value={value?.[f.key] ?? f.default}
                                    onChange={(v) => onChange({ ...value, [f.key]: v })}
                                />
                            ) : (
                                <NumberInput
                                    value={value?.[f.key] ?? f.default}
                                    min={f.min}
                                    max={f.max}
                                    step={f.step}
                                    unit={f.unit}
                                    onChange={(v) => onChange({ ...value, [f.key]: v })}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- Champ de réglage générique, rendu depuis le schéma ---
const SettingField = ({ spec, value, onChange }) => {
    // Les groupes ont leur propre mise en page (repliable, pleine largeur).
    if (spec.type === 'group') return <GroupField spec={spec} value={value} onChange={onChange} />;

    let control;
    if (spec.type === 'toggle') {
        control = (
            <Segmented
                size="sm"
                options={[
                    { value: true, label: 'Oui' },
                    { value: false, label: 'Non' },
                ]}
                value={value}
                onChange={onChange}
            />
        );
    } else if (spec.type === 'select') {
        control = (
            <select
                className="setting__select"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {spec.options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        );
    } else {
        control = (
            <NumberInput
                value={value}
                min={spec.min}
                max={spec.max}
                step={spec.step || 1}
                unit={spec.unit}
                onChange={onChange}
            />
        );
    }

    return (
        <div className="setting">
            <div className="setting__text">
                <span className="setting__label">{spec.label}</span>
                {spec.help && <span className="setting__help">{spec.help}</span>}
            </div>
            <div className="setting__control">{control}</div>
        </div>
    );
};

const OfflineSetup = ({ initialConfig, onBack, onLaunch }) => {
    const [mapId, setMapId] = useState(initialConfig?.mapId ?? MAPS[0].id);
    const [players, setPlayers] = useState(
        initialConfig?.players ?? [makeDefaultPlayer(0, []), makeDefaultPlayer(1, [makeDefaultPlayer(0, [])])]
    );
    const [settings, setSettings] = useState(initialConfig?.settings ?? defaultSettings());

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

                {/* --- Section RÉGLAGES --- */}
                <section className="setup-section">
                    <h2 className="setup-section__title">Réglages avancés</h2>
                    {SETTING_GROUPS.map((group) => (
                        <div className="setting-group" key={group}>
                            <h3 className="setting-group__title">{group}</h3>
                            <div className="setting-group__list">
                                {GAME_SETTINGS.filter((s) => s.group === group).map((spec) => {
                                    // Réglage dépendant d'un toggle désactivé : masqué.
                                    if (spec.dependsOn && !settings[spec.dependsOn]) return null;
                                    // Condition d'affichage fine (ex. selon le mode de victoire).
                                    if (spec.showWhen && !spec.showWhen(settings)) return null;
                                    return (
                                        <SettingField
                                            key={spec.id}
                                            spec={spec}
                                            value={settings[spec.id]}
                                            onChange={(v) => updateSetting(spec.id, v)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
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
