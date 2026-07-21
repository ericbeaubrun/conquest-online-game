import {upkeepFor} from '@conquest/shared-engine/data/soldier.js';

// Ligne « Or / tour » homogène pour toute unité possédable (soldat, squelette,
// bâtiment, arbre). Affiche directement l'entretien attribué à son propriétaire,
// pièce d'or et « / tour » collés au nombre :
//   - coût  (entretien positif) : en rouge, « −N [pièce] / tour pour <joueur> » ;
//   - gain  (entretien négatif, ex. maison) : en jaune, « +N [pièce] / tour pour <joueur> » ;
//   - nul   : « Aucun ».
// `cost` force le montant au lieu de le lire au barème des unités : les arbres
// sont taxés par le TERRITOIRE (`treeUpkeep`, voir `treeUpkeepTotal`) et non par
// `upkeepFor`, qui ne connaît que les unités possédées.
// `label` : libellé optionnel à gauche de la valeur (aligné sur les autres
// lignes de caractéristiques), utile quand la ligne serait sinon orpheline.
const UpkeepSpec = ({unit, settings, cost: costProp, label}) => {
    const cost = costProp ?? upkeepFor(unit, settings);
    return (
        <div className="soldier-spec">
            {label && <span className="soldier-spec__label">{label}</span>}
            {cost !== 0 ? (
                <span
                    className={`soldier-spec__value ${cost > 0 ? 'soldier-spec__value--cost' : 'soldier-spec__value--gain'}`}>
                    {cost > 0 ? '−' : '+'}
                    {Math.abs(cost)} <img src="/coin.png" alt="or" className="coin-icon"/> / tour
                </span>
            ) : (
                <span className="soldier-spec__value">Aucun</span>
            )}
        </div>
    );
};

export default UpkeepSpec;
