import { useState } from 'react';
import {
    affinityLabel,
    behaviorLabel,
    soldierSprite,
    bonusOffersForLevel,
    challengeText,
    isBonusUnlocked,
    canBuyBonus,
} from './soldier.js';
import { SOLDIER_HP_MAX, SOLDIER_ATK_MAX } from './engine/rules.js';

// Petite jauge « valeur / max » avec barre de remplissage. Exportée pour être
// réutilisée par le panneau des bâtiments (même style pixel).
export const StatBar = ({ icon, label, value, max, kind }) => (
    <div className={`soldier-stat soldier-stat--${kind}`}>
        <span className="soldier-stat__icon" role="img" aria-label={label}>
            {icon}
        </span>
        <div className="soldier-stat__track">
            <div
                className="soldier-stat__fill"
                style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
            />
        </div>
        <span className="soldier-stat__value">
            {value}/{max}
        </span>
    </div>
);

// Menu des caractéristiques du soldat sélectionné. Prend la place de la
// boutique en bas de l'écran tant qu'un soldat est sélectionné.
const SoldierPanel = ({ soldier, color, canBuy = false, gold = 0, onBuyBonus }) => {
    const level = soldier.level || 1;
    // Un soldat ne voit que les bonus rattachés à son niveau.
    const bonusOffers = bonusOffersForLevel(level);
    // La boutique de bonus est repliée par défaut : cliquer le portrait bascule
    // entre les caractéristiques du soldat et la boutique de bonus.
    const [bonusOpen, setBonusOpen] = useState(false);
    return (
    <div className="soldier-panel">
        {/* Boutique de bonus : panneau séparé qui flotte au-dessus du panneau
            (même largeur, plus haut), bonus empilés à la verticale. */}
        {bonusOpen && (
            <div className="bonus-panel">
                <div className="bonus-list">
                    {bonusOffers.map((bonus) => {
                        // Défi propre à CE soldat : texte avec avancement et état
                        // débloqué (défi terminé).
                        const unlocked = isBonusUnlocked(soldier, bonus);
                        const equipped = soldier.bonus === bonus.id;
                        // Le soldat porte déjà un AUTRE bonus (un seul par soldat).
                        const blocked = !!soldier.bonus && !equipped;
                        const affordable = gold >= (bonus.price || 0);
                        const buyable = canBuy && canBuyBonus(soldier, bonus, gold);
                        return (
                        <div
                            key={bonus.id}
                            className={`bonus-card ${unlocked ? 'bonus-card--unlocked' : ''} ${
                                equipped ? 'bonus-card--equipped' : ''
                            } ${blocked ? 'bonus-card--blocked' : ''}`}
                        >
                            <div className="bonus-card__portrait">
                                {bonus.src ? (
                                    <img src={bonus.src} alt={bonus.label} />
                                ) : (
                                    // Asset pas encore dispo : réserve la place avec un « ? ».
                                    <span className="bonus-card__placeholder" aria-hidden="true">?</span>
                                )}
                                <span className="bonus-card__level">LVL {bonus.requiredLevel}</span>
                            </div>
                            <div className="bonus-card__body">
                                <div className="bonus-card__header">
                                    <span className="bonus-card__name">{bonus.label}</span>
                                    <span
                                        className={`bonus-card__price ${
                                            bonus.price == null ? 'bonus-card__price--free' : ''
                                        }`}
                                    >
                                        {bonus.price == null ? 'Gratuit' : `💰 ${bonus.price}`}
                                    </span>
                                </div>
                                <p className="bonus-card__challenge">
                                    {unlocked ? '✅' : '🎯'} {challengeText(soldier, bonus)}
                                </p>
                                <p className="bonus-card__effect">✨ {bonus.effect}</p>

                                {/* Action : équipé, achetable, ou message d'état. */}
                                {equipped ? (
                                    <span className="bonus-card__equipped">✔ Équipé</span>
                                ) : unlocked && !blocked ? (
                                    <button
                                        type="button"
                                        className="bonus-card__buy"
                                        disabled={!buyable}
                                        onClick={() => buyable && onBuyBonus?.(bonus.id)}
                                    >
                                        {bonus.price == null
                                            ? 'Choisir'
                                            : affordable
                                              ? `Acheter · 💰 ${bonus.price}`
                                              : 'Or insuffisant'}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        );
                    })}
                </div>
            </div>
        )}

        {/* Le portrait fait office de bouton : il porte le niveau du soldat et
            ouvre/ferme la boutique de bonus au-dessus. */}
        <button
            type="button"
            className={`soldier-panel__portrait ${bonusOpen ? 'soldier-panel__portrait--active' : ''}`}
            style={{ borderColor: color }}
            onClick={() => setBonusOpen((v) => !v)}
            aria-expanded={bonusOpen}
            title="Voir les bonus"
        >
            <img src={soldierSprite(soldier)} alt="Soldat" />
            <span className="soldier-panel__level">LVL {level}</span>
        </button>

        <div className="soldier-panel__stats">
            <StatBar icon="❤️" label="Points de vie" value={soldier.hp} max={SOLDIER_HP_MAX} kind="hp" />
            <StatBar icon="⚔️" label="Attaque" value={soldier.atk} max={SOLDIER_ATK_MAX} kind="atk" />
        </div>

        <div className="soldier-panel__specs">
            <div className="soldier-spec">
                <span className="soldier-spec__label">Affinité</span>
                <span className="soldier-spec__value">{affinityLabel(soldier.affinity)}</span>
            </div>
            <div className="soldier-spec">
                <span className="soldier-spec__label">Comportement</span>
                <span className="soldier-spec__value">{behaviorLabel(soldier.behavior)}</span>
            </div>
        </div>
    </div>
    );
};

export default SoldierPanel;
