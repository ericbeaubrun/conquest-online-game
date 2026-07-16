import { ITEM_SRC } from '@conquest/shared-engine/data/items.js';
import { AtkStars, HpHearts } from './StatDisplays.jsx';
import { maxHp, maxAtk } from '@conquest/shared-engine/engine/rules.js';
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
const BuildingPanel = ({ building, color, owner, settings, onClose }) => (
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
        <div className="soldier-panel__portrait" style={{ borderColor: color }}>
            <img src={SRC[building.type]} alt={LABEL[building.type]} />
        </div>

        <div className="soldier-panel__stats">
            {building.atk != null && (
                <AtkStars atk={building.atk} max={maxAtk(building)} showValue uncapped/>
            )}
            <HpHearts hp={building.hp} max={maxHp(building)} showValue uncapped/>
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
