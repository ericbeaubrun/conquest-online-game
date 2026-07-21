import {useEffect, useState} from 'react';
import {
    affinityLabel,
    atkRankLabel,
    behaviorLabel,
    BEHAVIORS,
    bonusOffersForLevel,
    canBuyBonus,
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
// Nombre de bonus immédiatement achetables pour ce soldat (défi accompli, or
// suffisant, aucun autre bonus déjà équipé) : sert de pastille sur le bouton
// « Bonus » pour signaler qu'il y a quelque chose à y faire.
const buyableBonusCount = (soldier, settings, gold, canBuy, world) => {
    if (!canBuy) return 0;
    return bonusOffersForLevel(soldier.level || 1)
        .filter((b) => settings?.bonusEnabled?.[b.id] !== false)
        .filter((b) => canBuyBonus(soldier, b, gold, settings, world))
        .length;
};

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

    const buyable = noBonusShop ? 0 : buyableBonusCount(soldier, settings, gold, canBuy, world);

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

            {/* Corps : portrait à gauche, titre + caractéristiques à droite. */}
            <div className="soldier-panel__body">
                {/* Colonne portrait : portrait, et sous lui le bandeau atk/PV
                    (même objet que sur le plateau) — la lecture reste la même
                    que lorsqu'on regarde l'unité sur la carte. */}
                <div className="soldier-panel__portrait-col">
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
                    <div className="soldier-panel__stats">
                        <AtkValue atk={soldier.atk}/>
                        <HpValue hp={soldier.hp}/>
                    </div>
                </div>

                {/* Colonne principale : identité (étoiles + rang/race), bouton
                    bonus, puis les caractéristiques. */}
                <div className="soldier-panel__main">
                    <div className="soldier-panel__head">
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
                        {DEV_CONFIG.showAtkRankLabel && (
                            <span className="soldier-panel__atk-rank">
                                {atkRankLabel(soldier.atk, SOLDIER_ATK_MAX)}{' '}
                                <span className="soldier-panel__atk-race">
                                    {raceLabel(soldier)}
                                </span>
                            </span>
                        )}
                    </div>

                    {/* Ouverture de la boutique de bonus (le portrait le fait
                        aussi) : le compteur annonce les bonus achetables tout
                        de suite, sans avoir à ouvrir le panneau. */}
                    {!noBonusShop && (
                        <button
                            type="button"
                            className={`soldier-panel__bonus-btn ${bonusOpen ? 'soldier-panel__bonus-btn--active' : ''}`}
                            onClick={() => setBonusOpen((v) => !v)}
                            aria-expanded={bonusOpen}
                        >
                            Bonus
                            {buyable > 0 && (
                                <span className="soldier-panel__bonus-count">{buyable}</span>
                            )}
                        </button>
                    )}

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
                                {/* Soldat du joueur actif pendant son tour : un seul
                                    sélecteur (« Choisir » = aucun comportement) au lieu
                                    d'une rangée de boutons, bien plus compact.
                                    Sinon, simple libellé informatif. */}
                                {onSetBehavior ? (
                                    <select
                                        className={`behavior-select ${soldier.behavior ? 'behavior-select--active' : ''}`}
                                        value={soldier.behavior || ''}
                                        onChange={(e) => onSetBehavior(e.target.value || null)}
                                        title="Pilote automatique du soldat"
                                    >
                                        <option value="">Choisir…</option>
                                        {BEHAVIORS.map((b) => (
                                            <option key={b.id} value={b.id}>{b.label}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <span className="soldier-spec__value">{behaviorLabel(soldier.behavior)}</span>
                                )}
                            </div>
                            <UpkeepSpec unit={soldier} owner={owner} settings={settings} label="Entretien"/>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SoldierPanel;
