// Briques d'affichage des caractéristiques, partagées par les panneaux (soldat,
// bâtiment) et les aperçus (fusion, combat) : jauge « valeur / max », et notes
// en épées / cœurs sur 5 crans.
import {SOLDIER_HP_MAX} from '@conquest/shared-engine/engine/rules.js';
import {atkHalfStarsFlat, hpHalfHearts} from '@conquest/shared-engine/data/soldier.js';

const STAR_SRC = {full: '/epeePlein.png', half: '/epeeMoitie.png', empty: '/epeeVide.png'};
const HEART_SRC = {full: '/coeurPlein.png', half: '/coeurMoitie.png', empty: '/coeurVide.png'};

// Jauge « valeur / max » avec barre de remplissage. `beforeValue` (optionnel) :
// valeur AVANT un combat — le segment entre `value` et `beforeValue` est dessiné
// en rouge sur la piste pour visualiser les PV perdus dans l'échange.
export const StatBar = ({icon, label, value, max, kind, valueText, valueNode, hideValue = false, beforeValue}) => {
    const pct = (v) => Math.max(0, Math.min(100, (v / max) * 100));
    const currentPct = pct(value);
    const beforePct = beforeValue != null ? pct(beforeValue) : currentPct;
    return (
        <div className={`soldier-stat soldier-stat--${kind}`}>
            <span className="soldier-stat__icon" role="img" aria-label={label}>
                {icon}
            </span>
            <div className="soldier-stat__track">
                {beforePct > currentPct && (
                    <div
                        className="soldier-stat__damage"
                        style={{left: `${currentPct}%`, width: `${beforePct - currentPct}%`}}
                    />
                )}
                <div className="soldier-stat__fill" style={{width: `${currentPct}%`}}/>
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
const IconRating = ({kind, alt, srcSet, halfCount, percentText, percentWide}) => {
    const full = Math.floor(halfCount / 2);
    const hasHalf = halfCount % 2 === 1;
    return (
        <div className={`soldier-stat soldier-stat--${kind}`} role="img" aria-label={alt}>
            {percentText != null && (
                <span className={`soldier-stars__percent ${percentWide ? 'soldier-stars__percent--wide' : ''}`}>
                    {percentText}
                </span>
            )}
            <div className="soldier-stars">
                {Array.from({length: 5}, (_, i) => {
                    const state = i < full ? 'full' : i === full && hasHalf ? 'half' : 'empty';
                    return <img key={i} src={srcSet[state]} alt="" className="soldier-stars__item"/>;
                })}
            </div>
        </div>
    );
};

// Pas de plafond à 100 % : une structure dont le vrai maximum dépasse le
// plafond d'affichage montre un pourcentage > 100 % (ex. base à 1000 PV).
const ratioPercent = (value, max) => Math.round(Math.max(0, value / max) * 100);

// Note d'attaque en épées : une demi-épée par tranche de 10 points d'attaque
// (échelle absolue, indépendante du maximum réel), précédée du pourcentage
// d'attaque (`atk` rapporté à `max`).
export const AtkStars = ({atk, max, wide}) => (
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
// pourcentage de vie restante. `beforeHp` (optionnel, panneau de combat) :
// affiche « avant% → après% » — passer alors `wide` pour que la case élargie
// n'empiète pas sur les cœurs.
export const HpHearts = ({hp, max = SOLDIER_HP_MAX, beforeHp, wide}) => (
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
