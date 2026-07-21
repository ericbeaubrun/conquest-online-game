import { ITEM_SRC } from '@conquest/shared-engine/data/items.js';
import { AtkValue, HpValue } from './StatDisplays.jsx';
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
        <div className="soldier-panel__body">
            {/* Même gabarit que le panneau soldat : image puis bandeau de stats
                dessous, titre et caractéristiques à droite. */}
            <div className="soldier-panel__portrait-col">
                <div className="soldier-panel__portrait" style={{ borderColor: color }}>
                    <img src={SRC[building.type]} alt={LABEL[building.type]} />
                </div>
                <div className="soldier-panel__stats">
                    {building.atk != null && <AtkValue atk={building.atk} uncapped/>}
                    <HpValue hp={building.hp} uncapped/>
                </div>
            </div>

            <div className="soldier-panel__main">
                <div className="soldier-panel__head">
                    <span className="soldier-panel__atk-rank">{LABEL[building.type]}</span>
                </div>
                <div className="soldier-panel__specs">
                    <UpkeepSpec unit={building} owner={owner} settings={settings} label="Entretien" />
                </div>
            </div>
        </div>
    </div>
);

export default BuildingPanel;
