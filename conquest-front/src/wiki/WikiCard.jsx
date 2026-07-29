/* eslint-disable react/prop-types */

import './wiki.scss';

const LevelStars = ({level}) => {
    if (level == null) return null;

    return (
        <div className="wiki-card__stars" aria-label={`Niveau ${level} sur 5`}>
            {Array.from({length: 5}, (_, index) => (
                <img
                    key={index}
                    src={index < level ? '/etoilePleine.png' : '/etoileVide.png'}
                    alt=""
                    draggable={false}
                />
            ))}
        </div>
    );
};

const CombatStats = ({combat}) => {
    if (!combat) return null;

    return (
        <div className="wiki-card__combat" aria-label="Caractéristiques de combat">
            {combat.atk != null && (
                <div
                    className="wiki-card__combat-stat wiki-card__combat-stat--atk"
                    aria-label={`Attaque : ${combat.atk}`}
                >
                    <img src="/sword.png" alt="" draggable={false} />
                    <strong>{combat.atk}</strong>
                </div>
            )}
            {combat.hp != null && (
                <div
                    className="wiki-card__combat-stat wiki-card__combat-stat--hp"
                    aria-label={`Points de vie : ${combat.hp}`}
                >
                    <img src="/heart.png" alt="" draggable={false} />
                    <strong>{combat.hp}</strong>
                </div>
            )}
        </div>
    );
};

const Economy = ({economy}) => {
    if (!economy) return null;

    const upkeep = economy.upkeep;
    const upkeepClass = upkeep > 0
        ? 'wiki-card__gold--cost'
        : upkeep < 0
            ? 'wiki-card__gold--gain'
            : 'wiki-card__gold--neutral';
    const upkeepValue = upkeep > 0
        ? `−${upkeep}`
        : upkeep < 0
            ? `+${Math.abs(upkeep)}`
            : '0';

    return (
        <div className="wiki-card__economy" aria-label="Économie">
            {economy.price != null && (
                <div className={`wiki-card__gold ${economy.price === 0 ? 'wiki-card__gold--gain' : ''}`}>
                    <img src="/coin.png" alt="" draggable={false} />
                    <span>
                        <small>Prix</small>
                        <strong>{economy.price === 0 ? 'Gratuit' : economy.price}</strong>
                    </span>
                </div>
            )}
            {upkeep != null && (
                <div className={`wiki-card__gold ${upkeepClass}`}>
                    <img src="/coin.png" alt="" draggable={false} />
                    <span>
                        <small>Par tour</small>
                        <strong>{upkeepValue}</strong>
                    </span>
                </div>
            )}
            {economy.reward != null && (
                <div className="wiki-card__gold wiki-card__gold--gain">
                    <img src="/coin.png" alt="" draggable={false} />
                    <span>
                        <small>Gain</small>
                        <strong>+{economy.reward}</strong>
                    </span>
                </div>
            )}
        </div>
    );
};

// Carte autonome du codex. Elle ne dépend ni du carousel ni de l'accueil :
// elle pourra donc être rendue telle quelle dans un panneau in-game plus tard.
const WikiCard = ({entry, active = false}) => (
    <article
        className={`wiki-card${active ? ' wiki-card--active' : ''}`}
        aria-label={entry.title}
    >
        <div
            className="wiki-card__visual"
            style={{
                '--wiki-accent': entry.color ?? entry.glow,
                '--wiki-glow': entry.glow ?? entry.color,
            }}
        >
            <span className="wiki-card__scanline" aria-hidden="true" />
            <span className="wiki-card__glow" aria-hidden="true" />
            {entry.image ? (
                <img
                    className="wiki-card__sprite"
                    src={entry.image}
                    alt=""
                    draggable={false}
                />
            ) : (
                <span
                    className="wiki-card__terrain"
                    style={{backgroundColor: entry.color}}
                    aria-hidden="true"
                />
            )}
        </div>

        <div className="wiki-card__content">
            <span className="wiki-card__eyebrow">{entry.eyebrow}</span>
            <h3 className="wiki-card__title">{entry.title}</h3>
            <LevelStars level={entry.level} />
            <p className="wiki-card__description">{entry.description}</p>

            {entry.challenge && (
                <p className="wiki-card__challenge">
                    <img src="/defi.png" alt="" draggable={false} />
                    <span>
                        <strong>Défi</strong>
                        {entry.challenge}
                    </span>
                </p>
            )}

            <CombatStats combat={entry.combat} />
            <Economy economy={entry.economy} />

            {entry.details?.length > 0 && (
                <dl className="wiki-card__details">
                    {entry.details.map((detail) => (
                        <div className="wiki-card__detail" key={detail.label}>
                            <dt>{detail.label}</dt>
                            <dd className={detail.image ? 'wiki-card__detail-value--icon' : undefined}>
                                {detail.image && (
                                    <img
                                        src={detail.image}
                                        alt={detail.imageAlt ?? ''}
                                        draggable={false}
                                    />
                                )}
                                {detail.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    </article>
);

export default WikiCard;
