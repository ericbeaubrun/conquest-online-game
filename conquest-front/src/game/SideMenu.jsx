// Menu latéral : graphiques statistiques de la partie et actions de partie.
import {useEffect, useState, useSyncExternalStore} from 'react';
import {STAT_CHARTS} from './stats/chartList.js';
import {
    BOT_DELAY_STEPS,
    botDelayLabel,
    getBotDelay,
    setBotDelay,
    subscribeBotDelay,
} from './session/botSpeed.js';

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
                       showBoardControls,
                       onToggleBoardControls,
                       showActionBar,
                       onToggleActionBar,
                       showToasts,
                       onToggleToasts,
                       showBotSpeed,
                   }) => {
    // Vitesse des bots : magasin de module, partagé avec la session hors-ligne
    // qui joue leurs coups (cf. session/botSpeed.js). La jauge se déplace par
    // paliers — un curseur continu en millisecondes n'apporterait rien.
    const botDelay = useSyncExternalStore(subscribeBotDelay, getBotDelay, getBotDelay);
    // Repli sur le palier le plus proche : la valeur mémorisée peut venir d'une
    // version antérieure de la liste des paliers.
    const botDelayIndex = BOT_DELAY_STEPS.reduce(
        (best, ms, i) =>
            Math.abs(ms - botDelay) < Math.abs(BOT_DELAY_STEPS[best] - botDelay) ? i : best,
        0
    );

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
            {/* Panneaux latéraux : commandes du plateau (zoom / recentrage, à
                droite) et barre d'actions du soldat (à gauche). */}
            <button
                className={`side-menu__toggle ${showBoardControls ? 'side-menu__toggle--active' : ''}`}
                onClick={() => onToggleBoardControls?.()}
                aria-pressed={!!showBoardControls}
            >
                Commandes du plateau
            </button>
            <button
                className={`side-menu__toggle ${showActionBar ? 'side-menu__toggle--active' : ''}`}
                onClick={() => onToggleActionBar?.()}
                aria-pressed={!!showActionBar}
            >
                Barre d&apos;actions
            </button>
            <button
                className={`side-menu__toggle ${showToasts ? 'side-menu__toggle--active' : ''}`}
                onClick={() => onToggleToasts?.()}
                aria-pressed={!!showToasts}
            >
                Notifications
            </button>
            {/* Rythme des bots : hors-ligne seulement — en ligne les bots
                jouent côté serveur, un client ne règle pas leur cadence. */}
            {showBotSpeed && (
                <div className="side-menu__slider">
                    <label className="side-menu__slider-label" htmlFor="bot-speed">
                        Vitesse des bots
                        <span className="side-menu__slider-value">{botDelayLabel(botDelay)}</span>
                    </label>
                    <input
                        id="bot-speed"
                        type="range"
                        min="0"
                        max={BOT_DELAY_STEPS.length - 1}
                        step="1"
                        value={botDelayIndex}
                        onChange={(e) => setBotDelay(BOT_DELAY_STEPS[Number(e.target.value)])}
                        title="Temps d'attente entre deux coups du bot — augmentez-le pour suivre chaque coup"
                    />
                    <span className="side-menu__slider-hint">
                        Pause entre chaque coup du bot. Prend effet à son prochain tour.
                    </span>
                </div>
            )}
        </div>
        <div className="menu-section">
            <span className="menu-section__title">Partie</span>
            {/* Sauvegarde hors-ligne : `onSave` n'est fourni qu'en local (en
                online l'état est déjà persisté côté serveur), tout comme
                `onRestart`. Fonctionnalité à venir : onBackToMenu. */}
            <button
                onClick={() => onSave?.()}
                disabled={!onSave}
                title={onSave ? 'Sauvegarder la partie' : 'Indisponible en ligne'}
            >
                {justSaved ? 'Sauvegardé ✓' : 'Sauvegarder'}
            </button>
            <button
                onClick={() => onRestart?.()}
                disabled={!onRestart}
                title={onRestart ? 'Rejouer la même partie depuis le début' : 'Indisponible en ligne'}
            >
                Recommencer
            </button>
            <button onClick={() => onBackToMenu?.()} title="Bientôt disponible">Retourner au menu</button>
            <button className="side-menu__exit" onClick={() => onExit?.()}>Quitter</button>
        </div>
    </div>
    );
};

export default SideMenu;
