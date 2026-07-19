// Menu latéral : graphiques statistiques de la partie et actions de partie.
import {STAT_CHARTS} from './stats/chartList.js';

const SideMenu = ({open, turn, maxTurns, onOpenStats, onExit, onSave, onRestart, onBackToMenu}) => (
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
            <span className="menu-section__title">Partie</span>
            {/* Fonctionnalités à venir : les handlers (onSave / onRestart /
                onBackToMenu) seront branchés plus tard, d'où le repli no-op. */}
            <button onClick={() => onSave?.()} title="Bientôt disponible">Sauvegarder</button>
            <button onClick={() => onRestart?.()} title="Bientôt disponible">Recommencer</button>
            <button onClick={() => onBackToMenu?.()} title="Bientôt disponible">Retourner au menu</button>
            <button onClick={() => onExit?.()}>Quitter</button>
        </div>
    </div>
);

export default SideMenu;
