// Couches « unités » du plateau : bases, items posés (soldats, maisons, tours),
// notifications de bonus et aperçu de pose. Les nombres d'attaque / de vie ne
// sont dessinés que sur les cases listées dans `visibleStatIds` (case survolée,
// soldat sélectionné et ses cibles).
import {memo} from 'react';
import {soldierSkin, soldierSprite, hasUnlockedBonus} from '@conquest/shared-engine/data/soldier.js';
import {BUILDING_STATS} from '@conquest/shared-engine/engine/rules.js';
import {
    AFFINITY_SRC,
    BASE_SCALE,
    BASE_SRC,
    NOTIF_SRC,
    PLACEMENT_SRC,
    formatStatValue,
    placementImgSize,
} from './constants.js';

// Nombres d'attaque / points de vie aux coins d'une unité : attaque en haut à
// droite, vie en bas à droite. `atk` à `null` n'affiche aucun nombre d'attaque
// (ex. la base, qui n'attaque pas). `box` est la demi-largeur de référence : la
// case pour les bâtiments (les tours, dessinées plus grandes que leur case,
// gardent ainsi leurs nombres dans la case), le sprite pour les soldats.
const StatCornerLabels = ({cx, cy, size, box, atk, hp, atkYOffset = 0.1, hpYOffset = 0.11, hpXOffset = 0.16}) => {
    const half = (box ?? size) / 2;
    return (
        <>
            {atk != null && (
                <text
                    x={cx + half - size * 0.16}
                    y={cy - half + size * atkYOffset}
                    textAnchor="end"
                    className="soldier-stat-label"
                    style={{fontSize: size * 0.19}}
                >
                    <tspan className="soldier-stat-label__atk">{formatStatValue(atk)}</tspan>
                </text>
            )}
            <text
                x={cx + half - size * hpXOffset}
                y={cy + half + size * hpYOffset}
                textAnchor="end"
                className="soldier-stat-label"
                style={{fontSize: size * 0.19}}
            >
                <tspan className="soldier-stat-label__hp">{formatStatValue(hp)}</tspan>
            </text>
        </>
    );
};

// Bases, dessinées au-dessus des cases. Une base détruite (assiégée jusqu'à
// 0 PV) disparaît : sa case redevient une case normale.
export const Bases = memo(function Bases({baseCells, size, destroyedBases, baseHp, visibleStatIds}) {
    const s = size * BASE_SCALE;
    return baseCells
        .filter((cell) => !destroyedBases?.has(cell.id))
        .map((cell) => (
            <g key={cell.id}>
                <image
                    href={BASE_SRC}
                    x={cell.cx - s / 2}
                    y={cell.cy - s / 2}
                    width={s}
                    height={s}
                    style={{imageRendering: 'pixelated'}}
                    pointerEvents="none"
                />
                {visibleStatIds.has(cell.id) && (
                    <StatCornerLabels
                        cx={cell.cx}
                        cy={cell.cy}
                        size={size}
                        atk={null}
                        hp={baseHp?.[cell.id] ?? BUILDING_STATS.base.hp}
                        hpYOffset={-0.05}
                        hpXOffset={0.2}
                    />
                )}
            </g>
        ));
});

// Items posés (soldats, maisons, tours). Le niveau d'un soldat se lit à son
// sprite (skin par niveau) plutôt qu'à un badge numérique.
export const Buildings = memo(function Buildings({placements, cellMap, size, visibleStatIds}) {
    // Géométrie de repère pour l'icône d'affinité, calée sur la barre de vie.
    const barW = size * 0.6;
    const barH = size * 0.11;
    return [...placements.entries()].map(([id, placed]) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        const isSoldier = placed.type === 'soldier';
        const isBuilding = BUILDING_STATS[placed.type] != null && !isSoldier;
        const imgSize = placementImgSize(placed.type, size);
        const showStats = visibleStatIds.has(id);
        return (
            <g key={id} pointerEvents="none">
                <image
                    href={isSoldier ? soldierSprite(placed) : PLACEMENT_SRC[placed.type]}
                    x={cell.cx - imgSize / 2}
                    y={cell.cy - imgSize / 2}
                    width={imgSize}
                    height={imgSize}
                    style={{imageRendering: 'pixelated'}}
                    // Sprites orientés à droite par défaut : miroir horizontal
                    // (autour du centre de la case) quand le soldat regarde à gauche.
                    transform={isSoldier && placed.facing === 'left'
                        ? `translate(${2 * cell.cx} 0) scale(-1 1)`
                        : undefined}
                />
                {isSoldier && AFFINITY_SRC[placed.affinity] && (
                    <image
                        href={AFFINITY_SRC[placed.affinity]}
                        x={cell.cx - barW / 2 - barH * 0.8}
                        y={cell.cy + size * 0.49 - barH * 1.6}
                        width={barH * 1.6}
                        height={barH * 1.6}
                        style={{imageRendering: 'pixelated'}}
                    />
                )}
                {showStats && isBuilding && (
                    <StatCornerLabels
                        cx={cell.cx}
                        cy={cell.cy}
                        size={size}
                        atk={BUILDING_STATS[placed.type]?.atk ?? null}
                        hp={placed.hp ?? 0}
                    />
                )}
                {showStats && isSoldier && (
                    <StatCornerLabels
                        cx={cell.cx}
                        cy={cell.cy}
                        size={size}
                        box={imgSize}
                        atk={placed.atk ?? 0}
                        hp={placed.hp ?? 0}
                        atkYOffset={0.13}
                        hpYOffset={0.08}
                    />
                )}
            </g>
        );
    });
});

// Pastille `notif.png` posée en haut à gauche de tout soldat DU JOUEUR ACTIF
// ayant un bonus débloqué à réclamer (défi accompli, aucun bonus encore
// équipé) : elle disparaît dès que son tour est passé.
export const BonusNotifications = memo(function BonusNotifications({
                                                                       placements,
                                                                       cellMap,
                                                                       size,
                                                                       settings,
                                                                       bonusesEnabled,
                                                                       activePlayerId,
                                                                   }) {
    const badge = size * 0.3;
    return [...placements.entries()].map(([id, placed]) => {
        if (placed.type !== 'soldier' || placed.playerId !== activePlayerId) return null;
        if (!hasUnlockedBonus(placed, settings, bonusesEnabled)) return null;
        const cell = cellMap.get(id);
        if (!cell) return null;
        return (
            <image
                key={'notif' + id}
                href={NOTIF_SRC}
                x={cell.cx - size * 0.3 - badge / 2}
                y={cell.cy - size * 0.3 - badge / 2}
                width={badge}
                height={badge}
                style={{imageRendering: 'pixelated'}}
                pointerEvents="none"
            />
        );
    });
});

// Aperçu « fantôme » de l'item choisi en boutique, dessiné grisé et translucide
// sur la case survolée quand elle est un emplacement de pose valide : le joueur
// voit ce qu'il s'apprête à placer avant de valider (soldat, maison, tour).
export const PlacementPreview = ({cell, type, soldierLevel, size}) => {
    const href = type === 'soldier' ? soldierSkin(soldierLevel) : PLACEMENT_SRC[type];
    if (!cell || !href) return null;
    const imgSize = placementImgSize(type, size);
    return (
        <image
            href={href}
            x={cell.cx - imgSize / 2}
            y={cell.cy - imgSize / 2}
            width={imgSize}
            height={imgSize}
            style={{imageRendering: 'pixelated', opacity: 0.45, filter: 'grayscale(1)'}}
            pointerEvents="none"
        />
    );
};
