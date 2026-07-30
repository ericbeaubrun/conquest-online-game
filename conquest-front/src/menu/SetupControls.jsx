// Contrôles de configuration PARTAGÉS entre la partie hors-ligne (OfflineSetup)
// et la salle d'attente en ligne (LobbyWaiting). Le but est d'avoir EXACTEMENT
// les mêmes « réglages avancés » des deux côtés : ils vivent donc ici, une seule
// fois, et sont rendus depuis le schéma déclaratif de setupConfig.js.
//
// Tous les contrôles acceptent `disabled` : en ligne, seuls l'hôte peut éditer ;
// les autres joueurs voient les réglages en lecture seule (désactivés).

import { useState } from 'react';
import { COLOR_PALETTE, GAME_SETTINGS, SETTING_GROUPS } from './setupConfig.js';

// --- Toggle segmenté générique (deux valeurs ou plus) ---
export const Segmented = ({ options, value, onChange, size, disabled, className = '' }) => (
    <div className={`segmented ${size ? `segmented--${size}` : ''} ${disabled ? 'segmented--disabled' : ''} ${className}`}>
        {options.map((opt) => (
            <button
                key={String(opt.value)}
                type="button"
                className={`segmented__opt ${value === opt.value ? 'segmented__opt--active' : ''}`}
                disabled={disabled}
                onClick={() => onChange(opt.value)}
            >
                {opt.label}
            </button>
        ))}
    </div>
);

// --- Sélecteur de couleur (pastille + menu de la palette) ---
export const ColorPicker = ({ value, used, onChange, disabled, label }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="color-picker">
            <button
                type="button"
                className="color-picker__swatch"
                style={{ backgroundColor: value }}
                onClick={() => setOpen((o) => !o)}
                disabled={disabled}
                aria-label={label ? `Changer la couleur du joueur ${label}` : 'Changer la couleur'}
                title="Changer la couleur"
            >
                {label}
            </button>
            {open && !disabled && (
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
                                >
                                    {taken && <img src="/croix.png" alt="" className="color-picker__taken-icon" />}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

// --- Contrôle numérique réutilisable (steppers − / +, bornes, unité) ---
export const NumberInput = ({ value, min = 0, max = 999, step = 1, unit, onChange, disabled }) => (
    <div className="setting__number">
        <button
            type="button"
            className="setting__step"
            onClick={() => onChange(Math.max(min, value - step))}
            disabled={disabled || value <= min}
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
            disabled={disabled}
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
            disabled={disabled || value >= max}
        >
            +
        </button>
    </div>
);

// --- Réglage « groupe » : sous-barème repliable (liste de champs numériques) ---
const GroupField = ({ spec, value, onChange, disabled }) => {
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
                                    disabled={disabled}
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
                                    disabled={disabled}
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
export const SettingField = ({ spec, value, onChange, disabled }) => {
    // Les groupes ont leur propre mise en page (repliable, pleine largeur).
    if (spec.type === 'group')
        return <GroupField spec={spec} value={value} onChange={onChange} disabled={disabled} />;

    let control;
    if (spec.type === 'toggle') {
        control = (
            <Segmented
                size="sm"
                disabled={disabled}
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
                disabled={disabled}
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
                disabled={disabled}
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

// --- Section « Réglages avancés » complète, rendue depuis le schéma ---
// Partagée telle quelle par l'offline et l'online. `onChange(id, value)` met à
// jour un réglage ; `disabled` la passe en lecture seule.
export const AdvancedSettings = ({ settings, onChange, disabled = false }) =>
    SETTING_GROUPS.map((group) => (
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
                            disabled={disabled}
                            onChange={(v) => onChange(spec.id, v)}
                        />
                    );
                })}
            </div>
        </div>
    ));
