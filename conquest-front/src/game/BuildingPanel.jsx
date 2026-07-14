import { ITEM_SRC } from '@conquest/shared-engine/data/items.js';
import { StatBar } from './SoldierPanel.jsx';
import { maxHp, maxAtk } from '@conquest/shared-engine/engine/rules.js';
import { DEV_CONFIG } from '../config/devConfig.js';
import UpkeepSpec from './UpkeepSpec.jsx';

// Libellé et image par type de bâtiment. La base n'est pas un item de boutique :
// elle a sa propre image et n'apparaît pas dans `ITEM_SRC`.
const LABEL = {
    base: 'Base',
    house: 'Maison',
    attackTower: "Tour d'attaque",
    defenseTower: 'Tour de défense',
};
const SRC = { base: '/base.png', ...ITEM_SRC };

// Menu des caractéristiques d'un bâtiment (base, maison, tour) sélectionné.
// Prend la place de la boutique, comme le panneau du soldat : image + barre de
// vie. Purement informatif — aucune action possible depuis ce panneau.
const BuildingPanel = ({ building, color, owner, settings }) => (
    <div className="soldier-panel">
        <div className="soldier-panel__portrait" style={{ borderColor: color }}>
            <img src={SRC[building.type]} alt={LABEL[building.type]} />
        </div>

        <div className="soldier-panel__stats">
            <StatBar
                icon={<img src="/heart.png" alt="" className="soldier-stat__img" />}
                label="Points de vie"
                value={building.hp}
                max={maxHp(building)}
                kind="hp"
                hideValue={!DEV_CONFIG.showPanelStatValues}
            />
            {building.atk != null && (
                <StatBar
                    icon="⚔️"
                    label="Attaque"
                    value={building.atk}
                    max={maxAtk(building)}
                    kind="atk"
                    hideValue={!DEV_CONFIG.showPanelStatValues}
                />
            )}
        </div>

        <div className="soldier-panel__specs">
            <div className="soldier-spec">
                <span className="soldier-spec__label">Type</span>
                <span className="soldier-spec__value">{LABEL[building.type]}</span>
            </div>
            <UpkeepSpec unit={building} owner={owner} settings={settings} />
        </div>
    </div>
);

export default BuildingPanel;
