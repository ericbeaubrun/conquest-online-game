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
    formatUnitStatValue,
    placementImgSize,
} from './constants.js';

// Pastille de fond colorée (selon le type de stat) derrière un nombre
// d'attaque/de vie, pour le garder lisible quel que soit le fond de la case.
const StatBadge = ({x, y, fontSize, text, kind}) => {
    // Boîte englobante approximative d'un chiffre (pas de jambage) : le padding
    // est ajouté symétriquement de chaque côté pour que le fond reste centré
    // sur le texte, dont la position (x, y) ne bouge pas.
    const paddingX = fontSize * 0.12;
    const paddingY = fontSize * 0.12;
    const textWidth = text.length * fontSize * 0.4;
    const capHeight = fontSize * 0.58;
    const descent = fontSize * 0.02;
    const width = textWidth + paddingX * 2;
    const height = capHeight + descent + paddingY * 2;
    return (
        <>
            <rect
                x={x - width / 2}
                y={y - capHeight - paddingY}
                width={width}
                height={height}
                rx={0}
                vectorEffect="non-scaling-stroke"
                className={`soldier-stat-label__bg soldier-stat-label__bg--${kind}`}
            />
            <text x={x} y={y} textAnchor="middle" className="soldier-stat-label" style={{fontSize}}>
                <tspan className={`soldier-stat-label__${kind}`}>{text}</tspan>
            </text>
        </>
    );
};

// Nombres d'attaque / points de vie en bas d'une unité : attaque en bas à
// gauche, vie en bas à droite. `atk` à `null` n'affiche aucun nombre d'attaque
// (ex. la base, qui n'attaque pas).
const StatCornerLabels = ({cx, cy, size, atk, hp, yOffset = 0.56, xOffset = 0.18, formatValue = formatStatValue}) => {
    const fontSize = size * 0.35;
    return (
        <>
            {atk != null && (
                <StatBadge
                    x={cx - size * xOffset}
                    y={cy + size * yOffset}
                    fontSize={fontSize}
                    text={formatValue(atk)}
                    kind="atk"
                />
            )}
            <StatBadge
                x={cx + size * xOffset}
                y={cy + size * yOffset}
                fontSize={fontSize}
                text={formatValue(hp)}
                kind="hp"
            />
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
                        xOffset={0}
                        yOffset={0.15}
                    />
                )}
            </g>
        ));
});

// Items posés (soldats, maisons, tours). Le niveau d'un soldat se lit à son
// sprite (skin par niveau) plutôt qu'à un badge numérique.
export const Buildings = memo(function Buildings({placements, cellMap, size, visibleStatIds}) {
    return [...placements.entries()].map(([id, placed]) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        const isSoldier = placed.type === 'soldier';
        const isBuilding = BUILDING_STATS[placed.type] != null && !isSoldier;
        const isTower = placed.type === 'attackTower' || placed.type === 'defenseTower';
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
                {showStats && isSoldier && AFFINITY_SRC[placed.affinity] && (
                    <image
                        href={AFFINITY_SRC[placed.affinity]}
                        x={cell.cx + size * 0.5 - size * 0.3 - size * 0.06}
                        y={cell.cy - size * 0.5 - size * 0.02}
                        width={size * 0.3}
                        height={size * 0.3}
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
                        formatValue={isTower ? formatUnitStatValue : undefined}
                        // Maison : pas d'attaque, un seul nombre (PV) centré comme
                        // pour la base plutôt que casé dans le coin bas-droit.
                        {...(placed.type === 'house' ? {xOffset: 0, yOffset: 0.15} : null)}
                    />
                )}
                {showStats && isSoldier && (
                    <StatCornerLabels
                        cx={cell.cx}
                        cy={cell.cy}
                        size={size}
                        atk={placed.atk ?? 0}
                        hp={placed.hp ?? 0}
                        formatValue={formatUnitStatValue}
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
    // Affinité : la case porte déjà le soldat visé — on prévisualise donc la
    // seule icône de l'élément, à l'emplacement exact de son futur badge (coin
    // haut-droit, voir la couche `Buildings`). Pas de désaturation ici : la
    // couleur EST l'information qui distingue feu, glace et foudre.
    const affinitySrc = AFFINITY_SRC[type];
    if (affinitySrc) {
        if (!cell) return null;
        const badge = size * 0.3;
        return (
            <image
                href={affinitySrc}
                x={cell.cx + size * 0.14}
                y={cell.cy - size * 0.52}
                width={badge}
                height={badge}
                style={{imageRendering: 'pixelated', opacity: 0.6}}
                pointerEvents="none"
            />
        );
    }
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
