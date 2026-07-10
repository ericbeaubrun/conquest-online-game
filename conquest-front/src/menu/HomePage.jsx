// Page d'accueil (esquisse). Barre du haut avec « Se connecter » à droite, puis
// un bloc central avec les deux boutons de jeu : PLAY OFFLINE et PLAY ONLINE.
// La connexion, l'inscription et le mode online viendront plus tard : ici, ces
// actions sont branchées sur des rappels que le parent fournira le moment venu.

const HomePage = ({ onPlayOffline, onPlayOnline, onLogin }) => {
    return (
        <div className="home-screen">
            {/* Barre du haut : titre à gauche, connexion à droite */}
            <header className="home-topbar">
                <span className="home-topbar__brand">CONQUEST</span>
                <button className="menu-btn menu-btn--ghost" onClick={onLogin}>
                    Se connecter
                </button>
            </header>

            {/* Bloc central */}
            <main className="home-hero">
                <h1 className="home-hero__title">CONQUEST</h1>
                <p className="home-hero__tagline">Conquérez l’hexagone.</p>

                <div className="home-hero__actions">
                    <button
                        className="menu-btn menu-btn--play menu-btn--offline"
                        onClick={onPlayOffline}
                    >
                        <span className="menu-btn__label">PLAY OFFLINE</span>
                        <span className="menu-btn__sub">Contre des bots, en local</span>
                    </button>
                    <button
                        className="menu-btn menu-btn--play menu-btn--online"
                        onClick={onPlayOnline}
                    >
                        <span className="menu-btn__label">PLAY ONLINE</span>
                        <span className="menu-btn__sub">Créez ou rejoignez une partie</span>
                    </button>
                </div>
            </main>
        </div>
    );
};

export default HomePage;
