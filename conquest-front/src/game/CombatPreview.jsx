import { ITEM_SRC } from '@conquest/shared-engine/data/items.js';
import { StatBar } from './SoldierPanel.jsx';
import { soldierSprite } from '@conquest/shared-engine/data/soldier.js';
import { combatResult, maxHp, maxAtk } from '@conquest/shared-engine/engine/rules.js';

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
                    <img src="/dead.png" alt="Éliminé" className="merge-card__skull" />
                )}
            </div>
            <div className="merge-card__stats">
                {before.atk != null && (
                    <StatBar
                        icon={<img src="/sword.png" alt="" className="soldier-stat__img" />}
                        label="Attaque"
                        value={before.atk}
                        max={maxAtk(before)}
                        kind="atk"
                        valueText={`${before.atk}`}
                    />
                )}
                <div className="merge-card__hp">
                    <StatBar
                        icon={
                            <span className="merge-card__hp-icon-wrap">
                                <img src="/heart.png" alt="" className="soldier-stat__img" />
                                {dmg > 0 && (
                                    <span className="merge-card__atk-note-value">−{dmg}</span>
                                )}
                            </span>
                        }
                        label="Points de vie"
                        value={after.hp}
                        max={maxHp(before)}
                        kind="hp"
                        valueText={`${before.hp} → ${after.hp}`}
                    />
                </div>
            </div>
        </div>
    );
};

// Issue du combat, résumée en un mot au-dessus des cartes : victoire/défaite
// du point de vue de l'attaquant, ou cas particuliers (aucune perte / double
// élimination) quand les PV encaissés ne suffisent pas à tuer l'un ou l'autre.
const OUTCOME = {
    win: { text: 'VICTOIRE', cls: 'win' },
    lose: { text: 'DÉFAITE', cls: 'lose' },
    draw: { text: 'ÉGALITÉ', cls: 'draw' },
    doubleKo: { text: 'DOUBLE ÉLIMINATION', cls: 'double-ko' },
};

const combatOutcome = (attackerDead, defenderDead) => {
    if (attackerDead && defenderDead) return OUTCOME.doubleKo;
    if (defenderDead) return OUTCOME.win;
    if (attackerDead) return OUTCOME.lose;
    return OUTCOME.draw;
};

// Aperçu de combat : « Attaquant ⚔️ Cible ». Chaque unité retire à l'autre des
// PV égaux à son attaque ; l'aperçu montre l'état résultant avant de valider.
const CombatPreview = ({ attacker, defender, attackerColor, defenderColor }) => {
    const res = combatResult(attacker, defender);
    const outcome = combatOutcome(res.attacker.dead, res.defender.dead);
    return (
        <div className="merge-preview merge-preview--combat">
            <span className={`merge-preview__outcome merge-preview__outcome--${outcome.cls}`}>
                {outcome.text}
            </span>
            <div className="merge-preview__row">
                <Card before={attacker} after={res.attacker} color={attackerColor} label="Attaquant" dmg={defender.atk} />
                <img src="/sword.png" alt="" className="merge-preview__op-img" />
                <Card before={defender} after={res.defender} color={defenderColor} label="Cible" dmg={attacker.atk} />
            </div>
        </div>
    );
};

export default CombatPreview;
