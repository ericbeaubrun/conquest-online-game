import {useEffect, useRef, useState} from 'react';
import WikiSection from '../wiki/WikiSection.jsx';
import FusionDemo from '../demo/FusionDemo.jsx';
import RulesSection from './RulesSection.jsx';

const HERO_PARTICLES = Array.from({length: 18});

const HomePage = ({ onPlayOffline, onPlayOnline, onLogin }) => {
    const [activeFaction, setActiveFaction] = useState(null);
    const heroMotion = useRef({
        currentX: 0,
        currentY: 0,
        targetX: 0,
        targetY: 0,
        frame: null,
        element: null,
        reduceMotion: false,
    });
    const guardianMotion = useRef(null);
    const conquerorMotion = useRef(null);

    useEffect(() => {
        const motion = heroMotion.current;
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const syncPreference = () => {
            motion.reduceMotion = media.matches;
            if (media.matches) {
                motion.currentX = 0;
                motion.currentY = 0;
                motion.targetX = 0;
                motion.targetY = 0;
                if (motion.element) applyHeroMotion(motion.element, 0, 0);
            }
        };

        syncPreference();
        media.addEventListener('change', syncPreference);

        return () => {
            media.removeEventListener('change', syncPreference);
            if (motion.frame != null) cancelAnimationFrame(motion.frame);
        };
    }, []);

    const applyHeroMotion = (element, x, y) => {
        const heroStyle = element.style;
        heroStyle.setProperty('--hero-particles-x', `${(-x * 14).toFixed(2)}px`);
        heroStyle.setProperty('--hero-particles-y', `${(-y * 12).toFixed(2)}px`);

        if (guardianMotion.current) {
            guardianMotion.current.style.transform = `
                translate3d(${(x * 52).toFixed(2)}px, ${(y * 34).toFixed(2)}px, 0)
                rotateX(${(-y * 9).toFixed(2)}deg)
                rotateY(${(x * 12).toFixed(2)}deg)
            `;
        }

        if (conquerorMotion.current) {
            conquerorMotion.current.style.transform = `
                translate3d(${(x * 68).toFixed(2)}px, ${(y * 44).toFixed(2)}px, 0)
                rotateX(${(-y * 10).toFixed(2)}deg)
                rotateY(${(x * 15).toFixed(2)}deg)
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
        const motionScale = motion.reduceMotion ? 0.22 : 1;
        motion.targetX =
            (((event.clientX - bounds.left) / bounds.width) * 2 - 1) * motionScale;
        motion.targetY =
            (((event.clientY - bounds.top) / bounds.height) * 2 - 1) * motionScale;
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
            <header className="home-topbar">
                <div className="home-topbar__inner">
                    <a className="home-topbar__brand" href="#home">
                        CONQUEST
                    </a>
                    <nav className="home-topbar__nav" aria-label="Navigation principale">
                        <a href="#rules-title">Règles</a>
                        <a href="#demo-title">Démo</a>
                        <a href="#wiki-title">Codex</a>
                    </nav>
                    <button
                        type="button"
                        className="menu-btn menu-btn--ghost"
                        onClick={onLogin}
                    >
                        Se connecter
                    </button>
                </div>
            </header>

            <main
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
                            <i aria-hidden="true" />
                            STRATÉGIE · TOUR PAR TOUR
                            <i aria-hidden="true" />
                        </span>
                        <h1 className="home-hero__title" aria-label="Conquest">
                            {'CONQUEST'.split('').map((letter, index) => (
                                <span
                                    aria-hidden="true"
                                    key={letter}
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

                <a className="home-hero__discover" href="#context-title">
                    <span>Découvrir le royaume</span>
                    <span aria-hidden="true">↓</span>
                </a>
            </main>

            <div
                className="home-section-bridge home-section-bridge--hero-context"
                aria-hidden="true"
            />
            <section className="home-context" aria-labelledby="context-title">
                <ul className="home-context__features" aria-label="Caractéristiques principales">
                    <li><span aria-hidden="true">◆</span> 2–8 joueurs</li>
                    <li><span aria-hidden="true">◆</span> En ligne et hors ligne</li>
                    <li><span aria-hidden="true">◆</span> Stratégie sans compromis</li>
                </ul>
                <div className="home-context__inner">
                    <header className="home-context__heading">
                        <span>AUX ORIGINES DE CONQUEST</span>
                        <h2 id="context-title">Un royaume à reconquérir</h2>
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
            <div
                className="home-section-bridge home-section-bridge--context-rules"
                aria-hidden="true"
            />
            <RulesSection />
            <div
                className="home-section-bridge home-section-bridge--rules-demo"
                aria-hidden="true"
            />
            <FusionDemo onPlay={onPlayOffline} />
            <div
                className="home-section-bridge home-section-bridge--demo-wiki"
                aria-hidden="true"
            />
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
    );
};

export default HomePage;
