import {useEffect, useState} from 'react';
import {BEHAVIORS} from '@conquest/shared-engine/data/soldier.js';

// Barre d'actions du soldat sélectionné, posée juste au-dessus des boutons de
// zoom du plateau (même rendu pixel-art, mais teintée à la couleur du joueur).
// Elle remplace le sélecteur minuscule qui vivait dans le panneau du soldat :
// - un bouton ouvre/ferme la boutique de bonus,
// - un bouton « Auto-play » déplie vers le HAUT un bouton par comportement,
//   chacun activant ou désactivant (re-clic) celui du soldat.
// Boutons en texte seul : à cette taille les icônes se lisaient mal.

const ActionBar = ({color, behavior, onSetBehavior, bonusOpen, onToggleBonus, selectionId}) => {
    const [menuOpen, setMenuOpen] = useState(false);

    // Le menu se referme dès qu'on change de soldat (ou qu'on perd la main).
    useEffect(() => {
        setMenuOpen(false);
    }, [selectionId, onSetBehavior]);

    const style = {'--action-color': color};

    return (
        <div className="action-bar" style={style}>
            {/* Comportements dépliés : au-dessus du bouton qui les ouvre. */}
            {menuOpen && onSetBehavior && (
                <div className="action-bar__menu">
                    {BEHAVIORS.map((b) => (
                        <button
                            key={b.id}
                            type="button"
                            className={`action-bar__btn ${behavior === b.id ? 'action-bar__btn--on' : ''}`}
                            // Re-clic sur le comportement actif = on le retire.
                            onClick={() => onSetBehavior(behavior === b.id ? null : b.id)}
                            title={b.label}
                            aria-pressed={behavior === b.id}
                        >
                            <span className="action-bar__label">{b.label}</span>
                        </button>
                    ))}
                </div>
            )}

            {onSetBehavior && (
                <button
                    type="button"
                    className={`action-bar__btn action-bar__btn--icon ${menuOpen ? 'action-bar__btn--on' : ''}`}
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-expanded={menuOpen}
                    title="Auto-play : comportement automatique du soldat"
                >
                    <img src="/characters/comportement.png" alt="" draggable={false}/>
                    {/* Libellé masqué au repos (déplié au survol, voir la feuille
                        de style) : la barre reste discrète sur le plateau. */}
                    <span className="action-bar__label">Auto-play</span>
                    {/* La flèche indique le sens du dépliage : vers le haut quand
                        le menu est fermé, refermée vers le bas quand il est ouvert. */}
                    <span className="action-bar__arrow" aria-hidden="true">{menuOpen ? '▼' : '▲'}</span>
                </button>
            )}

            {onToggleBonus && (
                <button
                    type="button"
                    className={`action-bar__btn action-bar__btn--icon ${bonusOpen ? 'action-bar__btn--on' : ''}`}
                    onClick={onToggleBonus}
                    aria-expanded={bonusOpen}
                    title="Améliorations"
                >
                    <img src="/etoilePleine.png" alt="" draggable={false}/>
                    <span className="action-bar__label">Améliorations</span>
                </button>
            )}

            {/* Aide : placeholder tant que le wiki n'existe pas. Affiché (et
                signalé comme à venir) pour que sa place soit déjà prise. */}
            <button
                type="button"
                className="action-bar__btn action-bar__btn--icon action-bar__btn--soon"
                onClick={() => {}}
                title="Aide (bientôt disponible)"
            >
                <span className="action-bar__glyph" aria-hidden="true">?</span>
                <span className="action-bar__label">Aide</span>
            </button>
        </div>
    );
};

export default ActionBar;
