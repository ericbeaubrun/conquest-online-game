import {useLayoutEffect, useRef} from 'react';
import {incomeFor, movableSoldierCount, playerAlive} from '@conquest/shared-engine/engine/selectors.js';

// Barre du haut : menu, numéro de tour, chrono, profils des joueurs (nom, or et
// revenu) et bouton de fin de tour. Purement présentationnelle.
//
// Un joueur ÉLIMINÉ (plus aucune case ni soldat, cf. `playerAlive`) est grisé et
// marqué d'une croix ; en ligne, le joueur local porte une couronne sur son
// propre profil — ce qui remplace l'ancien encart « Vous : … » de la barre.
const TopBar = ({
                    state,
                    localPlayerId,
                    online,
                    turnTimer,
                    timeLeft,
                    canAct,
                    menuOpen,
                    onToggleMenu,
                    onEndTurn,
                }) => {
    const {players, activePlayerId, turn, gold, settings} = state;
    const activeColor = players.find((p) => p.id === activePlayerId)?.color;

    // Libellé de survol d'un profil : l'état prime sur le simple nom.
    const profileTitle = (player, alive) => {
        if (!alive) return `${player.name} — éliminé`;
        if (player.id === activePlayerId) return `Au tour de ${player.name}`;
        return player.name;
    };

    // Hauteur réelle de la barre, exposée en variable CSS globale : elle varie
    // selon la taille d'écran (passe sur 2 lignes en mobile, cf. _topbar.scss),
    // le tiroir latéral (SideMenu) s'en sert pour ne jamais commencer sous la
    // barre (voir --topbar-height dans _layout.scss).
    const topBarRef = useRef(null);
    useLayoutEffect(() => {
        const el = topBarRef.current;
        if (!el) return;
        const update = () => {
            document.documentElement.style.setProperty('--topbar-height', `${el.offsetHeight}px`);
        };
        update();
        // ResizeObserver couvre les changements de contenu (nombre de joueurs,
        // etc.) ; l'écouteur `resize` sert de filet pour le changement de
        // palier responsive (rotation d'écran, redimensionnement de fenêtre).
        const ro = new ResizeObserver(update);
        ro.observe(el);
        window.addEventListener('resize', update);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', update);
        };
    }, []);

    return (
        <div className="top-bar" ref={topBarRef}>
            <button
                type="button"
                className={`burger-menu ${menuOpen ? 'burger-menu--open' : ''}`}
                onClick={onToggleMenu}
                aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                aria-expanded={menuOpen}
                title={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            >
                {menuOpen ? '✕' : '☰'}
            </button>
            <div className="turn-counter turn-counter--turn" title="Numéro du tour">
                Tour {turn}
                {settings?.maxTurns ? `/${settings.maxTurns}` : ''}
            </div>
            {online && !localPlayerId && (
                <div className="turn-counter turn-counter--spectator" title="Vous n'avez pas de siège dans cette partie">
                    Spectateur
                </div>
            )}
            {turnTimer > 0 && (
                <div
                    className={`turn-timer ${timeLeft <= 5 ? 'turn-timer--low' : ''}`}
                    title="Temps restant pour ce tour"
                >
                    ⏱ {Math.max(0, timeLeft)}s
                </div>
            )}
            <div className="players-info">
                {players.map((player) => {
                    const alive = playerAlive(state, player.id);
                    const isLocal = online && player.id === localPlayerId;
                    const classes = [
                        'player-profile',
                        // L'élimination prime sur le tour actif (états incohérents transitoires).
                        !alive ? 'player-profile--eliminated' : '',
                        alive && player.id === activePlayerId ? 'player-profile--active' : '',
                        isLocal ? 'player-profile--local' : '',
                    ].filter(Boolean).join(' ');
                    return (
                        <div className={classes} key={player.id} title={profileTitle(player, alive)}>
                            <div className="player-profile__avatar-box">
                                <div
                                    className="player-avatar"
                                    style={{backgroundColor: player.color}}
                                    aria-hidden="true"
                                >
                                    {/* Pas d'asset dédié bot/humain : un simple libellé dans l'avatar. */}
                                    {player.kind === 'bot' && <span className="player-avatar__bot">IA</span>}
                                </div>
                                {isLocal && (
                                    <img
                                        src="/crown.png"
                                        alt="Vous"
                                        className="player-profile__badge player-profile__badge--local"
                                    />
                                )}
                                {!alive && (
                                    <img
                                        src="/croix.png"
                                        alt="Éliminé"
                                        className="player-profile__badge player-profile__badge--dead"
                                    />
                                )}
                            </div>
                            <span className="player-profile__name">{player.name}</span>
                            {/* Un joueur éliminé n'a plus ni or utile ni revenu : on masque ses stats. */}
                            {alive && (
                                <div className="player-stats">
                                    <div className="stat stat--gold" title="Or en réserve">
                                        <img src="/coin.png" alt="or" className="stat__coin"/>
                                        {gold[player.id] ?? 0}
                                    </div>
                                    {(() => {
                                        const income = incomeFor(state, player.id);
                                        return (
                                            <div
                                                className={`stat ${income > 0 ? 'stat--positive' : 'stat--negative'}`}
                                                title="Or gagné par tour"
                                            >
                                                +{income}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div
                className="turn-counter turn-counter--movable"
                title="Soldats qu'il reste à déplacer ce tour"
            >
                <img src="/characters/lvl1/SoldierLVL1.png" alt="" className="movable-count__icon"/>
                {movableSoldierCount(state, activePlayerId)}
            </div>
            <button
                className="end-turn-button"
                style={{backgroundColor: activeColor}}
                title={canAct ? 'Passer son tour' : 'En attente du tour adverse'}
                onClick={onEndTurn}
                disabled={!canAct}
            >
                <img src="/skip.png" alt="Passer son tour" className="end-turn-button__icon"/>
            </button>
        </div>
    );
};

export default TopBar;
