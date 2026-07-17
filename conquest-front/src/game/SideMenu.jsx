// Menu latéral : sortie de la partie.
const SideMenu = ({open, onExit}) => (
    <div className={`side-menu ${open ? 'open' : ''}`}>
        <div className="menu-section">
            <span className="menu-section__title">Partie</span>
            <button onClick={() => onExit?.()}>Quitter</button>
        </div>
    </div>
);

export default SideMenu;
