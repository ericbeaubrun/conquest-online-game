import { StatBar } from './SoldierPanel.jsx';
import { soldierSkin } from '@conquest/shared-engine/data/soldier.js';
import { SOLDIER_HP_MAX, SOLDIER_ATK_MAX } from '@conquest/shared-engine/engine/rules.js';

// Carte compacte d'un soldat (portrait selon le niveau + jauges PV/ATK).
const Card = ({ soldier, color, label }) => (
    <div className="merge-card">
        <span className="merge-card__label">{label}</span>
        <div className="merge-card__portrait" style={{ borderColor: color }}>
            <img src={soldierSkin(soldier.level || 1)} alt="Soldat" />
        </div>
        <div className="merge-card__stats">
            <StatBar icon="❤️" label="Points de vie" value={soldier.hp} max={SOLDIER_HP_MAX} kind="hp" />
            <StatBar icon="⚔️" label="Attaque" value={soldier.atk} max={SOLDIER_ATK_MAX} kind="atk" />
        </div>
    </div>
);

// Aperçu de fusion : montre « soldat sélectionné + soldat survolé = résultat ».
// Apparaît quand un soldat est sélectionné et que l'on survole un allié
// fusionnable. Purement informatif (aucune action).
const MergePreview = ({ from, to, result, color }) => (
    <div className="merge-preview">
        <Card soldier={from} color={color} label="Sélectionné" />
        <span className="merge-preview__op">+</span>
        <Card soldier={to} color={color} label="Cible" />
        <span className="merge-preview__op">=</span>
        <Card soldier={result} color={color} label="Fusion" />
    </div>
);

export default MergePreview;
