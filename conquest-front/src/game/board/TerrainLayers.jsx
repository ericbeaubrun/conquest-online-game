// Couches « terrain » du plateau : cases, territoires, surbrillances et
// indicateurs d'action. Toutes sont purement présentationnelles et mémoïsées :
// elles ne se re-rendent que si leurs données changent (pas au pan / zoom, qui
// ne touche que le viewBox).
import {memo} from 'react';
import {TERRAIN_COLORS} from '@conquest/shared-engine/data/terrain.js';
import {CHOP_SRC, FIGHT_SRC, MERGE_SRC, MOVE_CLASS} from './constants.js';
import {fightKind, unitAt} from './targeting.js';

export const Tiles = memo(function Tiles({cells}) {
    return cells.map((cell) => (
        <g key={cell.id} className={`hex${cell.blocked ? ' hex--blocked' : ''}`}>
            <polygon
                points={cell.points}
                fill={TERRAIN_COLORS[cell.type] || '#888'}
                className="hex__tile"
            />
        </g>
    ));
});

// Teinte de la couleur du propriétaire les cases possédées.
export const Territory = memo(function Territory({cells, ownership, colors}) {
    return cells
        .filter((c) => ownership.has(c.id))
        .map((cell) => {
            const color = colors[ownership.get(cell.id)];
            return (
                <polygon
                    key={cell.id}
                    points={cell.points}
                    fill={color}
                    fillOpacity={0.5}
                    stroke={color}
                    strokeOpacity={0.9}
                    strokeWidth={1}
                    strokeLinejoin="round"
                    pointerEvents="none"
                    className="hex__owned"
                />
            );
        });
});

// Cases où le joueur actif peut poser l'item sélectionné en boutique.
export const Highlight = memo(function Highlight({cells}) {
    return cells.map((cell) => (
        <polygon key={cell.id} points={cell.points} className="hex__placeable"/>
    ));
});

// Assombrit toutes les cases SAUF celles où le soldat sélectionné a une action
// à faire (déplacement, conquête, fusion, combat, abattage) et sa propre case.
// Dessinée AU-DESSUS des bases/unités pour estomper aussi les unités posées sur
// les cases sans action, et sous les surbrillances / indicateurs des cases
// actives (qui n'ont, elles, aucun voile puisqu'exclues de `activeIds`).
export const Dimmer = memo(function Dimmer({cells, activeIds}) {
    return cells
        .filter((c) => !activeIds.has(c.id))
        .map((cell) => (
            <polygon key={cell.id} points={cell.points} className="hex__dimmed" pointerEvents="none"/>
        ));
});

// Portée du soldat sélectionné. Une case de combat prend la couleur de l'issue
// prévue (victoire / défaite / égalité / double élimination), même code couleur
// que l'icône posée dessus (voir `FIGHT_SRC`).
export const MoveHighlight = memo(function MoveHighlight({moves, cellMap, game, mover}) {
    return [...moves.entries()].map(([id, info]) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        const className = info.kind === 'combat'
            ? `hex__attackable hex__attackable--${fightKind(mover, unitAt(game, id))}`
            : MOVE_CLASS[info.kind];
        return <polygon key={id} points={cell.points} className={className}/>;
    });
});

// Icônes superposées quand un soldat est sélectionné : « + » sur les cases
// conquérables, étoile sur les alliés fusionnables, indicateur d'issue sur les
// ennemis attaquables, hache sur les arbres. Les cases bloquées par un allié
// (bâtiment / base / soldat infusionnable) ne reçoivent AUCUN marqueur.
export const Indicators = memo(function Indicators({moves, cellMap, size, game, mover}) {
    const icon = (id, href, key, iconRatio = 0.75) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        const iconSize = size * iconRatio;
        return (
            <image
                key={key}
                href={href}
                x={cell.cx - iconSize / 2}
                y={cell.cy - iconSize / 2}
                width={iconSize}
                height={iconSize}
                style={{imageRendering: 'pixelated'}}
                pointerEvents="none"
            />
        );
    };
    // « + » central dessiné pour chaque case conquérable.
    const plus = (id) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        const arm = size * 0.16;
        return (
            <g key={'p' + id} className="hex__conquer-plus" strokeWidth={size * 0.07}>
                <line x1={cell.cx - arm} y1={cell.cy} x2={cell.cx + arm} y2={cell.cy}/>
                <line x1={cell.cx} y1={cell.cy - arm} x2={cell.cx} y2={cell.cy + arm}/>
            </g>
        );
    };
    return [...moves.entries()].map(([id, info]) => {
        switch (info.kind) {
            case 'conquer':
                return plus(id);
            case 'merge':
                return icon(id, MERGE_SRC, 'm' + id);
            case 'combat':
                return icon(id, FIGHT_SRC[fightKind(mover, unitAt(game, id))], 'c' + id, 0.7);
            case 'chop':
                return icon(id, CHOP_SRC, 'h' + id);
            default:
                return null;
        }
    });
});

// Indicateur « action possible » posé sur chaque soldat du joueur actif qui n'a
// pas encore été déplacé durant ce tour : la case reçoit le même hexagone en
// pulsation que les cases de déplacement, afin de signaler qu'il reste jouable.
// N'est pas rendu du tout tant qu'un soldat allié est sélectionné (voir appelant),
// pour ne pas surcharger l'affichage.
export const ActionIndicators = memo(function ActionIndicators({
                                                                   placements,
                                                                   cellMap,
                                                                   movedSoldiers,
                                                                   activePlayerId,
                                                               }) {
    return [...placements.entries()].map(([id, placed]) => {
        if (placed.type !== 'soldier' || placed.playerId !== activePlayerId) return null;
        if (movedSoldiers.has(placed.uid)) return null;
        const cell = cellMap.get(id);
        if (!cell) return null;
        return (
            <polygon
                key={'act' + id}
                points={cell.points}
                className="hex__actionable"
                pointerEvents="none"
            />
        );
    });
});
