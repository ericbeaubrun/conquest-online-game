import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {hexId, hexHeight, pixelToHex} from './hex.js';
import {TERRAIN_COLORS} from './terrain.js';
import {ITEM_SRC} from './items.js';
import {soldierSprite, hasUnlockedBonus} from './soldier.js';
import {getLogicalBoard} from './engine/board.js';
import {buildGeometry} from './render/geometry.js';
import {computeReachable} from './engine/selectors.js';
import {moveSoldier, mergeSoldier, attackSoldier, chopTree, placeItem} from './engine/actions.js';
import {SOLDIER_HP_MAX} from './engine/rules.js';
import './HexBoard.scss';

const BASE_SRC = '/base.png';
const TREE_SRC = '/forestTree.png';
// Images des items posés, arbres compris (les arbres ne sont pas en boutique).
const PLACEMENT_SRC = {...ITEM_SRC, tree: TREE_SRC};
const MERGE_SRC = '/mergeIndicator.png';
const ENEMIES_SRC = '/enemiesIndicator.png';
const NOTIF_SRC = '/notif.png';
const MIN_VIEW_RATIO = 0.14; // zoom avant max : on peut voir jusqu'à 14% de la carte
const CLICK_THRESHOLD = 6; // px : en-deçà d'un déplacement, un pointeur = un clic

// Couche des cases : ne dépend que de la carte, donc mémoïsée pour ne PAS être
// re-rendue à chaque pan/zoom ni à chaque conquête (seul le viewBox change).
const Tiles = memo(function Tiles({cells}) {
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

// Couche des territoires : teinte de la couleur du propriétaire les cases
// possédées. Re-rendue seulement quand la possession change.
const Territory = memo(function Territory({cells, ownership, colors}) {
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
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    pointerEvents="none"
                    className="hex__owned"
                />
            );
        });
});

// Surbrillance des cases où le joueur actif peut poser l'item sélectionné.
const Highlight = memo(function Highlight({cells}) {
    return cells.map((cell) => (
        <polygon key={cell.id} points={cell.points} className="hex__placeable"/>
    ));
});

// Surbrillance de la portée d'un soldat selon le type de case :
// déplacement (blanc), conquête (or) ou fusion (cyan).
const MOVE_CLASS = {
    move: 'hex__reachable',
    conquer: 'hex__conquerable',
    merge: 'hex__mergeable',
    combat: 'hex__attackable',
    chop: 'hex__choppable',
};
const MoveHighlight = memo(function MoveHighlight({moves, cellMap}) {
    return [...moves.entries()].map(([id, info]) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        return (
            <polygon key={id} points={cell.points} className={MOVE_CLASS[info.kind]}/>
        );
    });
});

// Icônes superposées quand un soldat est sélectionné : fusion possible
// (mergeIndicator) sur les soldats alliés fusionnables. Les cases bloquées par un
// allié (bâtiment / base / soldat infusionnable) ne reçoivent AUCUN marqueur.
const Indicators = memo(function Indicators({moves, cellMap, size}) {
    const icon = (id, href, key) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        return (
            <image
                key={key}
                href={href}
                x={cell.cx - size / (2 * 1.25)}
                y={cell.cy - size / (2 * 1.25)}
                width={size * 0.75}
                height={size * 0.75}
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
    return (
        <>
            {[...moves.entries()]
                .filter(([, info]) => info.kind === 'conquer')
                .map(([id]) => plus(id))}
            {[...moves.entries()]
                .filter(([, info]) => info.kind === 'merge')
                .map(([id]) => icon(id, MERGE_SRC, 'm' + id))}
            {[...moves.entries()]
                .filter(([, info]) => info.kind === 'combat' || info.kind === 'chop')
                .map(([id]) => icon(id, ENEMIES_SRC, 'c' + id))}
        </>
    );
});

// Indicateur « action possible » posé sur chaque soldat du joueur actif qui n'a
// pas encore été déplacé durant ce tour : la case reçoit le même hexagone en
// pulsation que les cases de déplacement, afin de signaler qu'il reste jouable.
const ActionIndicators = memo(function ActionIndicators({
                                                            placements,
                                                            cellMap,
                                                            movedSoldiers,
                                                            activePlayerId,
                                                            selectedId,
                                                        }) {
    return [...placements.entries()].map(([id, placed]) => {
        if (placed.type !== 'soldier' || placed.playerId !== activePlayerId) return null;
        if (movedSoldiers.has(placed.uid) || id === selectedId) return null;
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

// Notification (pastille `notif.png`) posée dans le coin HAUT-GAUCHE du sprite
// de tout soldat ayant un bonus débloqué à réclamer (défi accompli, aucun bonus
// encore équipé). Signale au joueur qu'il peut ouvrir la boutique de bonus.
const BonusNotifications = memo(function BonusNotifications({
                                                                placements,
                                                                cellMap,
                                                                size,
                                                                settings,
                                                                bonusesEnabled,
                                                                activePlayerId,
                                                            }) {
    const badge = size * 0.3;
    return [...placements.entries()].map(([id, placed]) => {
        if (placed.type !== 'soldier') return null;
        // Uniquement pour les soldats du joueur actif : la notification disparaît
        // dès que son tour est passé (le soldat n'est plus au joueur actif).
        if (placed.playerId !== activePlayerId) return null;
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
// Couche des bases, dessinée au-dessus des cases. Une base détruite (assiégée
// jusqu'à 0 PV) disparaît : sa case redevient une case normale.
const Bases = memo(function Bases({baseCells, size, destroyedBases}) {
    // Base dessinée 1,20× plus grande, centrée sur sa case.
    const s = size * 1.2;
    return baseCells
        .filter((cell) => !destroyedBases?.has(cell.id))
        .map((cell) => (<image
                key={cell.id}
                href={BASE_SRC}
                x={cell.cx - s / 2}
                y={cell.cy - s / 2}
                width={s}
                height={s}
                style={{imageRendering: 'pixelated'}}
                pointerEvents="none"
            />
        ));
});

// Couche des items posés (soldats, maisons, tours). Le niveau d'un soldat se
// lit désormais à son sprite (skin par niveau) plutôt qu'à un badge numérique ;
// les soldats portent en plus une barre de vie sous leurs pieds.
const Buildings = memo(function Buildings({placements, cellMap, size}) {
    // Géométrie de la barre de vie, en unités du sprite. Le bas de la barre
    // (~0.6·size sous le centre) reste au-dessus du bord de la case (0.625·size).
    const barW = size * 0.6;
    const barH = size * 0.11;
    const barPad = Math.max(0.6, size * 0.025); // cadre noir « pixel »
    return [...placements.entries()].map(([id, placed]) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        const isSoldier = placed.type === 'soldier';
        // Les tours (attaque / défense) sont dessinées 1,5× plus grandes, centrées
        // sur leur case ; la barre de vie garde, elle, la taille standard.
        const isTower = placed.type === 'attackTower' || placed.type === 'defenseTower';
        const imgSize = isTower ? size * 1.5 : placed.type === 'house' ? size * 0.75 : size;
        const barX = cell.cx - barW / 2;
        const barY = cell.cy + size * 0.49;
        const ratio = Math.max(0, Math.min(1, (placed.hp ?? 0) / SOLDIER_HP_MAX));
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
                {isSoldier && (
                    <>
                        <rect
                            x={barX}
                            y={barY}
                            width={barW}
                            height={barH}
                            className="hp-bar__frame"
                        />
                        <rect
                            x={barX + barPad}
                            y={barY + barPad}
                            width={(barW - barPad * 2) * ratio}
                            height={barH - barPad * 2}
                            className="hp-bar__fill"
                        />
                    </>
                )}
            </g>
        );
    });
});

// Plateau : composant purement PRÉSENTATIONNEL. Il lit l'état partagé de la
// partie (`game`), en dérive la géométrie d'affichage, et envoie des actions
// via `dispatch`. La sélection courante (`selectedSoldier`) est un état
// d'INTERFACE remonté au parent — pour qu'il affiche le menu du soldat à la
// place de la boutique — mais reste local à ce client (elle ne transite pas
// par le serveur). La caméra (view) reste, elle, entièrement interne.
// Classe une case tapée en type de sélection :
//   - 'soldier'  : soldat du joueur actif encore jouable (actions possibles)
//   - 'unit'     : soldat ennemi ou déjà déplacé (specs seules, sans action)
//   - 'building' : case portant une base / tour / maison (image + points de vie)
//   - 'tree'     : arbre (récompense d'abattage + coût de revenu)
//   - 'tile'     : case vide du territoire actif (cible de pose depuis la boutique)
// Renvoie `null` si la case n'est pas sélectionnable.
function classifyCell(id, {placements, baseIds, ownership, activePlayerId, movedSoldiers, destroyedBases}) {
    const placed = placements.get(id);
    if (placed?.type === 'soldier') {
        const actionable =
            placed.playerId === activePlayerId && !movedSoldiers.has(placed.uid);
        return {id, kind: actionable ? 'soldier' : 'unit'};
    }
    if (placed?.type === 'tree') return {id, kind: 'tree'}; // infos de l'arbre
// Base encore debout ou structure posée : panneau du bâtiment. Une base
    // détruite n'est plus un bâtiment : elle retombe dans les cases normales.
    if (placed || (baseIds.has(id) && !destroyedBases?.has(id))) return {id, kind: 'building'};
    if (ownership.get(id) === activePlayerId) return {id, kind: 'tile'};
    return null;
}

// `interactive` (défaut vrai) : quand il est faux — en online, hors du tour du
// joueur local — le plateau reste consultable (pan, zoom, sélection pour
// inspecter) mais AUCUNE action de jeu n'est émise. En hotseat local il vaut
// toujours vrai : le comportement est inchangé.
const HexBoard = ({game, dispatch, interactive = true, selectedItem, selection, onSelect, onHoverTarget}) => {
    const svgRef = useRef(null);
    const {mapId, ownership, placements, movedSoldiers, activePlayerId, players, settings, destroyedBases} = game;    // Bonus activés pour la partie (défaut vrai) : conditionne les notifications.
    const bonusesEnabled = settings?.bonusesEnabled !== false;

    // Modèle logique (règles) et géométrie (rendu), mémoïsés par carte.
    const board = useMemo(() => getLogicalBoard(mapId), [mapId]);
    const {cells, cellMap, base, baseCells} = useMemo(() => buildGeometry(mapId), [mapId]);
    const baseIds = board.baseIds;

    // Couleur par joueur (stable par carte) pour la couche territoire.
    const colors = useMemo(
        () => Object.fromEntries(players.map((p) => [p.id, p.color])),
        [players]
    );

    const [view, setView] = useState(base);
    const viewRef = useRef(view);
    viewRef.current = view; // toujours à jour pour les listeners natifs / gestes

    // Changement de carte : recentre la vue sur la nouvelle carte.
    useEffect(() => {
        setView(base);
    }, [base]);

    const baseSize = hexHeight() * 0.95;
    const itemSize = hexHeight() * 0.8;

    // Cases où le joueur actif peut poser l'item : à lui, hors base, non occupées.
    const placeableCells = useMemo(() => {
        if (!selectedItem) return [];
        return cells.filter(
            (c) =>
                ownership.get(c.id) === activePlayerId &&
                !baseIds.has(c.id) &&
                !placements.has(c.id)
        );
    }, [selectedItem, cells, ownership, activePlayerId, baseIds, placements]);

    // Portée du soldat sélectionné (surbrillances + indicateurs). Calculée par
    // le sélecteur partagé avec le reducer, garantissant des règles identiques.
    const reachable = useMemo(() => {
        if (selectedItem || selection?.kind !== 'soldier') return {moves: new Map(), allies: []};
        return computeReachable(game, board, selection.id);
    }, [selectedItem, selection, game, board]);

    // --- Écran -> coordonnées SVG (compatible preserveAspectRatio="meet") ---
    const clientToSvg = useCallback((clientX, clientY, v = viewRef.current) => {
        const rect = svgRef.current.getBoundingClientRect();
        const scale = Math.min(rect.width / v.w, rect.height / v.h);
        const offsetX = (rect.width - v.w * scale) / 2;
        const offsetY = (rect.height - v.h * scale) / 2;
        return {
            x: v.x + (clientX - rect.left - offsetX) / scale,
            y: v.y + (clientY - rect.top - offsetY) / scale,
        };
    }, []);

    // Maintient la vue à l'intérieur de la carte et borne le zoom.
    const clampView = useCallback(
        (v) => {
            const w = Math.min(v.w, base.w);
            const h = Math.min(v.h, base.h);
            const x =
                w >= base.w
                    ? base.x + (base.w - w) / 2
                    : Math.min(Math.max(v.x, base.x), base.x + base.w - w);
            const y =
                h >= base.h
                    ? base.y + (base.h - h) / 2
                    : Math.min(Math.max(v.y, base.y), base.y + base.h - h);
            return {x, y, w, h};
        },
        [base]
    );

    // Zoom autour d'un point SVG donné, à partir d'une vue de départ.
    const zoomFrom = useCallback(
        (startView, svgX, svgY, factor) => {
            const minW = base.w * MIN_VIEW_RATIO;
            let cf = factor;
            if (startView.w * cf < minW) cf = minW / startView.w;
            if (startView.w * cf > base.w) cf = base.w / startView.w;
            const w = startView.w * cf;
            const h = startView.h * cf;
            const x = svgX - (svgX - startView.x) * cf;
            const y = svgY - (svgY - startView.y) * cf;
            return clampView({x, y, w, h});
        },
        [base, clampView]
    );

    // --- Molette : zoom vers le curseur ---
    useEffect(() => {
        const svg = svgRef.current;
        const onWheel = (e) => {
            e.preventDefault();
            const {x, y} = clientToSvg(e.clientX, e.clientY);
            const factor = e.deltaY < 0 ? 0.85 : 1.18;
            setView((v) => zoomFrom(v, x, y, factor));
        };
        svg.addEventListener('wheel', onWheel, {passive: false});
        return () => svg.removeEventListener('wheel', onWheel);
    }, [clientToSvg, zoomFrom]);

    // --- Tap sur une case : traduit un clic en action de jeu. ---
    const handleTap = (clientX, clientY) => {
        const {x, y} = clientToSvg(clientX, clientY);
        const {q, r} = pixelToHex({x, y});
        const id = hexId(q, r);
        const cell = cellMap.get(id);

        // Mode boutique : placement d'un item sur notre territoire (si la main).
        if (selectedItem) {
            if (interactive) dispatch(placeItem(id, selectedItem));
            return;
        }

        // Tap hors carte : désélection éventuelle.
        if (!cell) {
            if (selection) onSelect(null);
            return;
        }

        // (1) Un soldat jouable est sélectionné et la case tapée est une action
        // valide (déplacement, conquête ou fusion) — seulement pendant son tour.
        if (interactive && selection?.kind === 'soldier') {
            const dest = reachable.moves.get(id);
            if (dest) {
                if (dest.kind === 'merge') dispatch(mergeSoldier(selection.id, id));
                else if (dest.kind === 'combat') dispatch(attackSoldier(selection.id, id));
                else if (dest.kind === 'chop') dispatch(chopTree(selection.id, id));
                else dispatch(moveSoldier(selection.id, id));
                onSelect(null);
                return;
            }
        }

        // (2) Sinon, on (dé)sélectionne la case selon son contenu. Recliquer la
        // case déjà sélectionnée la désélectionne (même geste dans les deux sens).
        const next = classifyCell(id, {
            placements,
            baseIds,
            ownership,
            activePlayerId,
            movedSoldiers,
        });
        if (selection && next && next.id === selection.id) {
            onSelect(null);
            return;
        }
        onSelect(next); // `next` peut être null : la case n'est pas sélectionnable.
    };

    // --- Survol : aperçu de fusion ou de combat selon la cible pointée. ---
    const onHover = (e) => {
        if (!onHoverTarget) return;
        // Uniquement hors geste (pas de bouton enfoncé) et soldat sélectionné.
        // Jamais tant qu'une boutique de bonus est ouverte (clic droit) : son
        // aperçu ne doit pas se superposer au panneau de bonus.
        if (selection?.kind !== 'soldier' || selection?.openBonus || pointers.current.size > 0) {
            onHoverTarget(null);
            return;
        }
        const {x, y} = clientToSvg(e.clientX, e.clientY);
        const {q, r} = pixelToHex({x, y});
        const id = hexId(q, r);
        const move = reachable.moves.get(id);
        onHoverTarget(move && (move.kind === 'merge' || move.kind === 'combat')
            ? {id, kind: move.kind}
            : null);
    };
    const onLeave = () => onHoverTarget && onHoverTarget(null);

    // --- Pointeurs : glisser (pan) + pincer (pinch) + tap (conquérir) ---
    const pointers = useRef(new Map()); // pointerId -> {x, y}
    const gesture = useRef(null);
    const moved = useRef(false);

    const onPointerDown = (e) => {
        // Clic droit : sélectionne le soldat pointé et ouvre directement sa
        // boutique de bonus ; sur toute autre case, désélectionne.
        if (e.button === 2) {
            const {x, y} = clientToSvg(e.clientX, e.clientY);
            const {q, r} = pixelToHex({x, y});
            const id = hexId(q, r);
            const target = classifyCell(id, {
                placements,
                baseIds,
                ownership,
                activePlayerId,
                movedSoldiers,
                destroyedBases,
            });
            // Clic droit : on ferme tout aperçu de survol pour qu'il ne
            // s'affiche pas par-dessus la boutique de bonus.
            if (onHoverTarget) onHoverTarget(null);
            if (target && (target.kind === 'soldier' || target.kind === 'unit')) {
                onSelect({...target, openBonus: true});
            } else {
                onSelect(null);
            }
            return;
        }
        svgRef.current.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
        if (pointers.current.size === 1) {
            moved.current = false;
            gesture.current = {
                mode: 'pan',
                startClient: {x: e.clientX, y: e.clientY},
                startView: viewRef.current,
            };
        } else if (pointers.current.size === 2) {
            const [p1, p2] = [...pointers.current.values()];
            gesture.current = {
                mode: 'pinch',
                startDist: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1,
                startView: viewRef.current,
                mid: {x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2},
            };
            moved.current = true; // un pincement n'est jamais un tap
        }
    };

    const onPointerMove = (e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
        const g = gesture.current;
        if (!g) return;

        if (g.mode === 'pan' && pointers.current.size === 1) {
            const dx = e.clientX - g.startClient.x;
            const dy = e.clientY - g.startClient.y;
            if (Math.hypot(dx, dy) > CLICK_THRESHOLD) moved.current = true;
            const rect = svgRef.current.getBoundingClientRect();
            const scale = Math.min(rect.width / g.startView.w, rect.height / g.startView.h);
            setView(
                clampView({
                    x: g.startView.x - dx / scale,
                    y: g.startView.y - dy / scale,
                    w: g.startView.w,
                    h: g.startView.h,
                })
            );
        } else if (g.mode === 'pinch' && pointers.current.size >= 2) {
            const [p1, p2] = [...pointers.current.values()];
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
            const {x, y} = clientToSvg(g.mid.x, g.mid.y, g.startView);
            setView(zoomFrom(g.startView, x, y, g.startDist / dist));
        }
    };

    const onPointerUp = (e) => {
        pointers.current.delete(e.pointerId);
        try {
            svgRef.current.releasePointerCapture(e.pointerId);
        } catch {
            /* pointeur déjà relâché */
        }
        const g = gesture.current;
        if (g && g.mode === 'pan' && pointers.current.size === 0 && !moved.current) {
            handleTap(e.clientX, e.clientY); // tap sans déplacement
        }
        if (pointers.current.size === 0) {
            gesture.current = null;
        } else if (pointers.current.size === 1) {
            const [p] = [...pointers.current.values()];
            gesture.current = {
                mode: 'pan',
                startClient: {x: p.x, y: p.y},
                startView: viewRef.current,
            };
            moved.current = true; // reste d'un pincement : pas un tap
        }
    };

    // --- Boutons de zoom (autour du centre de la vue) ---
    const zoomButton = (factor) =>
        setView((v) => zoomFrom(v, v.x + v.w / 2, v.y + v.h / 2, factor));
    const resetView = () => setView(clampView(base));

    const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;

    return (
        <div className="hex-board">
            <svg
                ref={svgRef}
                className="hex-board__svg"
                viewBox={viewBox}
                preserveAspectRatio="xMidYMid meet"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onMouseMove={onHover}
                onMouseLeave={onLeave}
                onContextMenu={(e) => e.preventDefault()}
                role="group"
                aria-label="Plateau de jeu hexagonal"
            >
                <Tiles cells={cells}/>
                <Territory cells={cells} ownership={ownership} colors={colors}/>
                {selectedItem && <Highlight cells={placeableCells}/>}
                {!selectedItem && selection && cellMap.get(selection.id) && (
                    <polygon
                        points={cellMap.get(selection.id).points}
                        className="hex__selected"
                        pointerEvents="none"
                    />
                )}
                {!selectedItem && selection?.kind === 'soldier' && (
                    <MoveHighlight moves={reachable.moves} cellMap={cellMap}/>
                )}
                <Bases baseCells={baseCells} size={baseSize} destroyedBases={destroyedBases}/>
                <Buildings placements={placements} cellMap={cellMap} size={itemSize}/>
                <BonusNotifications
                    placements={placements}
                    cellMap={cellMap}
                    size={itemSize}
                    settings={settings}
                    bonusesEnabled={bonusesEnabled}
                    activePlayerId={activePlayerId}
                />
                <ActionIndicators
                    placements={placements}
                    cellMap={cellMap}
                    movedSoldiers={movedSoldiers}
                    activePlayerId={activePlayerId}
                    selectedId={selectedItem || selection?.kind !== 'soldier' ? null : selection.id}
                />
                {!selectedItem && selection?.kind === 'soldier' && (
                    <Indicators
                        moves={reachable.moves}
                        cellMap={cellMap}
                        size={itemSize}
                    />
                )}
            </svg>

            <div className="hex-board__controls">
                <button onClick={() => zoomButton(0.8)} aria-label="Zoom avant" title="Zoom avant">
                    +
                </button>
                <button onClick={() => zoomButton(1.25)} aria-label="Zoom arrière" title="Zoom arrière">
                    −
                </button>
                <button onClick={resetView} aria-label="Recentrer" title="Voir toute la carte">
                    ⤢
                </button>
            </div>
        </div>
    );
};

export default HexBoard;
