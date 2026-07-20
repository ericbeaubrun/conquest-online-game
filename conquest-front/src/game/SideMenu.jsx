// Menu latéral : graphiques statistiques de la partie et actions de partie.
import {useEffect, useState} from 'react';
import {STAT_CHARTS} from './stats/chartList.js';

const SideMenu = ({
                       open,
                       turn,
                       maxTurns,
                       onOpenStats,
                       onExit,
                       onSave,
                       savedAt,
                       onRestart,
                       onBackToMenu,
                       showAllStats,
                       onToggleShowAllStats,
                       statBars,
                       onToggleStatBars,
                   }) => {
    // Accusé de réception éphémère : à chaque nouvelle sauvegarde (`savedAt`
    // change), on affiche « Sauvegardé ✓ » sur le bouton pendant 2 s.
    const [justSaved, setJustSaved] = useState(false);
    useEffect(() => {
        if (!savedAt) return;
        setJustSaved(true);
        const t = setTimeout(() => setJustSaved(false), 2000);
        return () => clearTimeout(t);
    }, [savedAt]);

    return (
    <div className={`side-menu ${open ? 'open' : ''}`}>
        {/* Le numéro de tour vit ici plutôt que dans la barre du haut, où il
            occupait une place permanente pour une donnée qu'on ne consulte que
            ponctuellement. */}
        <div className="side-menu__turn">
            Tour <span className="side-menu__turn-value">{turn}</span>
            {maxTurns ? ` / ${maxTurns}` : ''}
        </div>
        <div className="menu-section">
            <span className="menu-section__title">Statistiques</span>
            {STAT_CHARTS.map((c) => (
                <button key={c.id} onClick={() => onOpenStats?.(c.id)}>
                    {c.label}
                </button>
            ))}
        </div>
        <div className="menu-section">
            <span className="menu-section__title">Paramètres</span>
            <button
                className={`side-menu__toggle ${showAllStats ? 'side-menu__toggle--active' : ''}`}
                onClick={() => onToggleShowAllStats?.()}
                aria-pressed={!!showAllStats}
            >
                Afficher les stats atk/PV
            </button>
            <button
                className={`side-menu__toggle ${statBars ? 'side-menu__toggle--active' : ''}`}
                onClick={() => onToggleStatBars?.()}
                aria-pressed={!!statBars}
            >
                Stats en jauges
            </button>
        </div>
        <div className="menu-section">
            <span className="menu-section__title">Partie</span>
            {/* Sauvegarde hors-ligne : `onSave` n'est fourni qu'en local (en
                online l'état est déjà persisté côté serveur). Fonctionnalités à
                venir : onRestart / onBackToMenu, d'où le repli no-op. */}
            <button
                onClick={() => onSave?.()}
                disabled={!onSave}
                title={onSave ? 'Sauvegarder la partie' : 'Indisponible en ligne'}
            >
                {justSaved ? 'Sauvegardé ✓' : 'Sauvegarder'}
            </button>
            <button onClick={() => onRestart?.()} title="Bientôt disponible">Recommencer</button>
            <button onClick={() => onBackToMenu?.()} title="Bientôt disponible">Retourner au menu</button>
            <button className="side-menu__exit" onClick={() => onExit?.()}>Quitter</button>
        </div>
    </div>
    );
};

export default SideMenu;
