// Écran « Charger une partie » (hors-ligne). Pendant local de LobbyBrowser : on
// dissocie la CRÉATION d'une partie (OfflineSetup) de son CHARGEMENT, qui a sa
// propre page.
//
// La capacité de sauvegarde est FIXE et rendue visible : on affiche toujours
// `MAX_SAVE_SLOTS` emplacements, les occupés d'abord (du plus récent au plus
// ancien), puis les libres en pointillés. Sauvegarder au-delà évince la plus
// ancienne (file) — d'où le rappel affiché quand tous les slots sont pris.

import { useState } from 'react';
import {
    MAX_SAVE_SLOTS,
    listSavedGames,
    getSavedState,
    deleteSavedGame,
} from '../game/session/savedGames.js';

// Date + heure lisibles (locale FR) pour l'étiquette d'une sauvegarde.
const formatSavedAt = (ts) =>
    new Date(ts).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

// Slot OCCUPÉ : métadonnées de la partie, bouton de rechargement, croix de
// suppression.
const FilledSlot = ({ index, save, onLoad, onDelete }) => (
    <div className="save-slot save-slot--filled">
        <span className="save-slot__num">{index + 1}</span>

        <div className="save-slot__info">
            <span className="save-slot__map">{save.mapName}</span>
            <span className="save-slot__meta">
                {save.playerCount} joueurs · Tour {save.turn}
            </span>
            <span className="save-slot__date">{formatSavedAt(save.savedAt)}</span>
        </div>

        <button
            type="button"
            className="save-slot__load"
            onClick={() => onLoad(save.id)}
            title="Recharger cette partie"
        >
            Recharger ▶
        </button>
        <button
            type="button"
            className="save-slot__delete"
            onClick={() => onDelete(save.id)}
            title="Supprimer cette sauvegarde"
            aria-label={`Supprimer la sauvegarde ${index + 1}`}
        >
            ×
        </button>
    </div>
);

// Slot LIBRE : simple gabarit en pointillés, non interactif.
const EmptySlot = ({ index }) => (
    <div className="save-slot save-slot--empty">
        <span className="save-slot__num">{index + 1}</span>
        <span className="save-slot__placeholder">Emplacement libre</span>
    </div>
);

const LoadGame = ({ onBack, onLoadSave }) => {
    // Liste des sauvegardes (localStorage), rafraîchie après suppression.
    const [saves, setSaves] = useState(() => listSavedGames());

    const loadSave = (id) => {
        const state = getSavedState(id);
        if (state) onLoadSave?.(state);
    };

    const removeSave = (id) => {
        deleteSavedGame(id);
        setSaves(listSavedGames());
    };

    const full = saves.length >= MAX_SAVE_SLOTS;
    // Les slots libres complètent la liste jusqu'à la capacité fixe.
    const freeSlots = Math.max(0, MAX_SAVE_SLOTS - saves.length);

    return (
        <div className="setup-screen setup-screen--local">
            <header className="setup-topbar">
                <button className="menu-btn menu-btn--ghost" onClick={onBack}>
                    Retour
                </button>
                <div className="setup-topbar__heading">
                    <span className="setup-topbar__eyebrow">Partie locale</span>
                    <h1 className="setup-topbar__title">Charger une partie</h1>
                </div>
                <span className="setup-topbar__spacer" />
            </header>

            <div className="setup-body">
                <section className="setup-section">
                    <h2 className="setup-section__title">
                        Parties sauvegardées
                        <span className="setup-section__count">
                            {saves.length}/{MAX_SAVE_SLOTS}
                        </span>
                    </h2>

                    <p className="save-slots__hint">
                        {full
                            ? 'Tous les emplacements sont occupés : la prochaine sauvegarde effacera la plus ancienne.'
                            : `${MAX_SAVE_SLOTS} emplacements de sauvegarde. Au-delà, la plus ancienne est effacée.`}
                    </p>

                    <div className="save-slots">
                        {saves.map((s, i) => (
                            <FilledSlot
                                key={s.id}
                                index={i}
                                save={s}
                                onLoad={loadSave}
                                onDelete={removeSave}
                            />
                        ))}
                        {Array.from({ length: freeSlots }, (_, i) => (
                            <EmptySlot key={`empty-${i}`} index={saves.length + i} />
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default LoadGame;
