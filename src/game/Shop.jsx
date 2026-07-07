import { ITEMS } from './items.js';

// Boutique en bas de l'écran. Cliquer un item le sélectionne (bascule) :
// le plateau passe alors en mode placement pour le joueur actif.
const Shop = ({ selectedItem, onSelect, activeColor }) => (
    <div className="shop">
        {ITEMS.map((item) => {
            const active = selectedItem === item.id;
            return (
                <button
                    key={item.id}
                    type="button"
                    className={`shop-item ${active ? 'shop-item--active' : ''}`}
                    style={active ? { borderColor: activeColor } : undefined}
                    onClick={() => onSelect(active ? null : item.id)}
                    title={item.name}
                >
                    <img src={item.src} alt={item.name} className="shop-item__icon" />
                    <span className="shop-item__name">{item.name}</span>
                </button>
            );
        })}
    </div>
);

export default Shop;
