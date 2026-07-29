import {useLayoutEffect, useRef} from 'react';
import {incomeFor, movableSoldierCount, playerAlive} from '@conquest/shared-engine/engine/selectors.js';

const displayName = (player) => player.name;

// Barre du haut : menu, numéro de tour, chrono, profils des joueurs (nom, or et
// revenu) et bouton de fin de tour. Purement présentationnelle.
//
// Trois zones : contexte à gauche (burger, tour + chrono), joueurs au centre,
// action à droite (recommencer son tour, soldats restants, fin de tour). Une
// seule cible encadrée et colorée dans toute la barre — le bouton de fin de
// tour ; cf. _topbar.scss.
//
// Un joueur ÉLIMINÉ (plus aucune case ni soldat, cf. `playerAlive`) est grisé et
// marqué d'une croix ; en ligne, le joueur local porte une couronne au-dessus de
// son carré de couleur.
const TopBar = ({
                    state,
                    localPlayerId,
                    online,
                    turnTimer,
                    timeLeft,
                    canAct,
                    menuOpen,
                    onToggleMenu,
                    onEndTurn,
                    onResetTurn,
                    canResetTurn,
                }) => {
    const {players, activePlayerId, gold} = state;
    const activeColor = players.find((p) => p.id === activePlayerId)?.color;
    const movableSoldiers = movableSoldierCount(state, activePlayerId);

    // Libellé de survol d'un profil : l'état prime sur le simple nom. Sert aussi
    // de repli quand le nom est tronqué par l'ellipse (cf. __name).
    const profileTitle = (player, alive) => {
        const name = displayName(player);
        if (!alive) return `${name} — éliminé`;
        if (player.id === activePlayerId) return `Au tour de ${name}`;
        return name;
    };

    // Hauteur réelle de la barre, exposée en variable CSS globale : elle varie
    // selon la taille d'écran (passe sur 2 lignes en mobile, cf. _topbar.scss),
    // le tiroir latéral (SideMenu) s'en sert pour ne jamais commencer sous la
    // barre (voir --topbar-height dans _layout.scss).
    const topBarRef = useRef(null);
    useLayoutEffect(() => {
        const el = topBarRef.current;
        if (!el) return;
        const update = () => {
            document.documentElement.style.setProperty('--topbar-height', `${el.offsetHeight}px`);
        };
        update();
        // ResizeObserver couvre les changements de contenu (nombre de joueurs,
        // etc.) ; l'écouteur `resize` sert de filet pour le changement de
        // palier responsive (rotation d'écran, redimensionnement de fenêtre).
        const ro = new ResizeObserver(update);
        ro.observe(el);
        window.addEventListener('resize', update);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', update);
        };
    }, []);

    return (
        <div className="top-bar" ref={topBarRef}>
            <button
                type="button"
                className={`burger-menu ${menuOpen ? 'burger-menu--open' : ''}`}
                onClick={onToggleMenu}
                aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                aria-expanded={menuOpen}
                title={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            >
                {menuOpen ? '✕' : '☰'}
            </button>

            {/* Le numéro de tour est passé dans le tiroir latéral (SideMenu) : il
                ne reste ici que le chrono, qui lui se surveille en continu. */}
            {turnTimer > 0 && (
                <div
                    className={`turn-counter turn-timer ${timeLeft <= 5 ? 'turn-timer--low' : ''}`}
                    title="Temps restant pour ce tour"
                >
                    {Math.max(0, timeLeft)}s
                </div>
            )}

            {online && !localPlayerId && (
                <div className="spectator-tag" title="Vous n'avez pas de siège dans cette partie">
                    SPECTATEUR
                </div>
            )}

            {/* Le nombre de joueurs pilote la largeur max des noms (cf. --name-ch
                dans _topbar.scss) : à 2 joueurs la place ne manque pas, à 4 chaque
                caractère compte. Passé en variable CSS plutôt que déduit en CSS par
                `:has()`, qui exclurait les navigateurs d'avant fin 2022. */}
            <div className="players-info" style={{'--player-count': players.length}}>
                {players.map((player) => {
                    const alive = playerAlive(state, player.id);
                    const isLocal = online && player.id === localPlayerId;
                    const isActive = alive && player.id === activePlayerId;
                    const classes = [
                        'player-profile',
                        // L'élimination prime sur le tour actif (états incohérents transitoires).
                        !alive ? 'player-profile--eliminated' : '',
                        isActive ? 'player-profile--active' : '',
                        isLocal ? 'player-profile--local' : '',
                    ].filter(Boolean).join(' ');
                    const income = incomeFor(state, player.id);
                    return (
                        <div
                            className={classes}
                            key={player.id}
                            title={profileTitle(player, alive)}
                            // Liseré à la couleur du joueur actif, autour de son
                            // cadre noir : seul signal du tour en cours. Ombre
                            // NON floue — un flou casserait le rendu pixel.
                            //
                            // Deux couches : un anneau de 1px à la couleur DU FOND
                            // de la barre s'intercale entre le cadre noir et le
                            // liseré coloré, pour que celui-ci ne soit pas collé au
                            // cadre. C'est le « liseré double bordure » pixel déjà
                            // employé dans _panels.scss, et le décollement rend la
                            // couleur du joueur bien plus lisible.
                            //
                            // 3px de débord total, à tenir dans le padding de
                            // .players-info (4px) : ce conteneur rogne, et la place
                            // verticale dans la barre est comptée. Épaissir l'un
                            // sans l'autre fait réapparaître le liseré coupé.
                            style={isActive
                                ? {boxShadow: `0 0 0 1px var(--ink-900), 0 0 0 3px ${player.color}`}
                                : undefined}
                        >
                            {/* Couronne « c'est vous » : à côté du carré plutôt que
                                posée dessus. */}
                            {isLocal && (
                                <img src="/crown.png" alt="Vous" className="player-profile__crown"/>
                            )}
                            <div
                                className="player-profile__chip"
                                style={{backgroundColor: player.color}}
                            >
                                {!alive && (
                                    <img
                                        src="/croix.png"
                                        alt="Éliminé"
                                        className="player-profile__badge player-profile__badge--dead"
                                    />
                                )}
                            </div>
                            {/* Nom au-dessus, or et revenu dessous : la colonne est
                                nettement moins large que la même information sur une
                                seule ligne, au prix de quelques pixels de hauteur. */}
                            <div className="player-profile__col">
                                <span className="player-profile__name">{displayName(player)}</span>
                                {/* Un joueur éliminé n'a plus ni or utile ni revenu : on masque ses stats. */}
                                {alive && (
                                    <div className="player-stats">
                                        <div className="stat stat--gold" title="Or en réserve">
                                            <img src="/coin.png" alt="or" className="stat__coin"/>
                                            {gold[player.id] ?? 0}
                                        </div>
                                        {/* Revenu entre parenthèses : il se lit comme une
                                            précision sur l'or qui précède, et non comme
                                            un second nombre indépendant. */}
                                        <div
                                            className={`stat ${income > 0 ? 'stat--positive' : 'stat--negative'}`}
                                            title="Or gagné par tour"
                                        >
                                            ({income > 0 ? '+' : ''}{income})
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Zone d'action, à droite : recommencer le tour puis le terminer,
                dans l'ordre où ils se posent (« je me suis trompé » avant « j'ai
                fini »). Le retour arrière reste volontairement discret — sans
                cadre ni couleur — pour que la fin de tour demeure la seule cible
                mise en avant de toute la barre. */}
            <div className="top-bar__actions">
                {/* Affiché seulement quand il y a quelque chose à annuler : un
                    bouton grisé en permanence encombrerait la barre pour rien. */}
                {canResetTurn && (
                    <button
                        type="button"
                        className="reset-turn-button"
                        onClick={onResetTurn}
                        title="Recommencer ce tour — annule toutes vos actions depuis le début du tour"
                        aria-label="Recommencer ce tour"
                    >
                        <span className="reset-turn-button__glyph" aria-hidden="true">↺</span>
                    </button>
                )}

                {/* Soldats restants et fin de tour fusionnés : les deux répondent à
                    la même question — « ai-je fini mon tour ? » — et le compteur sert
                    d'avertissement juste avant de cliquer. Le libellé « FIN » saute,
                    les deux icônes suffisent à porter le sens. */}
                <button
                    className="end-turn-button"
                    style={{backgroundColor: activeColor}}
                    title={
                        canAct
                            ? `Passer son tour — ${movableSoldiers} soldat(s) encore déplaçable(s)`
                            : 'En attente du tour adverse'
                    }
                    onClick={onEndTurn}
                    disabled={!canAct}
                >
                    <img src="/characters/lvl1/SoldierLVL1.png" alt="Soldats restants" className="end-turn-button__icon end-turn-button__icon--soldier"/>
                    <span className="end-turn-button__count">{movableSoldiers}</span>
                    {/* Flèche de fin de tour : plus grande que l'indicateur de
                        mouvements restants, c'est elle qui porte l'action, le
                        compteur ne fait qu'informer. */}
                    <img
                        src="/skip.png"
                        alt=""
                        aria-hidden="true"
                        className="end-turn-button__arrow"
                    />
                </button>
            </div>
        </div>
    );
};

export default TopBar;
