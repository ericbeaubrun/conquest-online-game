import {useEffect, useRef, useState} from 'react';
import WikiSection from '../wiki/WikiSection.jsx';
import FusionDemo from '../demo/FusionDemo.jsx';
import RulesSection from './RulesSection.jsx';

const HERO_PARTICLES = Array.from({length: 18});

const HomePage = ({ onPlayOffline, onPlayOnline }) => {
    const [activeFaction, setActiveFaction] = useState(null);
    const [isHeroVisible, setIsHeroVisible] = useState(true);
    const heroRef = useRef(null);
    const heroMotion = useRef({
        currentX: 0,
        currentY: 0,
        targetX: 0,
        targetY: 0,
        frame: null,
        element: null,
    });
    const guardianMotion = useRef(null);
    const conquerorMotion = useRef(null);

    useEffect(() => {
        const motion = heroMotion.current;

        return () => {
            if (motion.frame != null) cancelAnimationFrame(motion.frame);
        };
    }, []);

    useEffect(() => {
        const hero = heroRef.current;
        if (!hero) return undefined;

        const observer = new IntersectionObserver(
            ([entry]) => setIsHeroVisible(entry.isIntersecting),
            {threshold: 0.08},
        );

        observer.observe(hero);
        return () => observer.disconnect();
    }, []);

    const applyHeroMotion = (element, x, y) => {
        const heroStyle = element.style;
        heroStyle.setProperty('--hero-particles-x', `${(-x * 14).toFixed(2)}px`);
        heroStyle.setProperty('--hero-particles-y', `${(-y * 12).toFixed(2)}px`);

        if (guardianMotion.current) {
            guardianMotion.current.style.transform = `
                translate3d(${(x * 76).toFixed(2)}px, ${(y * 50).toFixed(2)}px, 0)
                rotateX(${(-y * 12).toFixed(2)}deg)
                rotateY(${(x * 16).toFixed(2)}deg)
            `;
        }

        if (conquerorMotion.current) {
            conquerorMotion.current.style.transform = `
                translate3d(${(x * 98).toFixed(2)}px, ${(y * 64).toFixed(2)}px, 0)
                rotateX(${(-y * 14).toFixed(2)}deg)
                rotateY(${(x * 19).toFixed(2)}deg)
            `;
        }
    };

    const animateHeroMotion = () => {
        const motion = heroMotion.current;
        const easing = 0.085;

        motion.currentX += (motion.targetX - motion.currentX) * easing;
        motion.currentY += (motion.targetY - motion.currentY) * easing;

        if (motion.element) {
            applyHeroMotion(motion.element, motion.currentX, motion.currentY);
        }

        const distance =
            Math.abs(motion.targetX - motion.currentX) +
            Math.abs(motion.targetY - motion.currentY);

        if (distance > 0.0002) {
            motion.frame = requestAnimationFrame(animateHeroMotion);
        } else {
            motion.currentX = motion.targetX;
            motion.currentY = motion.targetY;
            motion.frame = null;
        }
    };

    const requestHeroMotionFrame = () => {
        const motion = heroMotion.current;
        if (motion.frame == null) {
            motion.frame = requestAnimationFrame(animateHeroMotion);
        }
    };

    const handleHeroMouseMove = (event) => {
        const motion = heroMotion.current;
        const bounds = event.currentTarget.getBoundingClientRect();
        motion.targetX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        motion.targetY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
        motion.element = event.currentTarget;
        requestHeroMotionFrame();
    };

    const resetHeroPointer = (event) => {
        const motion = heroMotion.current;
        motion.targetX = 0;
        motion.targetY = 0;
        motion.element = event.currentTarget;
        requestHeroMotionFrame();
    };

    const handleHeroMouseLeave = (event) => {
        setActiveFaction(null);
        resetHeroPointer(event);
    };

    return (
        <div className="home-screen">
            <header className={`home-topbar${isHeroVisible ? ' home-topbar--hero' : ''}`}>
                <div className="home-topbar__inner">
                    <a
                        className="home-topbar__brand"
                        href="https://github.com/ericbeaubrun/conquest-online-game"
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Voir le dépôt GitHub de Conquest"
                    >
                        <img src="/github.svg" alt="" />
                    </a>
                    <nav className="home-topbar__nav" aria-label="Navigation principale">
                        <a href="#home">Jouer</a>
                        <a href="#context-title">À propos</a>
                        <a href="#rules-title">Règles</a>
                        <a href="#demo-title">Démonstration</a>
                        <a href="#wiki-title">Contenu</a>
                    </nav>
                </div>
            </header>

            <main
                ref={heroRef}
                className={`home-hero${activeFaction ? ` home-hero--${activeFaction}-active` : ''}`}
                id="home"
                onMouseMove={handleHeroMouseMove}
                onMouseLeave={handleHeroMouseLeave}
            >
                <div className="home-hero__scene" aria-hidden="true">
                    <div className="home-hero__duality" />
                    <div className="home-hero__particles">
                        {HERO_PARTICLES.map((_, index) => (
                            <i
                                key={index}
                                style={{
                                    '--particle-index': index,
                                    '--particle-size': `${2 + (index % 3)}px`,
                                    '--particle-x': `${4 + ((index * 29) % 90)}%`,
                                    '--particle-y': `${8 + ((index * 43) % 78)}%`,
                                }}
                            />
                        ))}
                    </div>
                    <div className="home-hero__champion home-hero__champion--left">
                        <div className="home-hero__champion-motion" ref={guardianMotion}>
                            <span>
                                <img
                                    src="/characters/lvl4/SoldierLVL4.png"
                                    alt=""
                                    draggable={false}
                                />
                            </span>
                            <small>LE GARDIEN</small>
                        </div>
                    </div>
                    <div className="home-hero__champion home-hero__champion--right">
                        <div className="home-hero__champion-motion" ref={conquerorMotion}>
                            <span>
                                <img
                                    src="/characters/lvl5/conquerant.png"
                                    alt=""
                                    draggable={false}
                                />
                            </span>
                            <small>LE CONQUÉRANT</small>
                        </div>
                    </div>
                </div>

                <div className="home-hero__content">
                    <div className="home-hero__copy">
                        <span className="home-hero__edition">
                            VERSION BETA
                        </span>
                        <h1 className="home-hero__title" aria-label="Conquete">
                            {'CONQUETE'.split('').map((letter, index) => (
                                <span
                                    aria-hidden="true"
                                    key={`${letter}-${index}`}
                                    style={{'--letter-index': index}}
                                >
                                    {letter}
                                </span>
                            ))}
                        </h1>
                    </div>

                    <div className="home-hero__actions">
                        <button
                            type="button"
                            className="home-hero__cta home-hero__cta--local"
                            onClick={onPlayOffline}
                            onMouseEnter={() => setActiveFaction('local')}
                            onMouseLeave={() => setActiveFaction(null)}
                            onFocus={() => setActiveFaction('local')}
                            onBlur={() => setActiveFaction(null)}
                        >
                            <span className="home-hero__cta-copy">
                                <strong>PARTIE LOCALE</strong>
                            </span>
                        </button>
                        <button
                            type="button"
                            className="home-hero__cta home-hero__cta--online"
                            onClick={onPlayOnline}
                            onMouseEnter={() => setActiveFaction('online')}
                            onMouseLeave={() => setActiveFaction(null)}
                            onFocus={() => setActiveFaction('online')}
                            onBlur={() => setActiveFaction(null)}
                        >
                            <span className="home-hero__cta-copy">
                                <strong>JOUER EN LIGNE</strong>
                            </span>
                        </button>
                    </div>
                </div>
            </main>

            <div className="home-content">
                <section className="home-context" aria-labelledby="context-title">
                    <div className="home-context__inner">
                        <header className="home-context__heading">
                            <span>AUX ORIGINES DE CONQUEST</span>
                            <h2 id="context-title">Un royaume à reconquérir</h2>
                            <figure className="home-context__sorcier" aria-hidden="true">
                                <img src="/characters/lvl5/sorceler.png" alt="" />
                            </figure>
                        </header>
                        <p>
                            Conquest prend place dans un royaume fragmenté, où chaque
                            frontière est devenue une promesse de pouvoir. À la tête de
                            votre cité, vous devrez étendre vos terres, renforcer votre
                            économie et faire progresser vos troupes. Les alliances n’y
                            durent qu’un temps, car chaque hexagone conquis rapproche un
                            joueur du trône. Une seule stratégie restera debout lorsque la
                            dernière base ennemie tombera.
                        </p>
                    </div>
                </section>
                <RulesSection />
                <FusionDemo />
                <WikiSection />

                <footer className="home-footer">
                    <div className="home-footer__inner">
                        <div>
                            <strong className="home-footer__brand">CONQUEST</strong>
                            <span className="home-footer__tagline">
                                Stratégie au tour par tour.
                            </span>
                        </div>
                        <span className="home-footer__copyright">
                            © {new Date().getFullYear()} Conquest
                        </span>
                        <a className="home-footer__back" href="#home">
                            Retour en haut <span aria-hidden="true">↑</span>
                        </a>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default HomePage;
