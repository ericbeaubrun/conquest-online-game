import { ITEMS } from '@shared/data/items.js';

// Boutique en bas de l'écran. Cliquer un item le sélectionne (bascule) :
// le plateau passe alors en mode placement pour le joueur actif. Les items
// trop chers pour l'or disponible sont grisés et non sélectionnables.
const Shop = ({ selectedItem, onSelect, activeColor, activeGold = 0, settings }) => (
    <div className="shop">
        {ITEMS.map((item) => {
            const active = selectedItem === item.id;
            // Prix configurable par partie (retombe sur le coût par défaut).
            const cost = settings?.itemCost?.[item.id] ?? item.cost;
            const affordable = activeGold >= cost;
            return (
                <button
                    key={item.id}
                    type="button"
                    className={`shop-item ${active ? 'shop-item--active' : ''} ${
                        affordable ? '' : 'shop-item--disabled'
                    }`}
                    style={active ? { borderColor: activeColor } : undefined}
                    onClick={() => affordable && onSelect(active ? null : item.id)}
                    disabled={!affordable}
                    title={`${item.name} — ${cost} or`}
                >
                    <img src={item.src} alt={item.name} className="shop-item__icon" />
                    <span className="shop-item__name">{item.name}</span>
                    <span className="shop-item__cost">
                        <img src="/coin.png" alt="or" className="coin-icon" />
                        {cost}
                    </span>
                </button>
            );
        })}
    </div>
);

export default Shop;
