import {useEffect, useState} from 'react';
import {
    affinityLabel,
    atkRankLabel,
    behaviorLabel,
    BEHAVIORS,
    bonusOffersForLevel,
    hasUnlockedBonus,
    isBonusUnlocked,
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
// Nombre de bonus DÉBLOQUÉS pour ce soldat (défi accompli, aucun autre bonus
// déjà équipé) : sert de pastille « UPGRADE » sur le portrait pour signaler
// qu'il y a quelque chose à y faire. L'or n'entre PAS en compte — un bonus
// débloqué mais trop cher reste un objectif à afficher.
const unlockedBonusCount = (soldier, settings, canBuy, world) => {
    if (!canBuy || soldier.bonus) return 0;
    return bonusOffersForLevel(soldier.level || 1)
        .filter((b) => settings?.bonusEnabled?.[b.id] !== false)
        .filter((b) => isBonusUnlocked(soldier, b, settings, world))
        .length;
};

const SoldierPanel = ({soldier, color, canBuy = false, gold = 0, onBuyBonus, onSetBehavior, selectionId, settings, bonusesEnabled = true, world, onClose, bonusOpen: bonusOpenProp, onToggleBonus}) => {
    const level = soldier.level || 1;
    // Pas de boutique de bonus pour une unité invoquée (squelette, arbre-druide),
    // ni quand les bonus sont désactivés en configuration : le portrait n'ouvre
    // alors rien.
    const skeleton = isSkeleton(soldier);
    const summoned = isSummonedUnit(soldier);
    const noBonusShop = summoned || !bonusesEnabled;
    // Un bonus est débloqué (défi accompli) et pas encore réclamé : notification.
    const notify = hasUnlockedBonus(soldier, settings, bonusesEnabled, world);

    const upgradable = noBonusShop ? 0 : unlockedBonusCount(soldier, settings, canBuy, world);

    // Boutique repliée par défaut, et refermée à chaque changement de soldat.
    // L'ouverture peut être PILOTÉE de l'extérieur (barre d'actions) : dans ce
    // cas l'état local n'est plus utilisé.
    const [localOpen, setLocalOpen] = useState(false);
    const controlled = typeof onToggleBonus === 'function';
    const bonusOpen = controlled ? !!bonusOpenProp : localOpen;
    const setBonusOpen = controlled ? onToggleBonus : setLocalOpen;
    useEffect(() => {
        setLocalOpen(false);
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
                        {/* Invite à ouvrir la boutique de bonus, en bas du portrait,
                            avec le nombre de bonus débloqués. N'apparaît que si au
                            moins un bonus l'est. */}
                        {upgradable > 0 && (
                            <span className="soldier-panel__upgrade-badge">
                                UPGRADE <span className="soldier-panel__upgrade-count">{upgradable}</span>
                            </span>
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
                                {/* Le choix se fait principalement dans la barre
                                    d'actions posée au-dessus des contrôles du plateau
                                    (`ActionBar`) ; ce sélecteur reste disponible ici en
                                    secours. Sinon, simple libellé informatif. */}
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
                            <UpkeepSpec unit={soldier} settings={settings} label="Entretien"/>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SoldierPanel;
