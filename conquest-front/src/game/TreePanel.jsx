import { TREE_REWARD } from '@conquest/shared-engine/engine/rules.js';
import {
    treeSrc,
    treeLabel,
    treeAffinity,
    treeRarity,
    treeReward,
} from '@conquest/shared-engine/data/trees.js';
import { affinityLabel } from '@conquest/shared-engine/data/soldier.js';
import { AFFINITY_SRC } from './board/constants.js';
import UpkeepSpec from './UpkeepSpec.jsx';

// Panneau d'un arbre : son essence, son affinité (icône de l'élément, ou
// « Aucune » — même présentation que le panneau du soldat), l'or gagné en
// l'abattant (déjà modulé par l'essence) et sa rareté. S'il pousse sur le
// territoire d'un joueur, une dernière ligne montre l'or que cet arbre lui coûte
// chaque tour. Purement informatif — aucune action depuis ce panneau.
//
// S'affiche soit quand l'arbre est sélectionné, soit en APERÇU quand un soldat
// sélectionné survole un arbre abattable (comme les aperçus de combat/fusion).
const TreePanel = ({ tree, owner, settings, onClose }) => {
    const affinity = treeAffinity(tree);
    // Entretien : prélevé seulement si l'arbre est sur le territoire d'un joueur
    // (un arbre neutre ne coûte rien à personne).
    const upkeep = owner ? (settings?.treeUpkeep ?? 0) : 0;
    return (
        <div className="soldier-panel">
            {onClose && (
                <button
                    type="button"
                    className="soldier-panel__close"
                    onClick={onClose}
                    aria-label="Fermer"
                    title="Fermer"
                >
                    <img src="/croix.png" alt="" draggable={false} />
                </button>
            )}
            <div
                className="soldier-panel__portrait"
                style={{ borderColor: owner?.color || '#4caf50' }}
            >
                <img src={treeSrc(tree)} alt={treeLabel(tree)} />
            </div>

            <div className="soldier-panel__specs">
                <div className="soldier-spec">
                    <span className="soldier-spec__label">Essence</span>
                    <span className="soldier-spec__value">{treeLabel(tree)}</span>
                </div>
                <div className="soldier-spec">
                    <span className="soldier-spec__label">Affinité</span>
                    <span className="soldier-spec__value">
                        {AFFINITY_SRC[affinity] ? (
                            <img
                                src={AFFINITY_SRC[affinity]}
                                alt={affinityLabel(affinity)}
                                title={affinityLabel(affinity)}
                                className="soldier-spec__affinity"
                            />
                        ) : (
                            affinityLabel(affinity)
                        )}
                    </span>
                </div>
                <div className="soldier-spec">
                    <span className="soldier-spec__label">Or à l'abattage</span>
                    <span className="soldier-spec__value">
                        +{treeReward(tree, settings?.treeReward ?? TREE_REWARD)}
                    </span>
                </div>
                <div className="soldier-spec">
                    <span className="soldier-spec__label">Rareté</span>
                    <span className="soldier-spec__value">{treeRarity(tree).label}</span>
                </div>
                {upkeep !== 0 && <UpkeepSpec cost={upkeep} owner={owner} settings={settings} />}
            </div>
        </div>
    );
};

export default TreePanel;
