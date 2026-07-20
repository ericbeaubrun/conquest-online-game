import {
    CHEST_SRC,
    lootSrc,
    lootLabel,
    lootRarity,
    lootGold,
    lootHp,
    lootAtk,
    lootAffinity,
    lootUnit,
} from '@conquest/shared-engine/data/chests.js';
import { affinityLabel } from '@conquest/shared-engine/data/soldier.js';
import { unitKindById } from '@conquest/shared-engine/data/units.js';
import { AFFINITY_SRC } from './board/constants.js';

// Effet d'un butin, en une ligne lisible : or versé, statistique gagnée,
// affinité offerte ou renfort rallié. Un seul de ces champs est renseigné.
const lootEffect = (loot) => {
    const gold = lootGold(loot);
    if (gold > 0) return `+${gold} or`;
    const hp = lootHp(loot);
    if (hp > 0) return `+${hp} PV`;
    const atk = lootAtk(loot);
    if (atk > 0) return `+${atk} ATK`;
    const affinity = lootAffinity(loot);
    if (affinity) return `Affinité ${affinityLabel(affinity)}`;
    const unit = unitKindById(lootUnit(loot));
    return unit ? `${unit.label} allié (${unit.atk} ATK / ${unit.hp} PV)` : '—';
};

// Panneau d'un coffre ou de son butin. Un coffre FERMÉ ne révèle rien : son
// contenu n'est tiré qu'à l'ouverture. Un butin posé montre ce qu'il donnera au
// soldat qui viendra le ramasser, et sa rareté. Purement informatif.
//
// S'affiche soit quand la case est sélectionnée, soit en APERÇU quand un soldat
// sélectionné survole un coffre ouvrable / un butin ramassable (comme les
// aperçus de combat, de fusion et d'abattage).
const ChestPanel = ({ loot, onClose }) => {
    const affinity = loot ? lootAffinity(loot) : null;
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
            <div className="soldier-panel__portrait" style={{ borderColor: '#d9a441' }}>
                <img
                    src={loot ? lootSrc(loot) : CHEST_SRC}
                    alt={loot ? lootLabel(loot) : 'Coffre'}
                />
            </div>

            <div className="soldier-panel__specs">
                <div className="soldier-spec">
                    <span className="soldier-spec__label">Objet</span>
                    <span className="soldier-spec__value">
                        {loot ? lootLabel(loot) : 'Coffre fermé'}
                    </span>
                </div>
                {loot ? (
                    <>
                        <div className="soldier-spec">
                            <span className="soldier-spec__label">Effet</span>
                            <span className="soldier-spec__value">
                                {AFFINITY_SRC[affinity] ? (
                                    <img
                                        src={AFFINITY_SRC[affinity]}
                                        alt={affinityLabel(affinity)}
                                        title={affinityLabel(affinity)}
                                        className="soldier-spec__affinity"
                                    />
                                ) : (
                                    lootEffect(loot)
                                )}
                            </span>
                        </div>
                        <div className="soldier-spec">
                            <span className="soldier-spec__label">Rareté</span>
                            <span className="soldier-spec__value">{lootRarity(loot).label}</span>
                        </div>
                        <div className="soldier-spec">
                            <span className="soldier-spec__label">Ramassage</span>
                            <span className="soldier-spec__value">Déplacez un soldat dessus</span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="soldier-spec">
                            <span className="soldier-spec__label">Contenu</span>
                            <span className="soldier-spec__value">Inconnu</span>
                        </div>
                        <div className="soldier-spec">
                            <span className="soldier-spec__label">Ouverture</span>
                            <span className="soldier-spec__value">Attaquez-le avec un soldat</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ChestPanel;
