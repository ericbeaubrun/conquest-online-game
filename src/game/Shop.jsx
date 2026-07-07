import { ITEMS } from './items.js';

// Boutique en bas de l'écran. Cliquer un item le sélectionne (bascule) :
// le plateau passe alors en mode placement pour le joueur actif. Les items
// trop chers pour l'or disponible sont grisés et non sélectionnables.
const Shop = ({ selectedItem, onSelect, activeColor, activeGold = 0 }) => (
    <div className="shop">
        {ITEMS.map((item) => {
            const active = selectedItem === item.id;
            const affordable = activeGold >= item.cost;
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
                    title={`${item.name} — ${item.cost} or`}
                >
                    <img src={item.src} alt={item.name} className="shop-item__icon" />
                    <span className="shop-item__name">{item.name}</span>
                    <span className="shop-item__cost">
                        <span role="img" aria-label="or">💰</span>
                        {item.cost}
                    </span>
                </button>
            );
        })}
    </div>
);

export default Shop;
