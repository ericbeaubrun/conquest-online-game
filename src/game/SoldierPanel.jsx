import { affinityLabel, bonusLabel, behaviorLabel, soldierSkin } from './soldier.js';
import { SOLDIER_HP_MAX, SOLDIER_ATK_MAX } from './engine/rules.js';

// Petite jauge « valeur / max » avec barre de remplissage. Exportée pour être
// réutilisée par le panneau des bâtiments (même style pixel).
export const StatBar = ({ icon, label, value, max, kind }) => (
    <div className={`soldier-stat soldier-stat--${kind}`}>
        <span className="soldier-stat__icon" role="img" aria-label={label}>
            {icon}
        </span>
        <div className="soldier-stat__track">
            <div
                className="soldier-stat__fill"
                style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
            />
        </div>
        <span className="soldier-stat__value">
            {value}/{max}
        </span>
    </div>
);

// Menu des caractéristiques du soldat sélectionné. Prend la place de la
// boutique en bas de l'écran tant qu'un soldat est sélectionné.
const SoldierPanel = ({ soldier, color }) => (
    <div className="soldier-panel">
        <div className="soldier-panel__portrait" style={{ borderColor: color }}>
            <img src={soldierSkin(soldier.level || 1)} alt="Soldat" />
        </div>

        <div className="soldier-panel__stats">
            <StatBar icon="❤️" label="Points de vie" value={soldier.hp} max={SOLDIER_HP_MAX} kind="hp" />
            <StatBar icon="⚔️" label="Attaque" value={soldier.atk} max={SOLDIER_ATK_MAX} kind="atk" />
        </div>

        <div className="soldier-panel__specs">
            <div className="soldier-spec">
                <span className="soldier-spec__label">Affinité</span>
                <span className="soldier-spec__value">{affinityLabel(soldier.affinity)}</span>
            </div>
            <div className="soldier-spec">
                <span className="soldier-spec__label">Bonus</span>
                <span className="soldier-spec__value">{bonusLabel(soldier.bonus)}</span>
            </div>
            <div className="soldier-spec">
                <span className="soldier-spec__label">Comportement</span>
                <span className="soldier-spec__value">{behaviorLabel(soldier.behavior)}</span>
            </div>
        </div>
    </div>
);

export default SoldierPanel;
