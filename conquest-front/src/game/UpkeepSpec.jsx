import { upkeepFor } from '@shared/data/soldier.js';

// Ligne « Or / tour » homogène pour toute unité possédable (soldat, squelette,
// bâtiment, arbre). Affiche l'entretien attribué à son propriétaire :
//   - coût  (entretien positif) : en rouge, « −N pour <joueur> » ;
//   - gain  (entretien négatif, ex. maison) : en jaune, « +N pour <joueur> » ;
//   - nul   : « Aucun ».
// `owner` est le joueur propriétaire ({ name, color }) ou null (case neutre).
const UpkeepSpec = ({ unit, owner, settings }) => {
    const cost = upkeepFor(unit, settings);
    const forWhom = owner ? (
        <>
            {' '}
            pour <span style={{ color: owner.color }}>{owner.name}</span>
        </>
    ) : null;
    return (
        <div className="soldier-spec">
            <span className="soldier-spec__label">Or / tour</span>
            {cost > 0 ? (
                <span className="soldier-spec__value soldier-spec__value--cost">
                    −{cost}
                    {forWhom}
                </span>
            ) : cost < 0 ? (
                <span className="soldier-spec__value soldier-spec__value--gain">
                    +{-cost}
                    {forWhom}
                </span>
            ) : (
                <span className="soldier-spec__value">Aucun</span>
            )}
        </div>
    );
};

export default UpkeepSpec;
