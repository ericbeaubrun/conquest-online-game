import { AtkValue, HpValue } from './StatDisplays.jsx';
import { soldierSprite } from '@conquest/shared-engine/data/soldier.js';
import { DEV_CONFIG } from '../config/devConfig.js';

// Carte compacte d'un soldat : portrait selon le niveau + pastilles ATK / PV.
const Card = ({ soldier, color, label }) => (
    <div className="merge-card">
        <span className="merge-card__label">{label}</span>
        {DEV_CONFIG.showPreviewRankLabel && (
            <div className="merge-card__level-stars">
                {Array.from({ length: 5 }, (_, i) => (
                    <img
                        key={i}
                        src={i < (soldier.level || 1) ? '/etoilePleine.png' : '/etoileVide.png'}
                        alt=""
                        className="merge-card__level-star"
                    />
                ))}
            </div>
        )}
        <div className="merge-card__portrait" style={{ borderColor: color }}>
            <img src={soldierSprite(soldier)} alt="Soldat" />
            {DEV_CONFIG.showPreviewLevel && (
                <span className="merge-card__level">LVL {soldier.level || 1}</span>
            )}
        </div>
        <div className="merge-card__stats">
            <AtkValue atk={soldier.atk} />
            <HpValue hp={soldier.hp} />
        </div>
    </div>
);

// Aperçu de fusion : montre « soldat sélectionné + soldat survolé = résultat ».
// Apparaît quand un soldat est sélectionné et que l'on survole un allié
// fusionnable. Purement informatif (aucune action).
const MergePreview = ({ from, to, result, color }) => (
    <div className="merge-preview merge-preview--fusion">
        <span className="merge-preview__outcome merge-preview__outcome--fusion">
            FUSION
        </span>
        <div className="merge-preview__row">
            <Card soldier={from} color={color} label="Sélectionné" />
            <span className="merge-preview__op">+</span>
            <Card soldier={to} color={color} label="Cible" />
            <span className="merge-preview__op">=</span>
            <Card soldier={result} color={color} label="Fusion" />
        </div>
    </div>
);

export default MergePreview;
