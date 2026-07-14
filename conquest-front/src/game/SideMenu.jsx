import {MAPS} from '@conquest/shared-engine/data/maps.js';

// Menu latéral : changement de carte et sortie de la partie.
const SideMenu = ({open, mapId, onSelectMap, onExit}) => (
    <div className={`side-menu ${open ? 'open' : ''}`}>
        <div className="menu-section">
            <span className="menu-section__title">Cartes</span>
            {MAPS.map((m) => (
                <button
                    key={m.id}
                    className={`map-option ${m.id === mapId ? 'map-option--active' : ''}`}
                    onClick={() => onSelectMap(m.id)}
                >
                    <span className="map-option__name">{m.name}</span>
                    <span className="map-option__desc">{m.description}</span>
                </button>
            ))}
        </div>

        <div className="menu-section">
            <span className="menu-section__title">Partie</span>
            <button onClick={() => onExit?.()}>Quitter</button>
        </div>
    </div>
);

export default SideMenu;
