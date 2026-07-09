import { ITEM_SRC } from './items.js';
import { StatBar } from './SoldierPanel.jsx';
import { soldierSprite } from './soldier.js';
import { combatResult, maxHp, maxAtk } from './engine/rules.js';

// Image d'une unité (soldat ou bâtiment). La base n'est pas un item de boutique.
// Pour un soldat on prend le sprite complet (skin dédié ou visuel de son bonus),
// comme dans le panneau du soldat.
const UNIT_SRC = { base: '/base.png', ...ITEM_SRC };
const unitSrc = (unit) => (unit.type === 'soldier' ? soldierSprite(unit) : UNIT_SRC[unit.type]);

// Carte d'une unité au combat : PV APRÈS échange (barre réduite), dégâts subis
// (−X) et tête de mort si l'unité tombe à 0. Gère soldats comme tours.
const Card = ({ before, after, color, label, dmg }) => {
    return (
        <div className={`merge-card ${after.dead ? 'merge-card--dead' : ''}`}>
            <span className="merge-card__label">{label}</span>
            <div className="merge-card__portrait" style={{ borderColor: color }}>
                <img src={unitSrc(before)} alt={label} />
                {before.type === 'soldier' && (
                    <span className="merge-card__level">LVL {before.level || 1}</span>
                )}
                {after.dead && (
                    <span className="merge-card__skull" role="img" aria-label="Éliminé">☠️</span>
                )}
            </div>
            <div className="merge-card__stats">
                <div className="merge-card__hp">
                    <StatBar icon="❤️" label="Points de vie" value={after.hp} max={maxHp(before)} kind="hp" />
                    {dmg > 0 && <span className="merge-card__dmg">−{dmg}</span>}
                </div>
                {before.atk != null && (
                    <StatBar icon="⚔️" label="Attaque" value={before.atk} max={maxAtk(before)} kind="atk" />
                )}
            </div>
        </div>
    );
};

// Aperçu de combat : « Attaquant ⚔️ Cible ». Chaque unité retire à l'autre des
// PV égaux à son attaque ; l'aperçu montre l'état résultant avant de valider.
const CombatPreview = ({ attacker, defender, attackerColor, defenderColor }) => {
    const res = combatResult(attacker, defender);
    return (
        <div className="merge-preview merge-preview--combat">
            <Card before={attacker} after={res.attacker} color={attackerColor} label="Attaquant" dmg={defender.atk} />
            <span className="merge-preview__op">⚔️</span>
            <Card before={defender} after={res.defender} color={defenderColor} label="Cible" dmg={attacker.atk} />
        </div>
    );
};

export default CombatPreview;
