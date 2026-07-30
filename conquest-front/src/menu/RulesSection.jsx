import './rules.scss';

const RULES = [
    {
        number: '01',
        title: 'Étendez votre royaume',
        text: 'Déplacez vos soldats sur les hexagones libres ou ennemis. Chaque case conquise agrandit votre territoire et ouvre de nouvelles routes.',
        accent: 'green',
        icon: '/characters/lvl1/aventurer.png',
    },
    {
        number: '02',
        title: 'Bâtissez votre économie',
        text: 'L’or reçu à chaque tour permet de recruter, construire et renforcer vos troupes. Gardez un œil sur l’entretien de votre armée.',
        accent: 'gold',
        icon: '/house.png',
    },
    {
        number: '03',
        title: 'Fusionnez et combattez',
        text: 'Réunissez deux soldats alliés de même niveau pour les améliorer. En combat, les dégâts sont simultanés : anticipez chaque échange.',
        accent: 'red',
        icon: '/fightIndicatorRed.png',
    },
    {
        number: '04',
        title: 'Remportez la conquête',
        text: 'Détruisez les bases adverses pour rester seul en lice. Selon les réglages, la domination du territoire ou la fortune peuvent aussi décider du vainqueur.',
        accent: 'blue',
        icon: '/crown.png',
    },
];

const RulesSection = () => (
    <section className="home-rules" aria-labelledby="rules-title">
        <div className="home-rules__inner">
            <header className="home-rules__heading">
                <div>
                    <span className="home-rules__kicker">LES BASES EN 2 MINUTES</span>
                    <h2 id="rules-title">Comment jouer ?</h2>
                </div>
            </header>

            <div className="home-rules__grid">
                {RULES.map((rule) => (
                    <article
                        className={`rule-card rule-card--${rule.accent}`}
                        key={rule.number}
                    >
                        <span className="rule-card__number" aria-hidden="true">
                            {rule.number}
                        </span>
                        <div className="rule-card__hex" aria-hidden="true">
                            <img src={rule.icon} alt="" />
                        </div>
                        <h3>{rule.title}</h3>
                        <p>{rule.text}</p>
                    </article>
                ))}
            </div>

        </div>
    </section>
);

export default RulesSection;
