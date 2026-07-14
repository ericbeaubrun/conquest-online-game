import {upkeepFor} from '@conquest/shared-engine/data/soldier.js';

// Ligne « Or / tour » homogène pour toute unité possédable (soldat, squelette,
// bâtiment, arbre). Affiche directement l'entretien attribué à son propriétaire,
// pièce d'or et « / tour » collés au nombre :
//   - coût  (entretien positif) : en rouge, « −N [pièce] / tour pour <joueur> » ;
//   - gain  (entretien négatif, ex. maison) : en jaune, « +N [pièce] / tour pour <joueur> » ;
//   - nul   : « Aucun ».
// `owner` est le joueur propriétaire ({ name, color }) ou null (case neutre).
const UpkeepSpec = ({unit, owner, settings}) => {
    const cost = upkeepFor(unit, settings);
    const forWhom = owner ? (
        <>
            {' '}
            pour <span style={{color: owner.color}}>{owner.name}</span>
        </>
    ) : null;
    return (
        <div className="soldier-spec">
            {cost !== 0 ? (
                <span
                    className={`soldier-spec__value ${cost > 0 ? 'soldier-spec__value--cost' : 'soldier-spec__value--gain'}`}>
                    {cost > 0 ? '−' : '+'}
                    {Math.abs(cost)} <img src="/coin.png" alt="or" className="coin-icon"/> / tour
                    {forWhom}
                </span>
            ) : (
                <span className="soldier-spec__value">Aucun</span>
            )}
        </div>
    );
};

export default UpkeepSpec;
