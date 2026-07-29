import './rules.scss';

const RULES = [
    {
        number: '01',
        title: 'Étendez votre royaume',
        text: 'Déplacez vos soldats sur les hexagones libres ou ennemis. Chaque case conquise agrandit votre territoire et ouvre de nouvelles routes.',
        accent: 'green',
    },
    {
        number: '02',
        title: 'Bâtissez votre économie',
        text: 'L’or reçu à chaque tour permet de recruter, construire et renforcer vos troupes. Gardez un œil sur l’entretien de votre armée.',
        accent: 'gold',
    },
    {
        number: '03',
        title: 'Fusionnez et combattez',
        text: 'Réunissez deux soldats alliés de même niveau pour les améliorer. En combat, les dégâts sont simultanés : anticipez chaque échange.',
        accent: 'red',
    },
    {
        number: '04',
        title: 'Remportez la conquête',
        text: 'Détruisez les bases adverses pour rester seul en lice. Selon les réglages, la domination du territoire ou la fortune peuvent aussi décider du vainqueur.',
        accent: 'blue',
    },
];

const TURN_STEPS = [
    {label: 'Déploiement', detail: 'Achetez unités et bâtiments'},
    {label: 'Manœuvres', detail: 'Jouez chaque soldat une fois'},
    {label: 'Bilan', detail: 'Appliquez revenus et entretiens'},
    {label: 'Relève', detail: 'Passez la main au joueur suivant'},
];

const RulesSection = () => (
    <section className="home-rules" aria-labelledby="rules-title">
        <div className="home-rules__inner">
            <header className="home-rules__heading">
                <div>
                    <span className="home-rules__kicker">LES BASES EN 2 MINUTES</span>
                    <h2 id="rules-title">Comment jouer ?</h2>
                </div>
                <p>
                    Conquest est un jeu de stratégie au tour par tour : développez
                    votre royaume, faites progresser vos troupes et éliminez vos rivaux.
                </p>
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
                        <div className="rule-card__hex" aria-hidden="true" />
                        <h3>{rule.title}</h3>
                        <p>{rule.text}</p>
                    </article>
                ))}
            </div>

            <div className="turn-guide" aria-label="Déroulement d’un tour">
                <div className="turn-guide__intro">
                    <span>UN TOUR DE JEU</span>
                    <strong>Quatre temps pour agir</strong>
                </div>
                <ol className="turn-guide__steps">
                    {TURN_STEPS.map((step, index) => (
                        <li key={step.label}>
                            <i aria-hidden="true">{index + 1}</i>
                            <span>
                                <strong>{step.label}</strong>
                                {step.detail}
                            </span>
                        </li>
                    ))}
                </ol>
            </div>

            <a className="home-rules__training" href="#demo-title">
                Essayer sur le terrain d’entraînement
                <span aria-hidden="true">↓</span>
            </a>
        </div>
    </section>
);

export default RulesSection;
