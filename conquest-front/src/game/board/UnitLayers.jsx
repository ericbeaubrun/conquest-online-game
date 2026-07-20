// Couches « unités » du plateau : bases, items posés (soldats, maisons, tours),
// notifications de bonus et aperçu de pose. Les stats d'attaque / de vie ne sont
// dessinées que sur les cases listées dans `visibleStatIds` (case survolée,
// soldat sélectionné et ses cibles — ou toutes les unités quand le bouton
// « stats » du plateau est actif). Elles prennent DEUX formes au choix du
// joueur (`statBars`, second bouton du plateau) : un bandeau chiffré sous
// l'unité, ou des jauges pixel art.
import {memo} from 'react';
import {soldierSkin, soldierSprite, hasUnlockedBonus} from '@conquest/shared-engine/data/soldier.js';
import {BUILDING_STATS, maxAtk, maxHp} from '@conquest/shared-engine/engine/rules.js';
import {unitScale, spriteFacesLeft} from '@conquest/shared-engine/data/units.js';
import {
    AFFINITY_SRC,
    BASE_SCALE,
    BASE_SRC,
    BEHAVIOR_SRC,
    NOTIF_SRC,
    PLACEMENT_SRC,
    placementSrc,
    formatStatCompact,
    formatUnitStatCompact,
    placementImgSize,
    placementImgOffsetY,
} from './constants.js';

// Bandeau « attaque | points de vie » posé SOUS l'unité : un seul rectangle
// coupé en deux moitiés de largeur égale, l'attaque à gauche (orangé) et les PV
// à droite (rouge). Le fait de n'être qu'un objet, sous le sprite, lui évite de
// recouvrir l'unité, et la masse colorée continue reste lisible dézoomée.
//
// Les deux cases ont une largeur FIXE (indépendante du texte) : les bandeaux
// s'alignent donc d'une unité à l'autre sans avoir à rembourrer les nombres
// d'un zéro (« 5 » reste « 5 » — voir `formatStatCompact`).
//
// `atk` à `null` (base, maison : elles n'attaquent pas) n'affiche qu'une seule
// case, centrée sous l'unité.
// Dimensions en fraction du rayon de la case (`size`, cf. `HEX_SIZE`). Un
// hexagone flat-top mesure `2 × size` de large en son milieu, et encore
// `1,28 × size` à la hauteur où court le bandeau : ce dernier peut donc être
// large sans risquer de mordre sur les cases voisines. Il l'est délibérément —
// c'est ce qui rend les chiffres lisibles une fois le plateau dézoomé.
const BANNER_HEIGHT = 0.3;
// Assez large pour qu'une valeur de trois caractères (« 1k2 », « FF ») tienne
// sans déborder de sa case à la taille de police ci-dessous.
const BANNER_CELL_WIDTH = 0.44;
const BANNER_FONT_RATIO = 0.9;

const StatBanner = ({cx, cy, size, atk, hp, yOffset = 0.42, formatValue = formatStatCompact}) => {
    const cells = [
        ...(atk != null ? [{kind: 'atk', text: formatValue(atk)}] : []),
        {kind: 'hp', text: formatValue(hp)},
    ];
    const height = size * BANNER_HEIGHT;
    const cellWidth = size * BANNER_CELL_WIDTH;
    const width = cellWidth * cells.length;
    const x = cx - width / 2;
    const y = cy + size * yOffset - height / 2;
    // Ombre portée DURE (pas de flou, décalée d'un « pixel » de case) : elle
    // détache le bandeau des terrains clairs sans trahir le rendu pixel art.
    const shadow = size * 0.04;
    return (
        <g className="stat-banner">
            <rect x={x + shadow} y={y + shadow} width={width} height={height} className="stat-banner__shadow"/>
            {/* Les remplissages ne portent PAS de contour : un contour par case
                doublerait le trait sur la couture et rognerait l'intérieur —
                d'où un cadre unique et un séparateur, tracés par-dessus. */}
            {cells.map((cell, i) => (
                <rect
                    key={cell.kind}
                    x={x + i * cellWidth}
                    y={y}
                    width={cellWidth}
                    height={height}
                    className={`stat-banner__cell stat-banner__cell--${cell.kind}`}
                />
            ))}
            {cells.slice(1).map((cell, i) => (
                <line
                    key={cell.kind}
                    x1={x + (i + 1) * cellWidth}
                    y1={y}
                    x2={x + (i + 1) * cellWidth}
                    y2={y + height}
                    vectorEffect="non-scaling-stroke"
                    className="stat-banner__divider"
                />
            ))}
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                vectorEffect="non-scaling-stroke"
                className="stat-banner__frame"
            />
            {cells.map((cell, i) => (
                <text
                    key={cell.kind}
                    x={x + i * cellWidth + cellWidth / 2}
                    y={y + height * 0.78}
                    textAnchor="middle"
                    style={{fontSize: height * BANNER_FONT_RATIO}}
                    className={`stat-banner__value stat-banner__value--${cell.kind}`}
                >
                    {cell.text}
                </text>
            ))}
        </g>
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
// ou bandeau chiffré. Les deux formes affichent les MÊMES valeurs ; seules les
// jauges ont besoin des plafonds (`atkMax` / `hpMax`) pour se dimensionner, et
// seul le bandeau a besoin d'un format et d'une hauteur (`numberProps`, pour
// les unités hautes dont le bandeau remonte sous le sprite).
const UnitStats = ({statBars, cx, cy, size, atk, hp, atkMax, hpMax, numberProps}) =>
    statBars ? (
        <StatBars cx={cx} cy={cy} size={size} atk={atk} hp={hp} atkMax={atkMax} hpMax={hpMax}/>
    ) : (
        <StatBanner cx={cx} cy={cy} size={size} atk={atk} hp={hp} {...numberProps}/>
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
                        // Base : pas d'attaque, une seule case (PV). Le sprite
                        // débordant de la case, le bandeau remonte sur lui.
                        numberProps={{yOffset: 0.14}}
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
                            formatValue: isSoldier || isTower ? formatUnitStatCompact : formatStatCompact,
                            // Maison : pas d'attaque, une seule case (PV), et
                            // un bandeau remonté comme pour la base.
                            ...(placed.type === 'house' ? {yOffset: 0.14} : null),
                        }}
                    />
                )}
                {placed.type === 'chest' && (
                    <text
                        x={cell.cx}
                        y={cell.cy - size * 0.1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        pointerEvents="none"
                        style={{
                            fontSize: size * 0.55,
                            fontWeight: 'bold',
                            fill: '#ffca06',
                            userSelect: 'none',
                            outline: 'none',
                        }}
                        className="chest-mark"
                    >
                        ?
                    </text>
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
                                                                       ownership,
                                                                       cellMap,
                                                                       size,
                                                                       settings,
                                                                       bonusesEnabled,
                                                                       activePlayerId,
                                                                   }) {
    const badge = size * 0.3;
    // Les défis d'état (arbres/maisons du territoire, bonus présents en jeu)
    // se lisent sur le plateau courant : la pastille apparaît et disparaît en
    // direct, sans attendre la fin du tour.
    const world = {placements, ownership};
    return [...placements.entries()].map(([id, placed]) => {
        if (placed.type !== 'soldier' || placed.playerId !== activePlayerId) return null;
        if (!hasUnlockedBonus(placed, settings, bonusesEnabled, world)) return null;
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

// Icône « comportement » posée au-dessus de chaque soldat DU JOUEUR ACTIF en
// pilote automatique : elle signale (à tous les joueurs, mais seulement durant
// le tour du propriétaire) que ce soldat jouera tout seul à la fin du tour.
export const BehaviorMarkers = memo(function BehaviorMarkers({
                                                                 placements,
                                                                 cellMap,
                                                                 size,
                                                                 activePlayerId,
                                                             }) {
    const badge = size * 0.42;
    return [...placements.entries()].map(([id, placed]) => {
        if (placed.type !== 'soldier' || !placed.behavior) return null;
        if (placed.playerId !== activePlayerId) return null;
        const cell = cellMap.get(id);
        if (!cell) return null;
        return (
            <image
                key={'behav' + id}
                href={BEHAVIOR_SRC}
                x={cell.cx - badge / 2}
                y={cell.cy - size * 0.62 - badge / 2}
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
