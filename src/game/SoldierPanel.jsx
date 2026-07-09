import { useEffect, useState } from 'react';
import {
    affinityLabel,
    behaviorLabel,
    soldierSprite,
    bonusOffersForLevel,
    challengeText,
    isBonusUnlocked,
    canBuyBonus,
    bonusPriceOf,
    bonusUpkeep,
    isSkeleton,
    MIN_BONUS_LEVEL,
    MAX_BONUS_LEVEL,
} from './soldier.js';
import { SOLDIER_HP_MAX, SOLDIER_ATK_MAX } from './engine/rules.js';
import UpkeepSpec from './UpkeepSpec.jsx';

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
const SoldierPanel = ({ soldier, color, owner, canBuy = false, gold = 0, onBuyBonus, openBonus = false, selectionId, settings, bonusesEnabled = true }) => {
    const level = soldier.level || 1;
    // Pas de boutique de bonus pour un squelette invoqué, ni quand les bonus sont
    // désactivés en configuration : le portrait n'ouvre alors rien.
    const skeleton = isSkeleton(soldier);
    const noBonusShop = skeleton || !bonusesEnabled;
    // La boutique de bonus est repliée par défaut : cliquer le portrait bascule
    // entre les caractéristiques du soldat et la boutique de bonus.
    const [bonusOpen, setBonusOpen] = useState(openBonus);
    // Niveau des bonus affichés : par défaut celui du soldat, mais on peut
    // parcourir les niveaux voisins pour lire leurs défis (consultation seule).
    const [viewLevel, setViewLevel] = useState(level);
    // Un soldat n'achète que les bonus de SON niveau ; parcourir un autre niveau
    // est purement informatif.
    // Bonus du niveau consulté, hormis ceux désactivés dans la configuration.
    const bonusOffers = bonusOffersForLevel(viewLevel).filter(
        (b) => settings?.bonusEnabled?.[b.id] !== false
    );
    const viewingOwnLevel = viewLevel === level;
    // Sélection via clic droit : on ouvre d'emblée la boutique de bonus. On
    // resynchronise à chaque changement de soldat sélectionné.
    useEffect(() => {
        setBonusOpen(openBonus && !noBonusShop);
    }, [openBonus, selectionId, noBonusShop]);
    // Nouveau soldat sélectionné : on repart sur son propre niveau.
    useEffect(() => {
        setViewLevel(level);
    }, [selectionId, level]);
    return (
    <div className="soldier-panel">
        {/* Boutique de bonus : panneau séparé qui flotte au-dessus du panneau
            (même largeur, plus haut), bonus empilés à la verticale. */}
        {bonusOpen && !noBonusShop && (
            <div className="bonus-panel">

                <div className="bonus-list">
                    {bonusOffers.map((bonus) => {
                        // Défi propre à CE soldat : texte avec avancement et état
                        // débloqué (défi terminé).
                        const unlocked = isBonusUnlocked(soldier, bonus);
                        const equipped = soldier.bonus === bonus.id;
                        // Le soldat porte déjà un AUTRE bonus (un seul par soldat).
                        const blocked = !!soldier.bonus && !equipped;
                        // Prix et entretien effectifs (configurables par partie).
                        const price = bonusPriceOf(bonus, settings);
                        const upkeep = bonusUpkeep(bonus.id, settings);
                        const affordable = gold >= price;
                        // Achat possible uniquement au niveau réel du soldat ;
                        // les autres niveaux sont en consultation seule.
                        const buyable = viewingOwnLevel && canBuy && canBuyBonus(soldier, bonus, gold, settings);
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
                                    <span className="bonus-card__cost">
                                        <span
                                            className={`bonus-card__price ${
                                                price === 0 ? 'bonus-card__price--free' : ''
                                            }`}
                                        >
                                            {price === 0 ? 'Gratuit' : `💰 ${price}`}
                                        </span>
                                        {upkeep ? (
                                            <span className="bonus-card__upkeep" title="Entretien par tour">
                                                −{upkeep}/tour
                                            </span>
                                        ) : null}
                                    </span>
                                </div>
                                <p className="bonus-card__challenge">
                                    {unlocked ? '✅' : '🎯'} {challengeText(soldier, bonus)}
                                </p>
                                <p className="bonus-card__effect">✨ {bonus.effect}</p>

                                {/* Action : équipé, achetable, ou message d'état. */}
                                {!viewingOwnLevel ? null : equipped ? (
                                    <span className="bonus-card__equipped">✔ Équipé</span>
                                ) : unlocked && !blocked ? (
                                    <button
                                        type="button"
                                        className="bonus-card__buy"
                                        disabled={!buyable}
                                        onClick={() => buyable && onBuyBonus?.(bonus.id)}
                                    >
                                        {price === 0
                                            ? 'Choisir'
                                            : affordable
                                              ? `Acheter · 💰 ${price}`
                                              : 'Or insuffisant'}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        );
                    })}
                </div>
                {/* navigation entre niveaux de bonus (consultation). */}
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
                        {viewingOwnLevel ? '' : ' · aperçu'}
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
        )}

        {/* Le portrait fait office de bouton : il porte le niveau du soldat et
            ouvre/ferme la boutique de bonus au-dessus. */}
        <button
            type="button"
            className={`soldier-panel__portrait ${bonusOpen ? 'soldier-panel__portrait--active' : ''}`}
            style={{ borderColor: color }}
            onClick={() => !noBonusShop && setBonusOpen((v) => !v)}
            aria-expanded={noBonusShop ? undefined : bonusOpen}
            disabled={noBonusShop}
            title={skeleton ? 'Squelette invoqué' : bonusesEnabled ? 'Voir les bonus' : 'Bonus désactivés'}
        >
            <img src={soldierSprite(soldier)} alt={skeleton ? 'Squelette' : 'Soldat'} />
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
            <UpkeepSpec unit={soldier} owner={owner} settings={settings} />
        </div>
    </div>
    );
};

export default SoldierPanel;
