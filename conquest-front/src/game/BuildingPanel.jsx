import { useMemo } from 'react';
import { ITEM_SRC } from '@conquest/shared-engine/data/items.js';
import { getLogicalBoard } from '@conquest/shared-engine/engine/board.js';
import {
    incomeFor,
    ownedCount,
    playerAlive,
} from '@conquest/shared-engine/engine/selectors.js';
import { DOMINATION_PERCENT, ECONOMY_GOAL } from '@conquest/shared-engine/engine/settings.js';
import { AtkValue, HpValue } from './StatDisplays.jsx';
import UpkeepSpec from './UpkeepSpec.jsx';

// Libellé et image par type de bâtiment. La base n'est pas un item de boutique :
// elle a sa propre image et n'apparaît pas dans `ITEM_SRC`.
const LABEL = {
    base: 'Base',
    house: 'Maison',
    attackTower: "Tour d'attaque",
    defenseTower: 'Tour de défense',
};
const SRC = { base: '/base.png', ...ITEM_SRC };

// Ordinal français court pour le classement territorial (1er, 2e, 3e…).
const ordinal = (rank) => (rank === 1 ? '1er' : `${rank}e`);
// « 1 case », « 3 cases » : accord du pluriel (0 reste au singulier en français).
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

// Portrait de l'empire dont la base est sélectionnée. La base est la seule
// construction qui représente un JOUEUR et non un simple bâtiment : son panneau
// se lit comme une fiche de puissance (territoire, armée, économie, objectif de
// victoire) plutôt que comme une fiche d'unité, autrement quasi vide.
//
// Tout est dérivé de l'état — aucune règle n'est réécrite : les compteurs
// passent par les sélecteurs du moteur partagé.
function empireStats(world, playerId) {
    const board = getLogicalBoard(world.mapId);
    const playable = board.cells.filter((c) => !c.blocked).length || 1;
    const tiles = ownedCount(world, playerId);

    // Un seul parcours des placements pour l'armée et les constructions.
    let soldiers = 0;
    let armyPower = 0;
    let houses = 0;
    let towers = 0;
    for (const placed of world.placements.values()) {
        if (placed.playerId !== playerId) continue;
        if (placed.type === 'soldier') {
            soldiers += 1;
            armyPower += placed.level || 1;
        } else if (placed.type === 'house') houses += 1;
        else if (placed.type === 'attackTower' || placed.type === 'defenseTower') towers += 1;
    }

    // Classement territorial parmi les joueurs ENCORE EN VIE : un joueur éliminé
    // ne dispute plus la carte, le compter fausserait le « sur N ».
    const alive = world.players.filter((p) => playerAlive(world, p.id));
    const ahead = alive.filter((p) => ownedCount(world, p.id) > tiles).length;

    return {
        tiles,
        share: Math.round((tiles / playable) * 100),
        rank: ahead + 1,
        contenders: alive.length,
        soldiers,
        armyPower,
        houses,
        towers,
        gold: world.gold?.[playerId] ?? 0,
        income: incomeFor(world, playerId),
    };
}

// Ligne « objectif » : ce qu'il reste à faire pour gagner, selon le mode de
// victoire de la partie. Renvoie {label, value, progress} — `progress` (0..1)
// n'existe que pour les modes à seuil, qui affichent une jauge.
function victorySpec(world, stats) {
    const s = world.settings || {};
    if (s.victoryMode === 'domination') {
        const goal = s.dominationPercent ?? DOMINATION_PERCENT;
        return {
            label: 'Domination',
            value: `${stats.share} / ${goal} %`,
            progress: stats.share / goal,
        };
    }
    if (s.victoryMode === 'economy') {
        const goal = s.economyGoal ?? ECONOMY_GOAL;
        return {
            label: "Course à l'or",
            value: `${stats.gold} / ${goal}`,
            progress: stats.gold / goal,
        };
    }
    return {
        label: 'Élimination',
        value: stats.contenders > 1 ? `${stats.contenders} empires en lice` : 'Dernier debout',
        progress: null,
    };
}

// Menu des caractéristiques d'un bâtiment (base, maison, tour) sélectionné.
// Prend la place de la boutique, comme le panneau du soldat : image + barre de
// vie. Purement informatif — aucune action possible depuis ce panneau.
// Pour une BASE, `world` (l'état de jeu) alimente en plus la fiche du joueur
// propriétaire ; sans lui on retombe sur la fiche minimale du bâtiment.
const BuildingPanel = ({ building, color, owner, world, localPlayerId, settings, onClose }) => {
    const isBase = building.type === 'base';
    const stats = useMemo(
        () => (isBase && world && building.playerId ? empireStats(world, building.playerId) : null),
        [isBase, world, building.playerId]
    );
    const goal = stats ? victorySpec(world, stats) : null;

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
            <div className="soldier-panel__body">
                {/* Même gabarit que le panneau soldat : image puis bandeau de stats
                    dessous, titre et caractéristiques à droite. */}
                <div className="soldier-panel__portrait-col">
                    <div className="soldier-panel__portrait" style={{ borderColor: color }}>
                        <img src={SRC[building.type]} alt={LABEL[building.type]} />
                    </div>
                    <div className="soldier-panel__stats">
                        {building.atk != null && <AtkValue atk={building.atk} uncapped/>}
                        <HpValue hp={building.hp} uncapped/>
                    </div>
                </div>

                <div className="soldier-panel__main">
                    <div className="soldier-panel__head">
                        <span className="soldier-panel__atk-rank">{LABEL[building.type]}</span>
                        {/* Propriétaire : carré de couleur + nom, même lecture que
                            les profils de la barre du haut. Le « IA » est inscrit
                            dans le carré, comme là-bas. */}
                        {owner && (
                            <span className="building-owner" title={`Base de ${owner.name}`}>
                                <span className="building-owner__chip" style={{ backgroundColor: owner.color }} />
                                <span className="building-owner__name">{owner.name}</span>
                                {localPlayerId && owner.id === localPlayerId && (
                                    <span className="building-owner__you">VOUS</span>
                                )}
                            </span>
                        )}
                    </div>

                    {/* Base : fiche de l'empire, sur deux colonnes pour tenir en
                        hauteur. Autres bâtiments : la seule ligne d'entretien. */}
                    {stats ? (
                        <div className="soldier-panel__specs soldier-panel__specs--wide">
                            <div className="soldier-spec">
                                <span className="soldier-spec__label">Territoire</span>
                                <span className="soldier-spec__value">
                                    {plural(stats.tiles, 'case')} <span className="soldier-spec__hint">({stats.share} %)</span>
                                </span>
                            </div>
                            <div className="soldier-spec">
                                <span className="soldier-spec__label">Rang</span>
                                <span className="soldier-spec__value">
                                    {ordinal(stats.rank)} <span className="soldier-spec__hint">sur {stats.contenders}</span>
                                </span>
                            </div>
                            <div className="soldier-spec">
                                <span className="soldier-spec__label">Armée</span>
                                <span className="soldier-spec__value">
                                    {plural(stats.soldiers, 'soldat')} <span className="soldier-spec__hint">({stats.armyPower} ★)</span>
                                </span>
                            </div>
                            <div className="soldier-spec">
                                <span className="soldier-spec__label">Constructions</span>
                                <span className="soldier-spec__value">
                                    {plural(stats.houses, 'maison')} <span className="soldier-spec__hint">·</span> {plural(stats.towers, 'tour')}
                                </span>
                            </div>
                            <div className="soldier-spec">
                                <span className="soldier-spec__label">Trésor</span>
                                <span className="soldier-spec__value">
                                    {stats.gold} <img src="/coin.png" alt="or" className="coin-icon"/>
                                    <span className={`soldier-spec__hint ${stats.income > 0 ? 'soldier-spec__hint--gain' : 'soldier-spec__hint--cost'}`}>
                                        ({stats.income > 0 ? '+' : ''}{stats.income} / tour)
                                    </span>
                                </span>
                            </div>

                            {/* Objectif de victoire, juste sous le trésor (même
                                colonne) : le seul élément qui parle de la partie et
                                non du joueur, avec sa jauge de progression quand le
                                mode a un seuil. */}
                            <div className="empire-goal">
                                <span className="soldier-spec__label">{goal.label}</span>
                                <span className="empire-goal__value">
                                    {goal.progress != null && (
                                        <span className="empire-goal__bar">
                                            <span
                                                className="empire-goal__fill"
                                                style={{
                                                    width: `${Math.min(100, Math.round(goal.progress * 100))}%`,
                                                    backgroundColor: owner?.color || color,
                                                }}
                                            />
                                        </span>
                                    )}
                                    {goal.value}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="soldier-panel__specs">
                            <UpkeepSpec unit={building} settings={settings} label="Entretien" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BuildingPanel;
