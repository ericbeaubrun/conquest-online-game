// Écran de fin de partie : voile sombre + panneau du vainqueur.
const END_REASONS = {
    elimination: 'Dernier joueur en lice',
    domination: 'Domination du territoire',
    economy: 'Course à l’or remportée',
    timeout: 'Limite de tours atteinte',
};

const GameOverOverlay = ({winner, endReason, onReplay, onExit}) => (
    <div className="game-over">
        <div className="game-over__panel">
            <span className="game-over__label">Partie terminée</span>
            {winner ? (
                <>
                    <div
                        className="game-over__avatar"
                        style={{backgroundColor: winner.color}}
                        aria-hidden="true"
                    />
                    <h2 className="game-over__winner">{winner.name} l’emporte !</h2>
                </>
            ) : (
                <h2 className="game-over__winner">Match nul</h2>
            )}
            <span className="game-over__reason">{END_REASONS[endReason] || ''}</span>
            <div className="game-over__actions">
                <button className="game-over__btn game-over__btn--primary" onClick={onReplay}>
                    Rejouer
                </button>
                <button className="game-over__btn" onClick={onExit}>
                    Menu principal
                </button>
            </div>
        </div>
    </div>
);

export default GameOverOverlay;
