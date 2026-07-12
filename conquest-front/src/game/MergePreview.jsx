import { StatBar } from './SoldierPanel.jsx';
import { soldierSkin } from '@conquest/shared-engine/data/soldier.js';
import { SOLDIER_HP_MAX, SOLDIER_ATK_MAX } from '@conquest/shared-engine/engine/rules.js';

// Carte compacte d'un soldat (portrait selon le niveau + jauges ATK/PV).
// `simple` : attaque au-dessus des PV, valeurs brutes sans /max (soldat
// sélectionné et cible). Sans `simple` : ordre et affichage habituels
// (résultat de la fusion).
const Card = ({ soldier, color, label, simple }) => (
    <div className="merge-card">
        <span className="merge-card__label">{label}</span>
        <div className="merge-card__portrait" style={{ borderColor: color }}>
            <img src={soldierSkin(soldier.level || 1)} alt="Soldat" />
        </div>
        <div className="merge-card__stats">
            {simple ? (
                <>
                    <StatBar
                        icon={<img src="/sword.png" alt="" className="soldier-stat__img" />}
                        label="Attaque"
                        value={soldier.atk}
                        max={SOLDIER_ATK_MAX}
                        kind="atk"
                        valueText={`${soldier.atk}`}
                    />
                    <StatBar
                        icon={<img src="/heart.png" alt="" className="soldier-stat__img" />}
                        label="Points de vie"
                        value={soldier.hp}
                        max={SOLDIER_HP_MAX}
                        kind="hp"
                        valueText={`${soldier.hp}`}
                    />
                </>
            ) : (
                <>
                    <StatBar
                        icon={<img src="/sword.png" alt="" className="soldier-stat__img" />}
                        label="Attaque"
                        value={soldier.atk}
                        max={SOLDIER_ATK_MAX}
                        kind="atk"
                    />
                    <StatBar
                        icon={<img src="/heart.png" alt="" className="soldier-stat__img" />}
                        label="Points de vie"
                        value={soldier.hp}
                        max={SOLDIER_HP_MAX}
                        kind="hp"
                    />
                </>
            )}
        </div>
    </div>
);

// Aperçu de fusion : montre « soldat sélectionné + soldat survolé = résultat ».
// Apparaît quand un soldat est sélectionné et que l'on survole un allié
// fusionnable. Purement informatif (aucune action).
const MergePreview = ({ from, to, result, color }) => (
    <div className="merge-preview">
        <Card soldier={from} color={color} label="Sélectionné" simple />
        <span className="merge-preview__op">+</span>
        <Card soldier={to} color={color} label="Cible" simple />
        <span className="merge-preview__op">=</span>
        <Card soldier={result} color={color} label="Fusion" />
    </div>
);

export default MergePreview;
