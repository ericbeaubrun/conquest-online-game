import {ITEM_SRC} from '@conquest/shared-engine/data/items.js';
import {AtkValue, HpValue} from './StatDisplays.jsx';
import {soldierSprite} from '@conquest/shared-engine/data/soldier.js';
import {combatResult, isTower} from '@conquest/shared-engine/engine/rules.js';
import {DEV_CONFIG} from '../config/devConfig.js';

// Image d'une unité (soldat ou bâtiment). La base n'est pas un item de boutique.
// Pour un soldat on prend le sprite complet (skin dédié ou visuel de son bonus),
// comme dans le panneau du soldat.
const UNIT_SRC = {base: '/base.png', ...ITEM_SRC};
const unitSrc = (unit) => (unit.type === 'soldier' ? soldierSprite(unit) : UNIT_SRC[unit.type]);

// Carte d'une unité au combat : PV APRÈS échange (barre réduite), dégâts subis
// (−X) et tête de mort si l'unité tombe à 0. Gère soldats comme tours.
const Card = ({before, after, color, label, dmg}) => {
    return (
        <div className={`merge-card ${after.dead ? 'merge-card--dead' : ''}`}>
            <span className="merge-card__label">{label}</span>
            <div className="merge-card__portrait" style={{borderColor: color}}>
                <img src={unitSrc(before)} alt={label}/>
                {before.type === 'soldier' && DEV_CONFIG.showPreviewLevel && (
                    <span className="merge-card__level">LVL {before.level || 1}</span>
                )}
                {after.dead && (
                    <img src="/dead.png" alt="Éliminé" className="merge-card__skull"/>
                )}
            </div>
            <div className="merge-card__stats">
                {before.atk != null && <AtkValue atk={before.atk} uncapped/>}
                <div className="merge-card__hp">
                    {DEV_CONFIG.showFightDamageBadge && dmg > 0 && (
                        <span className="merge-card__atk-note-value">−{dmg}</span>
                    )}
                    <HpValue hp={after.hp} beforeHp={before.hp} wide uncapped/>
                </div>
            </div>
        </div>
    );
};

// Issue du combat, résumée en un mot au-dessus des cartes : victoire/défaite
// du point de vue de l'attaquant, ou cas particuliers (aucune perte / double
// élimination) quand les PV encaissés ne suffisent pas à tuer l'un ou l'autre.
const OUTCOME = {
    win: {text: 'VICTOIRE', cls: 'win'},
    lose: {text: 'DÉFAITE', cls: 'lose'},
    draw: {text: 'ÉGALITÉ', cls: 'draw'},
    doubleKo: {text: 'DOUBLE ÉLIMINATION', cls: 'double-ko'},
};

const combatOutcome = (attackerDead, defenderDead) => {
    if (attackerDead && defenderDead) return OUTCOME.doubleKo;
    if (defenderDead) return OUTCOME.win;
    if (attackerDead) return OUTCOME.lose;
    return OUTCOME.draw;
};

// Aperçu de combat : « Attaquant ⚔️ Cible ». Chaque unité retire à l'autre des
// PV égaux à son attaque ; l'aperçu montre l'état résultant avant de valider.
const CombatPreview = ({attacker, defender, attackerColor, defenderColor}) => {
    const res = combatResult(attacker, defender);
    const outcome = combatOutcome(res.attacker.dead, res.defender.dead);
    // Dégâts réellement subis par chaque camp : nuls quand un viking encaisse une
    // tour (bonus « Viking »), sinon l'attaque adverse (cohérent avec combatResult).
    const attackerDmg = attacker.bonus === 'viking' && isTower(defender) ? 0 : defender.atk;
    const defenderDmg = defender.bonus === 'viking' && isTower(attacker) ? 0 : attacker.atk;
    return (
        <div className={`merge-preview merge-preview--combat merge-preview--${outcome.cls}`}>
            <span className={`merge-preview__outcome merge-preview__outcome--${outcome.cls}`}>
                {outcome.text}
            </span>
            <div className="merge-preview__row">
                <Card before={attacker} after={res.attacker} color={attackerColor} label="Attaquant"
                      dmg={attackerDmg}/>
                <span className="merge-preview__vs">VS</span>
                <Card before={defender} after={res.defender} color={defenderColor} label="Cible" dmg={defenderDmg}/>
            </div>
        </div>
    );
};

export default CombatPreview;
