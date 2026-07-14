import { ITEMS } from '@conquest/shared-engine/data/items.js';
import { BUILDING_STATS } from '@conquest/shared-engine/engine/rules.js';
import {
    upkeepFor,
    soldierSkin,
    purchasedSoldierStats,
    soldierCostForLevel,
    MAX_SOLDIER_PURCHASE_LEVEL,
} from '@conquest/shared-engine/data/soldier.js';

// Boutique compacte, logée dans un TIROIR en bas de l'écran. Repliée par défaut
// (seul l'onglet « ▲ Boutique » dépasse) ; l'onglet la tire vers le haut. Elle
// s'ouvre aussi d'office en pose directe (une case vide de son territoire est
// sélectionnée) : cliquer un item le pose alors immédiatement sur cette case.
//
// Chaque carte affiche son coût par tour / revenu et son prix — PV et attaque
// restent à découvrir une fois l'unité posée. Le soldat se décline en niveaux :
// un sélecteur permet d'acheter directement un soldat de niveau supérieur
// (prix et stats doublés à chaque niveau, comme une fusion).

// Caractéristiques affichées pour un item donné (dépend du niveau pour le
// soldat). Le soldat garde son sélecteur de niveau ; les autres éléments
// (maison, tours) affichent leurs PV (et attaque pour les tours) à la même
// place, en tête de carte.
function specsFor(item, soldierLevel, settings) {
    if (item.id === 'soldier') {
        const stats = purchasedSoldierStats(soldierLevel, settings);
        return {
            cost: soldierCostForLevel(soldierLevel, settings),
            sprite: soldierSkin(stats.level),
            upkeep: upkeepFor({ type: 'soldier', level: stats.level }, settings),
        };
    }
    if (item.id === 'house') {
        // Entretien négatif = revenu : on l'affiche en gain « +N/tour ».
        const income = -upkeepFor({ type: 'house' }, settings);
        return {
            cost: settings?.itemCost?.house ?? item.cost,
            sprite: item.src,
            income,
            hp: BUILDING_STATS.house.hp,
        };
    }
    const s = BUILDING_STATS[item.id] || {};
    return {
        cost: settings?.itemCost?.[item.id] ?? item.cost,
        sprite: item.src,
        upkeep: upkeepFor({ type: item.id }, settings),
        hp: s.hp ?? 0,
        atk: s.atk,
    };
}

const Shop = ({
    selectedItem,
    onSelect,
    activeColor,
    activeGold = 0,
    settings,
    soldierLevel = 1,
    onSoldierLevel,
    open = false,
    placeMode = false,
    onToggle,
    canAct = true,
}) => (
    <div className={`shop-drawer ${open ? 'shop-drawer--open' : ''}`}>
        {/* Le corps se déploie AU-DESSUS de l'onglet (rendu avant lui) : la
            boutique s'ancre en bas et grandit vers le haut. */}
        <div className="shop-drawer__body">
            {placeMode && (
                <div className="shop-drawer__hint">Pose directe — choisis un élément</div>
            )}
            <div className="shop">
                {ITEMS.map((item) => {
                    const isSoldier = item.id === 'soldier';
                    const sp = specsFor(item, soldierLevel, settings);
                    const active = selectedItem === item.id;
                    const affordable = activeGold >= sp.cost;
                    const buyable = affordable && canAct;
                    const buy = () => buyable && onSelect(active ? null : item.id);
                    return (
                        // Tout le container est cliquable pour acheter (plus accessible).
                        <div
                            key={item.id}
                            className={`shop-card ${active ? 'shop-card--active' : ''} ${
                                affordable ? '' : 'shop-card--poor'
                            } ${buyable ? '' : 'shop-card--locked'}`}
                            style={active ? { borderColor: activeColor } : undefined}
                            role="button"
                            tabIndex={buyable ? 0 : -1}
                            aria-disabled={!buyable}
                            onClick={buy}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    buy();
                                }
                            }}
                            title={
                                affordable
                                    ? placeMode
                                        ? 'Poser sur la case'
                                        : `${item.name} — sélectionner puis poser`
                                    : `${item.name} — or insuffisant`
                            }
                        >
                            {/* Sélecteur de niveau (soldat), tout en haut de la carte. Les
                                flèches ne doivent pas déclencher l'achat du container : on
                                stoppe la propagation. */}
                            {isSoldier ? (
                                <div className="shop-card__level" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        type="button"
                                        className="shop-card__step"
                                        onClick={() => onSoldierLevel?.(Math.max(1, soldierLevel - 1))}
                                        disabled={soldierLevel <= 1}
                                        aria-label="Niveau inférieur"
                                    >
                                        ◀
                                    </button>
                                    <span className="shop-card__level-label">
                                        {soldierLevel}x
                                        <img
                                            src="/etoilePleine.png"
                                            alt="niveau"
                                            className="shop-card__level-star shop-card__level-star--soldier"
                                            draggable={false}
                                        />
                                    </span>
                                    <button
                                        type="button"
                                        className="shop-card__step"
                                        onClick={() =>
                                            onSoldierLevel?.(
                                                Math.min(MAX_SOLDIER_PURCHASE_LEVEL, soldierLevel + 1)
                                            )
                                        }
                                        disabled={soldierLevel >= MAX_SOLDIER_PURCHASE_LEVEL}
                                        aria-label="Niveau supérieur"
                                    >
                                        ▶
                                    </button>
                                </div>
                            ) : (
                                // Même emplacement que le sélecteur de niveau : PV (maison,
                                // tours), précédés de l'attaque pour les tours.
                                <div className="shop-card__level">
                                    {sp.atk != null && (
                                        <span className="shop-card__level-label" title="Attaque">
                                            {sp.atk}
                                            <img src="/sword.png" alt="attaque" className="shop-card__level-star" draggable={false} />
                                        </span>
                                    )}
                                    <span className="shop-card__level-label shop-card__level-label--hp" title="Points de vie">
                                        {sp.hp}
                                        <img src="/coeurPlein.png" alt="points de vie" className="shop-card__level-star" draggable={false} />
                                    </span>
                                </div>
                            )}

                            <img src={sp.sprite} alt={item.name} className="shop-card__icon" draggable={false} />

                            {/* Ligne « par tour » DÉDIÉE (hauteur réservée même vide) : coût
                                d'entretien ou revenu, toujours à la même hauteur d'une carte
                                à l'autre. */}
                            <div className="shop-card__perturn">
                                {sp.upkeep ? (
                                    <span className="shop-stat shop-stat--upkeep" title="Entretien par tour">
                                        <img src="/coin.png" alt="" className="shop-stat__icon" draggable={false} />
                                        −{sp.upkeep}/tour
                                    </span>
                                ) : sp.income ? (
                                    <span className="shop-stat shop-stat--income" title="Revenu par tour">
                                        <img src="/coin.png" alt="" className="shop-stat__icon" draggable={false} />
                                        +{sp.income}/tour
                                    </span>
                                ) : null}
                            </div>

                            {/* Prix : ancré en bas de la carte, donc aligné entre toutes. */}
                            <div className="shop-card__price">
                                <img src="/coin.png" alt="or" className="coin-icon" draggable={false} />
                                {sp.cost}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Onglet toujours visible en bas : tire la boutique vers le haut / la referme. */}
        <button
            type="button"
            className="shop-drawer__handle"
            onClick={onToggle}
            aria-expanded={open}
            title={open ? 'Fermer la boutique' : 'Ouvrir la boutique'}
        >
            <span className="shop-drawer__arrow">{open ? '▼' : '▲'}</span>
            <span className="shop-drawer__label">Boutique</span>
            <span className="shop-drawer__gold">
                <img src="/coin.png" alt="or" className="coin-icon" draggable={false} />
                {activeGold}
            </span>
        </button>
    </div>
);

export default Shop;
