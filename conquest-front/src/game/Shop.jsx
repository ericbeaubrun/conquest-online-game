import { useCallback, useEffect, useRef, useState } from 'react';
import { ITEMS, AFFINITY_ITEMS, isAffinityItem } from '@conquest/shared-engine/data/items.js';
import { BUILDING_STATS } from '@conquest/shared-engine/engine/rules.js';
import {
    upkeepFor,
    soldierSkin,
    purchasedSoldierStats,
    soldierCostForLevel,
    MAX_SOLDIER_PURCHASE_LEVEL,
} from '@conquest/shared-engine/data/soldier.js';
import { formatStatValue } from './board/constants.js';

// Boutique compacte, logée dans un TIROIR en bas de l'écran. Repliée par défaut
// (seul l'onglet « ▲ Boutique » dépasse) ; l'onglet la tire vers le haut. Elle
// s'ouvre aussi d'office en pose directe (une case vide de son territoire est
// sélectionnée) : cliquer un item le pose alors immédiatement sur cette case.
//
// Chaque carte affiche son coût par tour / revenu et son prix. Tous les items
// tiennent dans une SEULE rangée horizontale scrollable (plus de pagination) :
// d'abord le soldat de base, la maison et les tours, puis les soldats de
// niveau supérieur (achat direct, prix/stats doublés à chaque niveau, comme une
// fusion), enfin les affinités (feu / glace / foudre), qui ne se posent pas sur
// une case mais sur un soldat allié sans affinité. Les flèches ◀ ▶ font défiler
// la rangée (elles ne changent plus de page).
const SOLDIER_UPGRADE_LEVELS = Array.from(
    { length: MAX_SOLDIER_PURCHASE_LEVEL - 1 },
    (_, i) => i + 2
);
// `ITEMS` (donnée partagée) liste la maison/tours avant le soldat : on remet
// le soldat de niveau 1 en tête ici, sans réordonner la donnée partagée.
const BASE_ITEMS = [...ITEMS].sort((a, b) => (a.id === 'soldier' ? -1 : b.id === 'soldier' ? 1 : 0));
const SHOP_ITEMS = [
    ...BASE_ITEMS,
    ...SOLDIER_UPGRADE_LEVELS.map((level) => ({
        id: 'soldier',
        name: `Soldat Nv.${level}`,
        level,
    })),
    ...AFFINITY_ITEMS,
];

// Distance de défilement d'un clic sur une flèche (~2 cartes de large).
const SHOP_SCROLL_STEP = 220;

// Caractéristiques affichées pour un item donné : PV (et attaque pour le
// soldat et les tours) en tête de carte.
function specsFor(item, settings) {
    // Affinité : ni PV, ni attaque, ni entretien — seulement son icône et son
    // prix (les badges de stats sont alors omis de la carte).
    if (isAffinityItem(item.id)) {
        return {
            cost: settings?.itemCost?.[item.id] ?? item.cost,
            sprite: item.src,
        };
    }
    if (item.id === 'soldier') {
        const level = item.level ?? 1;
        const stats = purchasedSoldierStats(level, settings);
        return {
            cost: soldierCostForLevel(level, settings),
            sprite: soldierSkin(stats.level),
            upkeep: upkeepFor({ type: 'soldier', level: stats.level }, settings),
            hp: stats.hp,
            atk: stats.atk,
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
    selectedLevel = 1,
    onSelect,
    activeGold = 0,
    settings,
    open = false,
    placeMode = false,
    onToggle,
    onClose,
    canAct = true,
}) => {
    // Rangée scrollable + état des flèches (désactivées en début / fin de course).
    const shopRef = useRef(null);
    const [scroll, setScroll] = useState({ left: false, right: false });

    const updateScroll = useCallback(() => {
        const el = shopRef.current;
        if (!el) return;
        const max = el.scrollWidth - el.clientWidth;
        setScroll({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
    }, []);

    // Recalcule l'état des flèches quand la rangée change de taille (contenu,
    // redimensionnement de la fenêtre) — un ResizeObserver couvre tous les cas,
    // y compris la première mesure fiable une fois la mise en page faite.
    useEffect(() => {
        const el = shopRef.current;
        if (!el) return;
        updateScroll();
        const ro = new ResizeObserver(updateScroll);
        ro.observe(el);
        window.addEventListener('resize', updateScroll);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', updateScroll);
        };
    }, [updateScroll]);

    // À l'ouverture, la largeur du corps (déplié) ne devient mesurable qu'au
    // frame suivant : on re-mesure alors pour ne pas figer les flèches.
    useEffect(() => {
        if (!open) return;
        const id = requestAnimationFrame(updateScroll);
        return () => cancelAnimationFrame(id);
    }, [open, updateScroll]);

    const scrollByStep = (dir) =>
        shopRef.current?.scrollBy({ left: dir * SHOP_SCROLL_STEP, behavior: 'smooth' });

    return (
    <div className={`shop-drawer ${open ? 'shop-drawer--open' : ''}`}>
        {open && (
            <button
                type="button"
                className="shop-drawer__close"
                onClick={onClose ?? onToggle}
                aria-label="Fermer la boutique"
                title="Fermer la boutique"
            >
                <img src="/croix.png" alt="" draggable={false} />
            </button>
        )}
        {/* Le corps se déploie AU-DESSUS de l'onglet (rendu avant lui) : la
            boutique s'ancre en bas et grandit vers le haut. */}
        <div className="shop-drawer__body">
            {placeMode && (
                <div className="shop-drawer__hint">Pose directe — choisis un élément</div>
            )}
            <div className="shop-page">
                <button
                    type="button"
                    className="shop-page__arrow"
                    onClick={() => scrollByStep(-1)}
                    disabled={!scroll.left}
                    aria-label="Défiler vers la gauche"
                    title="Défiler vers la gauche"
                >
                    ◀
                </button>
                <div className="shop" ref={shopRef} onScroll={updateScroll}>
                {SHOP_ITEMS.map((item) => {
                    const level = item.level ?? 1;
                    const sp = specsFor(item, settings);
                    const active = selectedItem === item.id && selectedLevel === level;
                    const affordable = activeGold >= sp.cost;
                    const buyable = affordable && canAct;
                    const buy = () => buyable && onSelect(active ? null : item.id, level);
                    // Une affinité se pose sur un SOLDAT, pas sur une case : même
                    // en pose directe, elle demande de choisir sa cible.
                    const affinity = isAffinityItem(item.id);
                    const hint = !affordable
                        ? `${item.name} — or insuffisant`
                        : affinity
                            ? `${item.name} — sélectionner puis choisir un soldat sans affinité`
                            : placeMode
                                ? 'Poser sur la case'
                                : `${item.name} — sélectionner puis poser`;
                    return (
                        // Tout le container est cliquable pour acheter (plus accessible).
                        <div
                            key={`${item.id}-${level}`}
                            className={`shop-card ${active ? 'shop-card--active' : ''} ${
                                affordable ? '' : 'shop-card--poor'
                            } ${buyable ? '' : 'shop-card--locked'} ${
                                (placeMode && !affinity) || active ? 'shop-card--placemode' : ''
                            }`}
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
                            title={hint}
                        >
                            <img src={sp.sprite} alt={item.name} className="shop-card__icon" draggable={false} />

                            {affinity ? (
                                // Une affinité n'a ni PV/attaque ni entretien/revenu : les deux
                                // rangées habituelles resteraient vides. On comble cet espace
                                // par un rappel de sa règle (blocage du combat même élément),
                                // adapté au nom de l'affinité de la carte.
                                <p className="shop-card__affinity-note">
                                    Empêche les combats {item.name.toLowerCase()} vs {item.name.toLowerCase()}
                                </p>
                            ) : (
                                <>
                                    {/* PV et attaque (soldat, tours) sous l'image. */}
                                    <div className="shop-card__level shop-card__level--stats">
                                        {sp.atk != null && (
                                            <span
                                                className="soldier-stat-badge soldier-stat-badge--atk soldier-stat-badge--sm"
                                                title="Attaque"
                                            >
                                                {formatStatValue(sp.atk)}
                                            </span>
                                        )}
                                        {sp.hp != null && (
                                            <span
                                                className="soldier-stat-badge soldier-stat-badge--hp soldier-stat-badge--sm"
                                                title="Points de vie"
                                            >
                                                {formatStatValue(sp.hp)}
                                            </span>
                                        )}
                                    </div>

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
                                </>
                            )}

                            {/* Prix : ancré en bas de la carte, donc aligné entre toutes. */}
                            <div className="shop-card__price">
                                <img src="/coin.png" alt="or" className="coin-icon" draggable={false} />
                                {sp.cost}
                            </div>
                        </div>
                    );
                })}
                </div>
                <button
                    type="button"
                    className="shop-page__arrow"
                    onClick={() => scrollByStep(1)}
                    disabled={!scroll.right}
                    aria-label="Défiler vers la droite"
                    title="Défiler vers la droite"
                >
                    ▶
                </button>
            </div>
        </div>

        {/* Onglet toujours visible en bas : tire la boutique vers le haut / la referme. */}
        <button
            type="button"
            className="shop-drawer__handle"
            onClick={() => (open ? (onClose ?? onToggle)() : onToggle())}
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
};

export default Shop;
