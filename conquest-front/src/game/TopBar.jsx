import {incomeFor} from '@conquest/shared-engine/engine/selectors.js';

// Barre du haut : menu, numéro de tour, chrono, profils des joueurs (or et
// revenu), et bouton de fin de tour. Purement présentationnelle.
const TopBar = ({
                    state,
                    localPlayerId,
                    online,
                    turnTimer,
                    timeLeft,
                    canAct,
                    onToggleMenu,
                    onEndTurn,
                }) => {
    const {players, activePlayerId, turn, gold, settings} = state;
    const localName = players.find((p) => p.id === localPlayerId)?.name ?? localPlayerId;

    return (
        <div className="top-bar">
            <div className="burger-menu" onClick={onToggleMenu}>
                ☰
            </div>
            <div className="turn-counter" title="Numéro du tour">
                Tour {turn}
                {settings?.maxTurns ? `/${settings.maxTurns}` : ''}
            </div>
            {online && (
                <div className="turn-counter" title="Votre place dans la partie">
                    {localPlayerId ? `Vous : ${localName}` : 'Spectateur'}
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
                {players.map((player) => (
                    <div
                        className={`player-profile ${
                            player.id === activePlayerId ? 'player-profile--active' : ''
                        }`}
                        key={player.id}
                        title={player.id === activePlayerId ? `Au tour de ${player.name}` : player.name}
                    >
                        <div
                            className="player-avatar"
                            style={{backgroundColor: player.color}}
                            aria-label={player.name}
                        />
                        <div className="player-stats">
                            <div className="stat" title="Or en réserve">
                                <img src="/coin.png" alt="or" className="stat__coin"/>
                                {gold[player.id] ?? 0}
                            </div>
                            <div className="stat" title="Or gagné par tour">
                                <span role="img" aria-label="or par tour">📈</span>
                                +{incomeFor(state, player.id)}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <button
                className="end-turn-button"
                title={canAct ? 'Passer son tour' : 'En attente du tour adverse'}
                onClick={onEndTurn}
                disabled={!canAct}
            >→
            </button>
        </div>
    );
};

export default TopBar;
