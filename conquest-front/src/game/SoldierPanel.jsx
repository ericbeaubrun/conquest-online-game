import {useEffect, useState} from 'react';
import {
    affinityLabel,
    atkRankLabel,
    behaviorLabel,
    BEHAVIORS,
    hasUnlockedBonus,
    isSkeleton,
    isSummonedUnit,
    raceLabel,
    soldierSprite,
} from '@conquest/shared-engine/data/soldier.js';
import {SOLDIER_ATK_MAX} from '@conquest/shared-engine/engine/rules.js';
import {DEV_CONFIG} from '../config/devConfig.js';
import {AFFINITY_SRC} from './board/constants.js';
import {AtkValue, HpValue} from './StatDisplays.jsx';
import BonusPanel from './BonusPanel.jsx';
import UpkeepSpec from './UpkeepSpec.jsx';

// Menu des caractéristiques du soldat sélectionné. Prend la place de la
// boutique en bas de l'écran tant qu'un soldat est sélectionné. Son portrait
// fait office de bouton : il ouvre la boutique de bonus (`BonusPanel`) au-dessus.
// `world` est l'état de jeu : les défis d'état (arbres, maisons, bonus présents
// sur le plateau) s'y lisent en direct, à chaque rendu.
const SoldierPanel = ({soldier, color, owner, canBuy = false, gold = 0, onBuyBonus, onSetBehavior, selectionId, settings, bonusesEnabled = true, world, onClose}) => {
    const level = soldier.level || 1;
    // Pas de boutique de bonus pour une unité invoquée (squelette, arbre-druide),
    // ni quand les bonus sont désactivés en configuration : le portrait n'ouvre
    // alors rien.
    const skeleton = isSkeleton(soldier);
    const summoned = isSummonedUnit(soldier);
    const noBonusShop = summoned || !bonusesEnabled;
    // Un bonus est débloqué (défi accompli) et pas encore réclamé : notification.
    const notify = hasUnlockedBonus(soldier, settings, bonusesEnabled, world);

    // Boutique repliée par défaut, et refermée à chaque changement de soldat.
    const [bonusOpen, setBonusOpen] = useState(false);
    useEffect(() => {
        setBonusOpen(false);
    }, [selectionId, noBonusShop]);

    return (
        <div className="soldier-panel">
            {onClose && (
                <button
                    type="button"
                    className="soldier-panel__close"
                    onClick={onClose}
                    aria-label="Fermer"
                    title="Fermer"
                >
                    <img src="/croix.png" alt="" draggable={false} />
                </button>
            )}
            {bonusOpen && !noBonusShop && (
                <BonusPanel
                    soldier={soldier}
                    selectionId={selectionId}
                    settings={settings}
                    bonusesEnabled={bonusesEnabled}
                    gold={gold}
                    canBuy={canBuy}
                    world={world}
                    onBuy={onBuyBonus}
                    onClose={() => setBonusOpen(false)}
                />
            )}

            {/* Colonne portrait : étoiles de niveau (1 à 5) au-dessus du portrait. */}
            <div className="soldier-panel__portrait-col">
                <div className="soldier-panel__level-stars">
                    {Array.from({length: 5}, (_, i) => (
                        <img
                            key={i}
                            src={i < level ? '/etoilePleine.png' : '/etoileVide.png'}
                            alt=""
                            className="soldier-panel__level-star"
                        />
                    ))}
                </div>
                <button
                    type="button"
                    className={`soldier-panel__portrait ${bonusOpen ? 'soldier-panel__portrait--active' : ''}`}
                    style={{borderColor: color}}
                    onClick={() => !noBonusShop && setBonusOpen((v) => !v)}
                    aria-expanded={noBonusShop ? undefined : bonusOpen}
                    disabled={noBonusShop}
                    title={summoned ? (skeleton ? 'Squelette invoqué' : 'Unité invoquée') : bonusesEnabled ? 'Voir les bonus' : 'Bonus désactivés'}
                >
                    <img src={soldierSprite(soldier)} alt={summoned ? (skeleton ? 'Squelette' : 'Unité invoquée') : 'Soldat'}/>
                    {DEV_CONFIG.showSoldierPanelLevel && (
                        <span className="soldier-panel__level">LVL {level}</span>
                    )}
                    {/* Notification : un bonus est débloqué et attend d'être réclamé. */}
                    {notify && (
                        <img src="/notif.png" alt="Bonus débloqué" className="soldier-panel__notif"/>
                    )}
                </button>
            </div>

            <div className="soldier-panel__stats">
                {DEV_CONFIG.showAtkRankLabel && (
                    <span className="soldier-panel__atk-rank">
                        {atkRankLabel(soldier.atk, SOLDIER_ATK_MAX)}{' '}
                        <span className="soldier-panel__atk-race">
                            {raceLabel(soldier)}
                        </span>
                    </span>
                )}
                <AtkValue atk={soldier.atk}/>
                <HpValue hp={soldier.hp}/>
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
                    {/* Soldat du joueur actif pendant son tour : boutons de
                        sélection (re-cliquer le comportement actif le retire).
                        Sinon, simple libellé informatif. */}
                    {onSetBehavior ? (
                        <span className="soldier-spec__behaviors">
                            {BEHAVIORS.map((b) => {
                                const active = soldier.behavior === b.id;
                                return (
                                    <button
                                        key={b.id}
                                        type="button"
                                        className={`behavior-btn ${active ? 'behavior-btn--active' : ''}`}
                                        title={active ? `${b.label} (cliquer pour retirer)` : b.label}
                                        onClick={() => onSetBehavior(active ? null : b.id)}
                                    >
                                        {b.label}
                                    </button>
                                );
                            })}
                        </span>
                    ) : (
                        <span className="soldier-spec__value">{behaviorLabel(soldier.behavior)}</span>
                    )}
                </div>
                <UpkeepSpec unit={soldier} owner={owner} settings={settings}/>
            </div>
        </div>
    );
};

export default SoldierPanel;
