// Modal de choix de PLACE (couleur) affiché en rejoignant une partie EN COURS.
// Le joueur doit choisir quelle couleur (place libre) il reprend parmi celles
// proposées par le serveur. Il peut aussi renoncer et observer la partie.

const SeatPickerModal = ({ options = [], onChoose, onSpectate }) => (
    <div className="seatpick-scrim">
        <div className="seatpick">
            <h2 className="seatpick__title">Choisis ta couleur</h2>
            <p className="seatpick__hint">
                Reprends l’une des places libres de la partie.
            </p>

            {options.length === 0 ? (
                <p className="seatpick__empty">Aucune place libre — tu peux observer.</p>
            ) : (
                <div className="seatpick__grid">
                    {options.map((o) => (
                        <button
                            key={o.playerId}
                            type="button"
                            className="seatpick__opt"
                            onClick={() => onChoose(o.playerId)}
                        >
                            <span
                                className="seatpick__swatch"
                                style={{ backgroundColor: o.color }}
                            />
                            <span className="seatpick__name">{o.name}</span>
                        </button>
                    ))}
                </div>
            )}

            <button type="button" className="menu-btn menu-btn--ghost seatpick__spectate" onClick={onSpectate}>
                Observer seulement
            </button>
        </div>
    </div>
);

export default SeatPickerModal;
