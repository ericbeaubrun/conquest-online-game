// Couches « unités » du plateau : bases, items posés (soldats, maisons, tours),
// notifications de bonus et aperçu de pose. Les stats d'attaque / de vie ne sont
// dessinées que sur les cases listées dans `visibleStatIds` (case survolée,
// soldat sélectionné et ses cibles — ou toutes les unités quand le bouton
// « stats » du plateau est actif). Elles prennent DEUX formes au choix du
// joueur (`statBars`, second bouton du plateau) : des nombres aux coins de
// l'unité, ou des jauges pixel art.
import {memo} from 'react';
import {soldierSkin, soldierSprite, hasUnlockedBonus} from '@conquest/shared-engine/data/soldier.js';
import {BUILDING_STATS, maxAtk, maxHp} from '@conquest/shared-engine/engine/rules.js';
import {unitScale, spriteFacesLeft} from '@conquest/shared-engine/data/units.js';
import {
    AFFINITY_SRC,
    BASE_SCALE,
    BASE_SRC,
    NOTIF_SRC,
    PLACEMENT_SRC,
    placementSrc,
    formatStatValue,
    formatUnitStatValue,
    placementImgSize,
    placementImgOffsetY,
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

// Jauge « pixel art » : un cadre noir, une gouttière sombre, et un remplissage
// coloré proportionnel à `ratio` (0 → 1). Le remplissage part du BAS pour une
// jauge verticale et de la GAUCHE pour une jauge horizontale. Aucun arrondi et
// `shape-rendering: crispEdges` (voir la feuille de style) : les bords restent
// nets à tous les zooms, comme les sprites.
const StatBar = ({x, y, width, height, ratio, kind, vertical = false}) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    const fillW = vertical ? width : width * clamped;
    const fillH = vertical ? height * clamped : height;
    return (
        <>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                className="stat-bar__track"
            />
            {clamped > 0 && (
                <rect
                    // Jauge verticale : le remplissage est ancré en bas, d'où le
                    // décalage de la part manquante sur `y`.
                    x={x}
                    y={vertical ? y + height - fillH : y}
                    width={fillW}
                    height={fillH}
                    className={`stat-bar__fill stat-bar__fill--${kind}`}
                />
            )}
        </>
    );
};

// Jauges d'attaque / de points de vie d'une unité : la vie en barre HORIZONTALE
// sous l'unité, l'attaque en barre VERTICALE sur son flanc gauche. Les jauges
// sont dimensionnées sur les plafonds du moteur (`maxHp` / `maxAtk`) pour rester
// comparables d'une unité à l'autre. `atk` à `null` n'affiche pas de jauge
// d'attaque (la base et la maison n'attaquent pas).
const StatBars = ({cx, cy, size, atk, hp, atkMax, hpMax}) => {
    const thickness = size * 0.11;
    const length = size * 0.62;
    return (
        <>
            {atk != null && atkMax > 0 && (
                <StatBar
                    x={cx - size * 0.46}
                    y={cy - length / 2}
                    width={thickness}
                    height={length}
                    ratio={atk / atkMax}
                    kind="atk"
                    vertical
                />
            )}
            {hpMax > 0 && (
                <StatBar
                    x={cx - length / 2}
                    y={cy + size * 0.42}
                    width={length}
                    height={thickness}
                    ratio={hp / hpMax}
                    kind="hp"
                />
            )}
        </>
    );
};

// Stats d'une unité, sous la forme choisie par le joueur : jauges (`statBars`)
// ou nombres. Les deux formes affichent les MÊMES valeurs ; seules les jauges
// ont besoin des plafonds (`atkMax` / `hpMax`) pour se dimensionner, et seuls
// les nombres ont besoin d'un format et d'un placement (`numberProps`, pour les
// unités sans attaque dont le PV se centre au lieu de se caser à droite).
const UnitStats = ({statBars, cx, cy, size, atk, hp, atkMax, hpMax, numberProps}) =>
    statBars ? (
        <StatBars cx={cx} cy={cy} size={size} atk={atk} hp={hp} atkMax={atkMax} hpMax={hpMax}/>
    ) : (
        <StatCornerLabels cx={cx} cy={cy} size={size} atk={atk} hp={hp} {...numberProps}/>
    );

// Bases, dessinées au-dessus des cases. Une base détruite (assiégée jusqu'à
// 0 PV) disparaît : sa case redevient une case normale.
export const Bases = memo(function Bases({baseCells, size, destroyedBases, baseHp, visibleStatIds, statBars}) {
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
                    <UnitStats
                        statBars={statBars}
                        cx={cell.cx}
                        cy={cell.cy}
                        size={size}
                        atk={null}
                        hp={baseHp?.[cell.id] ?? BUILDING_STATS.base.hp}
                        hpMax={BUILDING_STATS.base.hpMax}
                        // Base : pas d'attaque, un seul nombre (PV) centré.
                        numberProps={{xOffset: 0, yOffset: 0.15}}
                    />
                )}
            </g>
        ));
});

// Items posés (soldats, maisons, tours). Le niveau d'un soldat se lit à son
// sprite (skin par niveau) plutôt qu'à un badge numérique.
export const Buildings = memo(function Buildings({placements, cellMap, size, visibleStatIds, statBars}) {
    // Les unités qui débordent de leur case (le dragon) sont dessinées EN
    // DERNIER : sans ce tri, l'ordre d'insertion de la carte des items les
    // ferait passer sous un voisin posé après elles, et le colosse aurait l'air
    // rogné. Tri stable : à échelle égale, l'ordre d'origine est conservé.
    const entries = [...placements.entries()].sort(
        ([, a], [, b]) => unitScale(a) - unitScale(b)
    );
    return entries.map(([id, placed]) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        const isSoldier = placed.type === 'soldier';
        const isBuilding = BUILDING_STATS[placed.type] != null && !isSoldier;
        const isTower = placed.type === 'attackTower' || placed.type === 'defenseTower';
        const imgSize = placementImgSize(placed, size);
        const offsetY = placementImgOffsetY(placed, size);
        const showStats = visibleStatIds.has(id);
        return (
            <g key={id} pointerEvents="none">
                <image
                    href={isSoldier ? soldierSprite(placed) : placementSrc(placed)}
                    x={cell.cx - imgSize / 2}
                    y={cell.cy - imgSize / 2 + offsetY}
                    width={imgSize}
                    height={imgSize}
                    style={{imageRendering: 'pixelated'}}
                    // Miroir horizontal (autour du centre de la case) quand le
                    // sens visé ne correspond pas à celui du sprite. Les sprites
                    // sont dessinés vers la droite par convention ; les rares
                    // espèces dessinées vers la gauche (le corbeau) le déclarent
                    // au catalogue, et leur miroir s'inverse.
                    transform={isSoldier && (placed.facing === 'left') !== spriteFacesLeft(placed)
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
                {showStats && (isBuilding || isSoldier) && (
                    <UnitStats
                        statBars={statBars}
                        cx={cell.cx}
                        cy={cell.cy}
                        size={size}
                        // Seules les tours (parmi les bâtiments) ripostent : la
                        // maison n'a donc aucune attaque à montrer.
                        atk={isSoldier ? placed.atk ?? 0 : BUILDING_STATS[placed.type]?.atk ?? null}
                        hp={placed.hp ?? 0}
                        atkMax={maxAtk(placed)}
                        hpMax={maxHp(placed)}
                        numberProps={{
                            formatValue: isSoldier || isTower ? formatUnitStatValue : formatStatValue,
                            // Maison : pas d'attaque, un seul nombre (PV) centré
                            // comme pour la base plutôt que casé dans le coin
                            // bas-droit.
                            ...(placed.type === 'house' ? {xOffset: 0, yOffset: 0.15} : null),
                        }}
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
    const imgSize = placementImgSize({type}, size);
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
