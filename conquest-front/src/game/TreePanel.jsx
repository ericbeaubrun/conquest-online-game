import { TREE_REWARD } from '@shared/engine/rules.js';
import UpkeepSpec from './UpkeepSpec.jsx';

// Panneau d'un arbre sélectionné : rappelle l'or gagné en l'abattant et son
// entretien par tour (nul pour un arbre). Purement informatif — aucune action
// depuis ce panneau.
const TreePanel = ({ owner, settings }) => (
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
                <span className="soldier-spec__value">+{settings?.treeReward ?? TREE_REWARD}</span>
            </div>
            <UpkeepSpec unit={{ type: 'tree' }} owner={owner} settings={settings} />
        </div>
    </div>
);

export default TreePanel;
