import { TREE_REWARD, TREE_INCOME_PENALTY } from './engine/rules.js';

// Panneau d'un arbre sélectionné : rappelle l'or gagné en l'abattant et, si
// l'arbre se trouve sur le territoire d'un joueur, l'or qu'il lui coûte chaque
// tour (et lequel). Purement informatif — aucune action depuis ce panneau.
const TreePanel = ({ owner }) => (
    <div className="soldier-panel">
        <div
            className="soldier-panel__portrait"
            style={{ borderColor: owner?.color || '#4caf50' }}
        >
            <img src="/forestTree.png" alt="Arbre" />
        </div>

        <div className="soldier-panel__specs">
            <div className="soldier-spec">
                <span className="soldier-spec__label">Or à l'abattage</span>
                <span className="soldier-spec__value">+{TREE_REWARD}</span>
            </div>
            <div className="soldier-spec">
                <span className="soldier-spec__label">Coût par tour</span>
                {owner ? (
                    <span className="soldier-spec__value soldier-spec__value--cost">
                        −{TREE_INCOME_PENALTY} pour{' '}
                        <span style={{ color: owner.color }}>{owner.name}</span>
                    </span>
                ) : (
                    <span className="soldier-spec__value">Aucun (case neutre)</span>
                )}
            </div>
        </div>
    </div>
);

export default TreePanel;
