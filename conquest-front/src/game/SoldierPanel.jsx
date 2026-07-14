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
    hasUnlockedBonus,
    isBonusNotified,
    bonusLabel,
    atkRankLabel,
    atkHalfStarsFlat,
    hpHalfHearts,
    levelRankLabel,
    MIN_BONUS_LEVEL,
    MAX_BONUS_LEVEL,
} from '@conquest/shared-engine/data/soldier.js';
import { SOLDIER_ATK_MAX, SOLDIER_HP_MAX } from '@conquest/shared-engine/engine/rules.js';
import { DEV_CONFIG } from '../config/devConfig.js';
import UpkeepSpec from './UpkeepSpec.jsx';

// Icône par affinité (ids définis dans AFFINITIES). Un soldat sans affinité
// (null) n'a pas d'entrée : on retombe alors sur le libellé texte « Aucune ».
const AFFINITY_SRC = {
    fire: '/fire.png',
    ice: '/ice.png',
    lightning: '/thunder.png',
};

// Petite jauge « valeur / max » avec barre de remplissage. Exportée pour être
// réutilisée par le panneau des bâtiments (même style pixel). `beforeValue`
// (optionnel) : valeur AVANT un combat — le segment entre `value` et
// `beforeValue` est dessiné en rouge sur la piste pour visualiser les PV
// perdus dans l'échange.
export const StatBar = ({ icon, label, value, max, kind, valueText, valueNode, hideValue = false, beforeValue }) => {
    const currentPct = Math.max(0, Math.min(100, (value / max) * 100));
    const beforePct =
        beforeValue != null ? Math.max(0, Math.min(100, (beforeValue / max) * 100)) : currentPct;
    return (
        <div className={`soldier-stat soldier-stat--${kind}`}>
            <span className="soldier-stat__icon" role="img" aria-label={label}>
                {icon}
            </span>
            <div className="soldier-stat__track">
                {beforePct > currentPct && (
                    <div
                        className="soldier-stat__damage"
                        style={{ left: `${currentPct}%`, width: `${beforePct - currentPct}%` }}
                    />
                )}
                <div className="soldier-stat__fill" style={{ width: `${currentPct}%` }} />
            </div>
            {!hideValue && (
                <span className="soldier-stat__value">
                    {valueNode ?? valueText ?? `${value}/${max}`}
                </span>
            )}
        </div>
    );
};

// Rangée générique de 5 icônes (pleine / moitié / vide) pour représenter une
// note sur 5 en demi-crans. `halfCount` va de 0 à 10. `percentText` (optionnel) :
// texte déjà formaté (ex. « 42% » ou « 42 → 20% ») affiché avant la rangée.
// `percentWide` : élargit la case du pourcentage (panneau de combat) pour que
// le texte plus long « avant% → après% » ne déborde pas sur les icônes.
const IconRating = ({ kind, alt, srcSet, halfCount, percentText, percentWide }) => {
    const full = Math.floor(halfCount / 2);
    const hasHalf = halfCount % 2 === 1;
    return (
        <div className={`soldier-stat soldier-stat--${kind}`} role="img" aria-label={alt}>
            {percentText != null && (
                <span
                    className={`soldier-stars__percent ${percentWide ? 'soldier-stars__percent--wide' : ''}`}
                >
                    {percentText}
                </span>
            )}
            <div className="soldier-stars">
                {Array.from({ length: 5 }, (_, i) => {
                    const state = i < full ? 'full' : i === full && hasHalf ? 'half' : 'empty';
                    return (
                        <img key={i} src={srcSet[state]} alt="" className="soldier-stars__item" />
                    );
                })}
            </div>
        </div>
    );
};

const STAR_SRC = { full: '/epeePlein.png', half: '/epeeMoitie.png', empty: '/epeeVide.png' };
const HEART_SRC = { full: '/coeurPlein.png', half: '/coeurMoitie.png', empty: '/coeurVide.png' };

// Pas de plafond à 100 % : une structure dont le vrai maximum dépasse le
// plafond d'affichage (voir `PREVIEW_STAT_MAX`) montre un pourcentage > 100 %
// (ex. base à 1000 PV -> 1000 %, tour de défense à 200 PV -> 200 %).
const ratioPercent = (value, max) => Math.round(Math.max(0, value / max) * 100);

// Note d'attaque en épées : une demi-épée par tranche de 10 points d'attaque
// (même échelle absolue que les cœurs de vie, indépendante du maximum réel),
// précédée du pourcentage d'attaque (`atk` rapporté à `max`). Exportée pour
// être réutilisée par le panneau de combat.
export const AtkStars = ({ atk, max, wide }) => (
    <IconRating
        kind="atk"
        alt="Attaque"
        srcSet={STAR_SRC}
        halfCount={atkHalfStarsFlat(atk)}
        percentText={`${ratioPercent(atk, max)}%`}
        percentWide={wide}
    />
);

// Note de vie en cœurs : un demi-cœur par tranche de 10 PV, précédée du
// pourcentage de vie restante (`hp` rapporté à `max`). `beforeHp` (optionnel,
// panneau de combat) : affiche « avant% → après% » au lieu du seul pourcentage
// courant — dans ce cas, passer `wide` pour que la case élargie n'empiète pas
// sur les cœurs. Exportée pour être réutilisée par le panneau de combat.
export const HpHearts = ({ hp, max = SOLDIER_HP_MAX, beforeHp, wide }) => (
    <IconRating
        kind="hp"
        alt="Points de vie"
        srcSet={HEART_SRC}
        halfCount={hpHalfHearts(hp)}
        percentText={
            beforeHp != null
                ? `${ratioPercent(beforeHp, max)}% → ${ratioPercent(hp, max)}%`
                : `${ratioPercent(hp, max)}%`
        }
        percentWide={wide}
    />
);

// Menu des caractéristiques du soldat sélectionné. Prend la place de la
// boutique en bas de l'écran tant qu'un soldat est sélectionné.
const SoldierPanel = ({ soldier, color, owner, canBuy = false, gold = 0, onBuyBonus, selectionId, settings, bonusesEnabled = true }) => {
    const level = soldier.level || 1;
    // Pas de boutique de bonus pour un squelette invoqué, ni quand les bonus sont
    // désactivés en configuration : le portrait n'ouvre alors rien.
    const skeleton = isSkeleton(soldier);
    const noBonusShop = skeleton || !bonusesEnabled;
    // Un bonus est débloqué (défi accompli) et pas encore réclamé : notification.
    const notify = hasUnlockedBonus(soldier, settings, bonusesEnabled);
    // La boutique de bonus est repliée par défaut : cliquer le portrait bascule
    // entre les caractéristiques du soldat et la boutique de bonus.
    const [bonusOpen, setBonusOpen] = useState(false);
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
    // La boutique se referme à chaque changement de soldat sélectionné.
    useEffect(() => {
        setBonusOpen(false);
    }, [selectionId, noBonusShop]);
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
                            className={`bonus-card ${unlocked && viewingOwnLevel ? 'bonus-card--unlocked' : ''} ${
                                equipped ? 'bonus-card--equipped' : ''
                            } ${blocked ? 'bonus-card--blocked' : ''} ${
                                viewingOwnLevel ? '' : 'bonus-card--preview'
                            }`}
                        >
                            <div className="bonus-card__portrait">
                                {bonus.src ? (
                                    <img src={bonus.src} alt={bonus.label} />
                                ) : (
                                    // Asset pas encore dispo : réserve la place avec un « ? ».
                                    <span className="bonus-card__placeholder" aria-hidden="true">?</span>
                                )}
                                <span className="bonus-card__level">LVL {bonus.requiredLevel}</span>
                                {/* Aperçu d'un autre niveau : cadenas de consultation. */}
                                {!viewingOwnLevel && (
                                    <img src="/lock.png" alt="Verrouillé" className="bonus-card__lock" />
                                )}
                                {/* Bonus débloqué, réclamable et pas encore acquitté : notification. */}
                                {viewingOwnLevel && !equipped && !blocked &&
                                    isBonusNotified(soldier, bonus, settings, bonusesEnabled) && (
                                    <img src="/notif.png" alt="Débloqué" className="bonus-card__notif" />
                                )}
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
                                            {price === 0 ? 'Gratuit' : (
                                                <>
                                                    <img src="/coin.png" alt="or" className="coin-icon" /> {price}
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
                                    <img src="/defi.png" alt="Défi" className="bonus-card__line-icon" />
                                    <span className="bonus-card__line-text">{challengeText(soldier, bonus)}</span>
                                </p>
                                <p className="bonus-card__effect">
                                    <img src="/sword.png" alt="Effet" className="bonus-card__line-icon" />
                                    <span className="bonus-card__line-text">{bonus.effect}</span>
                                </p>

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
                                              ? (
                                                  <>
                                                      Acheter · <img src="/coin.png" alt="or" className="coin-icon" /> {price}
                                                  </>
                                              )
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

        {/* Colonne portrait : étoiles de niveau (1 à 5) au-dessus du portrait. */}
        <div className="soldier-panel__portrait-col">
            <div className="soldier-panel__level-stars">
                {Array.from({ length: 5 }, (_, i) => (
                    <img
                        key={i}
                        src={i < level ? '/etoilePleine.png' : '/etoileVide.png'}
                        alt=""
                        className="soldier-panel__level-star"
                    />
                ))}
            </div>
            {/* Le portrait fait office de bouton : il ouvre/ferme la boutique de
                bonus au-dessus. */}
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
                {DEV_CONFIG.showSoldierPanelLevel && (
                    <span className="soldier-panel__level">LVL {level}</span>
                )}
                {/* Notification : un bonus est débloqué et attend d'être réclamé. */}
                {notify && (
                    <img src="/notif.png" alt="Bonus débloqué" className="soldier-panel__notif" />
                )}
            </button>
        </div>

        <div className="soldier-panel__stats">
            {DEV_CONFIG.showAtkRankLabel && (
                <span className="soldier-panel__atk-rank">
                    {atkRankLabel(soldier.atk, SOLDIER_ATK_MAX)}{' '}
                    <span className="soldier-panel__atk-race">
                        {soldier.bonus ? bonusLabel(soldier.bonus) : levelRankLabel(level)}
                    </span>
                </span>
            )}
            <AtkStars atk={soldier.atk} max={SOLDIER_ATK_MAX} />
            <HpHearts hp={soldier.hp} />
        </div>

        <div className="soldier-panel__specs">
            <div className="soldier-spec">
                <span className="soldier-spec__label">Affinité</span>
                <span className="soldier-spec__value">
                    {AFFINITY_SRC[soldier.affinity] ? (
                        <img
                            src={AFFINITY_SRC[soldier.affinity]}
                            alt={affinityLabel(soldier.affinity)}
                            title={affinityLabel(soldier.affinity)}
                            className="soldier-spec__affinity"
                        />
                    ) : (
                        affinityLabel(soldier.affinity)
                    )}
                </span>
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
