import {useEffect, useState} from 'react';
import {
    bonusOffersForLevel,
    bonusPriceOf,
    bonusUpkeep,
    canBuyBonus,
    challengeText,
    isBonusNotified,
    isBonusUnlocked,
    MAX_BONUS_LEVEL,
    MIN_BONUS_LEVEL,
} from '@conquest/shared-engine/data/soldier.js';

// Boutique de bonus d'un soldat : panneau flottant au-dessus du panneau du
// soldat, ouvert par son portrait. On peut parcourir les niveaux voisins pour
// lire leurs défis, mais un soldat n'achète que les bonus de SON niveau — les
// autres niveaux sont en consultation seule (cadenas).

// Une carte de bonus : portrait, prix / entretien, défi, effet, et action.
const BonusCard = ({soldier, bonus, settings, bonusesEnabled, gold, canBuy, ownLevel, onBuy}) => {
    const unlocked = isBonusUnlocked(soldier, bonus);
    const equipped = soldier.bonus === bonus.id;
    // Le soldat porte déjà un AUTRE bonus (un seul par soldat).
    const blocked = !!soldier.bonus && !equipped;
    // Prix et entretien effectifs (configurables par partie).
    const price = bonusPriceOf(bonus, settings);
    const upkeep = bonusUpkeep(bonus.id, settings);
    const affordable = gold >= price;
    const buyable = ownLevel && canBuy && canBuyBonus(soldier, bonus, gold, settings);

    const classes = [
        'bonus-card',
        unlocked && ownLevel ? 'bonus-card--unlocked' : '',
        equipped ? 'bonus-card--equipped' : '',
        blocked ? 'bonus-card--blocked' : '',
        ownLevel ? '' : 'bonus-card--preview',
    ].filter(Boolean).join(' ');

    return (
        <div className={classes}>
            <div className="bonus-card__portrait">
                {bonus.src ? (
                    <img src={bonus.src} alt={bonus.label}/>
                ) : (
                    // Asset pas encore dispo : réserve la place avec un « ? ».
                    <span className="bonus-card__placeholder" aria-hidden="true">?</span>
                )}
                <span className="bonus-card__level">LVL {bonus.requiredLevel}</span>
                {/* Aperçu d'un autre niveau : cadenas de consultation. */}
                {!ownLevel && <img src="/lock.png" alt="Verrouillé" className="bonus-card__lock"/>}
                {/* Bonus débloqué, réclamable et pas encore acquitté : notification. */}
                {ownLevel && !equipped && !blocked &&
                    isBonusNotified(soldier, bonus, settings, bonusesEnabled) && (
                        <img src="/notif.png" alt="Débloqué" className="bonus-card__notif"/>
                    )}
            </div>
            <div className="bonus-card__body">
                <div className="bonus-card__header">
                    <span className="bonus-card__name">{bonus.label}</span>
                    <span className="bonus-card__cost">
                        <span className={`bonus-card__price ${price === 0 ? 'bonus-card__price--free' : ''}`}>
                            {price === 0 ? 'Gratuit' : (
                                <>
                                    <img src="/coin.png" alt="or" className="coin-icon"/> {price}
                                </>
                            )}
                        </span>
                        {upkeep ? (
                            <span className="bonus-card__upkeep" title="Entretien par tour">
                                −{upkeep}/tour
                            </span>
                        ) : null}
                    </span>
                </div>
                <p className={`bonus-card__challenge ${unlocked ? 'bonus-card__challenge--done' : ''}`}>
                    <img src="/defi.png" alt="Défi" className="bonus-card__line-icon"/>
                    <span className="bonus-card__line-text">{challengeText(soldier, bonus)}</span>
                </p>
                <p className="bonus-card__effect">
                    <img src="/sword.png" alt="Effet" className="bonus-card__line-icon"/>
                    <span className="bonus-card__line-text">{bonus.effect}</span>
                </p>

                {/* Action : équipé, achetable, ou rien (autre niveau / défi en cours). */}
                {!ownLevel ? null : equipped ? (
                    <span className="bonus-card__equipped">✔ Équipé</span>
                ) : unlocked && !blocked ? (
                    <button
                        type="button"
                        className="bonus-card__buy"
                        disabled={!buyable}
                        onClick={() => buyable && onBuy?.(bonus.id)}
                    >
                        {price === 0 ? 'Choisir' : affordable ? (
                            <>
                                Acheter · <img src="/coin.png" alt="or" className="coin-icon"/> {price}
                            </>
                        ) : 'Or insuffisant'}
                    </button>
                ) : null}
            </div>
        </div>
    );
};

const BonusPanel = ({soldier, selectionId, settings, bonusesEnabled, gold, canBuy, onBuy}) => {
    const level = soldier.level || 1;
    // Niveau consulté : celui du soldat par défaut. On repart de son niveau à
    // chaque changement de soldat sélectionné.
    const [viewLevel, setViewLevel] = useState(level);
    useEffect(() => {
        setViewLevel(level);
    }, [selectionId, level]);

    const ownLevel = viewLevel === level;
    // Bonus du niveau consulté, hormis ceux désactivés dans la configuration.
    const offers = bonusOffersForLevel(viewLevel).filter(
        (b) => settings?.bonusEnabled?.[b.id] !== false
    );

    return (
        <div className="bonus-panel">
            <div className="bonus-list">
                {offers.map((bonus) => (
                    <BonusCard
                        key={bonus.id}
                        soldier={soldier}
                        bonus={bonus}
                        settings={settings}
                        bonusesEnabled={bonusesEnabled}
                        gold={gold}
                        canBuy={canBuy}
                        ownLevel={ownLevel}
                        onBuy={onBuy}
                    />
                ))}
            </div>

            {/* Navigation entre niveaux de bonus (consultation). */}
            <div className="bonus-panel__nav">
                <button
                    type="button"
                    className="bonus-panel__nav-btn"
                    onClick={() => setViewLevel((l) => Math.max(MIN_BONUS_LEVEL, l - 1))}
                    disabled={viewLevel <= MIN_BONUS_LEVEL}
                    aria-label="Niveau précédent"
                    title="Niveau précédent"
                >
                    ◀
                </button>
                <span className="bonus-panel__nav-label">
                    Bonus niveau {viewLevel}
                    {ownLevel ? '' : ' · aperçu'}
                </span>
                <button
                    type="button"
                    className="bonus-panel__nav-btn"
                    onClick={() => setViewLevel((l) => Math.min(MAX_BONUS_LEVEL, l + 1))}
                    disabled={viewLevel >= MAX_BONUS_LEVEL}
                    aria-label="Niveau suivant"
                    title="Niveau suivant"
                >
                    ▶
                </button>
            </div>
        </div>
    );
};

export default BonusPanel;
