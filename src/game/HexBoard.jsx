import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    HEX_SIZE,
    hexToPixel,
    hexPointsAttr,
    hexId,
    hexHeight,
    computeBounds,
    pixelToHex,
    getNeighbors,
} from './hex.js';
import {TERRAIN_COLORS, BLOCKED_TERRAIN} from './terrain.js';
import {ITEM_SRC} from './items.js';
import './HexBoard.scss';

const BASE_SRC = '/base.png';
const MERGE_SRC = '/mergeIndicator.png';
const ALLIES_SRC = '/alliesIndicator.png';
const ACTION_SRC = '/possibleAction.png';
const PADDING = HEX_SIZE * 0.8;
const MIN_VIEW_RATIO = 0.14; // zoom avant max : on peut voir jusqu'à 14% de la carte
const CLICK_THRESHOLD = 6; // px : en-deçà d'un déplacement, un pointeur = un clic
const MAX_MOVE = 4; // pas de déplacement maximum d'un soldat
const MERGE_MAX = 3; // niveau maximum d'un soldat fusionné

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
// (mergeIndicator) sur les soldats alliés, blocage (alliesIndicator) sur les
// bâtiments / bases alliés.
const Indicators = memo(function Indicators({moves, allies, cellMap, size}) {
    const icon = (id, href, key) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        return (
            <image
                key={key}
                href={href}
                x={cell.cx - size / 2}
                y={cell.cy - size / 2}
                width={size}
                height={size}
                style={{imageRendering: 'pixelated'}}
                pointerEvents="none"
            />
        );
    };
    return (
        <>
            {[...moves.entries()]
                .filter(([, info]) => info.kind === 'merge')
                .map(([id]) => icon(id, MERGE_SRC, 'm' + id))}
            {allies.map((id) => icon(id, ALLIES_SRC, 'a' + id))}
        </>
    );
});

// Indicateur « action possible » (point d'exclamation) posé sur chaque soldat
// du joueur actif qui n'a pas encore été déplacé durant ce tour. Placé dans le
// coin haut-gauche du sprite (symétrique du badge de niveau).
const ActionIndicators = memo(function ActionIndicators({
    placements,
    cellMap,
    size,
    movedSoldiers,
    activePlayerId,
    selectedId,
}) {
    const badge = size * 0.45;
    return [...placements.entries()].map(([id, placed]) => {
        if (placed.type !== 'soldier' || placed.playerId !== activePlayerId) return null;
        if (movedSoldiers.has(placed.uid) || id === selectedId) return null;
        const cell = cellMap.get(id);
        if (!cell) return null;
        return (
            <image
                key={'act' + id}
                href={ACTION_SRC}
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

// Couche des bases, dessinée au-dessus des cases.
const Bases = memo(function Bases({baseCells, size}) {
    return baseCells.map((cell) => (
        <image
            key={cell.id}
            href={BASE_SRC}
            x={cell.cx - size / 2}
            y={cell.cy - size / 2}
            width={size}
            height={size}
            style={{imageRendering: 'pixelated'}}
            pointerEvents="none"
        />
    ));
});

// Couche des items posés (soldats, maisons, tours), avec le badge de niveau
// des soldats fusionnés (2 ou 3, en haut à droite du sprite).
const Buildings = memo(function Buildings({placements, cellMap, size}) {
    return [...placements.entries()].map(([id, placed]) => {
        const cell = cellMap.get(id);
        if (!cell) return null;
        const level = placed.type === 'soldier' ? placed.level || 1 : 1;
        return (
            <g key={id} pointerEvents="none">
                <image
                    href={ITEM_SRC[placed.type]}
                    x={cell.cx - size / 2}
                    y={cell.cy - size / 2}
                    width={size}
                    height={size}
                    style={{imageRendering: 'pixelated'}}
                />
                {level >= 2 && (
                    <>
                        <circle
                            cx={cell.cx + size * 0.3}
                            cy={cell.cy - size * 0.3}
                            r={size * 0.2}
                            className="soldier-badge__bg"
                        />
                        <text
                            x={cell.cx + size * 0.3}
                            y={cell.cy - size * 0.3}
                            fontSize={size * 0.3}
                            className="soldier-badge__text"
                            textAnchor="middle"
                            dominantBaseline="central"
                        >
                            {level}
                        </text>
                    </>
                )}
            </g>
        );
    });
});

const HexBoard = ({map, players, activePlayerId, selectedItem}) => {
    const svgRef = useRef(null);

    // Géométrie précalculée + index + vue de base + bases + possession initiale.
    const {cells, cellMap, base, baseCells, initialOwnership} = useMemo(() => {
        const cells = map.cells.map((c) => {
            const {x, y} = hexToPixel(c);
            return {
                ...c,
                id: hexId(c.q, c.r),
                cx: x,
                cy: y,
                points: hexPointsAttr(x, y),
                blocked: BLOCKED_TERRAIN.has(c.type),
            };
        });
        const cellMap = new Map(cells.map((c) => [c.id, c]));

        const b = computeBounds(map.cells);
        const base = {
            x: b.minX - PADDING,
            y: b.minY - PADDING,
            w: b.width + PADDING * 2,
            h: b.height + PADDING * 2,
        };

        // Possession de départ : chaque base + ses voisines à son propriétaire.
        const initialOwnership = new Map();
        const baseCells = [];
        map.spawns.forEach((spawn, i) => {
            const pid = players[i].id;
            const baseId = hexId(spawn.q, spawn.r);
            if (cellMap.has(baseId)) {
                baseCells.push(cellMap.get(baseId));
                initialOwnership.set(baseId, pid);
            }
            getNeighbors(spawn.q, spawn.r).forEach((n) => {
                const id = hexId(n.q, n.r);
                if (cellMap.has(id)) initialOwnership.set(id, pid);
            });
        });

        return {cells, cellMap, base, baseCells, initialOwnership};
    }, [map, players]);

    // Identifiants des cases-bases : protégées, non conquérables.
    const baseIds = useMemo(() => new Set(baseCells.map((c) => c.id)), [baseCells]);

    // Couleur par joueur (stable par carte) pour la couche territoire.
    const colors = useMemo(
        () => Object.fromEntries(players.map((p) => [p.id, p.color])),
        [players]
    );

    const [ownership, setOwnership] = useState(initialOwnership);
    const [placements, setPlacements] = useState(() => new Map());
    const [selectedSoldier, setSelectedSoldier] = useState(null); // id de la case
    // Soldats déjà déplacés durant le tour courant (par identifiant unique).
    const [movedSoldiers, setMovedSoldiers] = useState(() => new Set());
    const soldierUid = useRef(0);
    const nextUid = () => `s${(soldierUid.current += 1)}`;
    const [view, setView] = useState(base);
    const viewRef = useRef(view);
    viewRef.current = view; // toujours à jour pour les listeners natifs / gestes

    // Changement de carte : recentre la vue, réinitialise possession et items.
    useEffect(() => {
        setView(base);
        setOwnership(initialOwnership);
        setPlacements(new Map());
    }, [base, initialOwnership]);

    // Désélectionne le soldat si on change de joueur, passe en mode boutique,
    // ou change de carte (un soldat sélectionné n'est plus pertinent).
    useEffect(() => {
        setSelectedSoldier(null);
    }, [activePlayerId, selectedItem, initialOwnership]);

    // Nouveau tour (changement de joueur actif) ou nouvelle carte : chaque
    // soldat retrouve son droit de se déplacer une fois.
    useEffect(() => {
        setMovedSoldiers(new Set());
    }, [activePlayerId, initialOwnership]);

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

    // Cases atteignables par le soldat sélectionné.
    // Règles : 4 pas max en tout, dont AU PLUS 1 case hors du territoire (qui
    // sera conquise et termine le déplacement). On traverse son propre
    // territoire et les autres soldats, mais jamais une maison / tour / base.
    // On collecte aussi : les fusions possibles (soldat allié non plein) et les
    // structures alliées bloquantes (pour l'indicateur bouclier).
    const reachable = useMemo(() => {
        const moves = new Map(); // id -> { kind: 'move' | 'conquer' | 'merge' }
        const allies = []; // bâtiments / bases alliés bloquants
        if (selectedItem || !selectedSoldier) return {moves, allies};
        const start = cellMap.get(selectedSoldier);
        if (!start) return {moves, allies};

        const dist = new Map([[selectedSoldier, 0]]);
        const queue = [selectedSoldier];
        const seenAlly = new Set();
        while (queue.length) {
            const curId = queue.shift();
            const d = dist.get(curId);
            if (d >= MAX_MOVE) continue; // plus de pas disponibles
            const cur = cellMap.get(curId);
            for (const nb of getNeighbors(cur.q, cur.r)) {
                const nid = hexId(nb.q, nb.r);
                const ncell = cellMap.get(nid);
                if (!ncell || ncell.blocked) continue; // hors carte ou eau
                const placed = placements.get(nid);
                const isBase = baseIds.has(nid);
                const isBuilding = placed && placed.type !== 'soldier';
                if (isBase || isBuilding) {
                    // Structure infranchissable : indicateur si elle est alliée.
                    const owner = isBase ? ownership.get(nid) : placed.playerId;
                    if (owner === activePlayerId && !seenAlly.has(nid)) {
                        seenAlly.add(nid);
                        allies.push(nid);
                    }
                    continue;
                }
                const owned = ownership.get(nid) === activePlayerId;
                const isSoldier = placed && placed.type === 'soldier';
                if (owned) {
                    // On avance dans notre territoire (on traverse les soldats).
                    if (!dist.has(nid)) {
                        dist.set(nid, d + 1);
                        queue.push(nid);
                    }
                    if (isSoldier) {
                        // Fusion possible sur un soldat allié non plein.
                        if (
                            placed.playerId === activePlayerId &&
                            (placed.level || 1) < MERGE_MAX &&
                            !moves.has(nid)
                        ) {
                            moves.set(nid, {kind: 'merge'});
                        }
                    } else if (!moves.has(nid)) {
                        moves.set(nid, {kind: 'move'}); // repositionnement
                    }
                } else if (!isSoldier) {
                    // Case hors territoire : conquête (1 seule, terminale).
                    if (!moves.has(nid)) moves.set(nid, {kind: 'conquer'});
                }
            }
        }
        moves.delete(selectedSoldier);
        return {moves, allies};
    }, [selectedItem, selectedSoldier, cellMap, placements, ownership, activePlayerId, baseIds]);

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

    // Déplace le soldat de `fromId` vers `toId` ; conquiert la case si demandé.
    const moveSoldier = (fromId, toId, conquer) => {
        const soldier = placements.get(fromId);
        setPlacements((prev) => {
            const s = prev.get(fromId);
            if (!s || s.type !== 'soldier') return prev;
            if (prev.has(toId)) return prev; // sécurité : destination occupée
            const next = new Map(prev);
            next.delete(fromId);
            next.set(toId, s);
            return next;
        });
        // Ce soldat a joué : il ne pourra plus se déplacer avant le prochain tour.
        if (soldier?.uid) {
            setMovedSoldiers((prev) => new Set(prev).add(soldier.uid));
        }
        if (conquer) {
            setOwnership((prev) => {
                const next = new Map(prev);
                next.set(toId, activePlayerId);
                return next;
            });
        }
    };

    // Fusionne le soldat `fromId` dans le soldat allié `toId` (niveau cumulé,
    // plafonné à MERGE_MAX). Le soldat entrant est consommé.
    const mergeSoldier = (fromId, toId) => {
        const from = placements.get(fromId);
        setPlacements((prev) => {
            const f = prev.get(fromId);
            const to = prev.get(toId);
            if (!f || f.type !== 'soldier' || !to || to.type !== 'soldier') return prev;
            if (f.playerId !== to.playerId) return prev; // uniquement entre alliés
            const level = Math.min((to.level || 1) + (f.level || 1), MERGE_MAX);
            if (level <= (to.level || 1)) return prev; // cible déjà au maximum
            const next = new Map(prev);
            next.delete(fromId);
            next.set(toId, {...to, level});
            return next;
        });
        // Le soldat entrant a joué son déplacement (il est consommé par la fusion).
        if (from?.uid) {
            setMovedSoldiers((prev) => new Set(prev).add(from.uid));
        }
    };

    // --- Tap sur une case ---
    const handleTap = (clientX, clientY) => {
        const {x, y} = clientToSvg(clientX, clientY);
        const {q, r} = pixelToHex({x, y});
        const id = hexId(q, r);
        const cell = cellMap.get(id);

        // Mode boutique : placement d'un item sur notre territoire.
        if (selectedItem) {
            if (!cell || cell.blocked || baseIds.has(id)) return;
            if (ownership.get(id) !== activePlayerId) return;
            setPlacements((prev) => {
                if (prev.has(id)) return prev; // case déjà occupée
                const item =
                    selectedItem === 'soldier'
                        ? {type: 'soldier', playerId: activePlayerId, level: 1, uid: nextUid()}
                        : {type: selectedItem, playerId: activePlayerId};
                const next = new Map(prev);
                next.set(id, item);
                return next;
            });
            return;
        }

        // Mode déplacement.
        const placed = cell ? placements.get(id) : null;
        // (1) Un soldat est sélectionné et la case tapée est une action valide.
        if (selectedSoldier) {
            const dest = reachable.moves.get(id);
            if (dest) {
                if (dest.kind === 'merge') mergeSoldier(selectedSoldier, id);
                else moveSoldier(selectedSoldier, id, dest.kind === 'conquer');
                setSelectedSoldier(null);
                return;
            }
        }
        // (2) Sélectionner (ou changer) le soldat actif. Un soldat déjà déplacé
        // ce tour n'est plus sélectionnable (il rejoue au prochain tour).
        if (
            placed &&
            placed.type === 'soldier' &&
            placed.playerId === activePlayerId &&
            !movedSoldiers.has(placed.uid)
        ) {
            setSelectedSoldier(id);
            return;
        }
        // (3) Tap ailleurs : désélection.
        if (selectedSoldier) setSelectedSoldier(null);
    };

    // --- Pointeurs : glisser (pan) + pincer (pinch) + tap (conquérir) ---
    const pointers = useRef(new Map()); // pointerId -> {x, y}
    const gesture = useRef(null);
    const moved = useRef(false);

    const onPointerDown = (e) => {
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
                onContextMenu={(e) => e.preventDefault()}
                role="group"
                aria-label="Plateau de jeu hexagonal"
            >
                <Tiles cells={cells}/>
                <Territory cells={cells} ownership={ownership} colors={colors}/>
                {selectedItem && <Highlight cells={placeableCells}/>}
                {!selectedItem && selectedSoldier && (
                    <>
                        {cellMap.get(selectedSoldier) && (
                            <polygon
                                points={cellMap.get(selectedSoldier).points}
                                className="hex__selected"
                                pointerEvents="none"
                            />
                        )}
                        <MoveHighlight moves={reachable.moves} cellMap={cellMap}/>
                    </>
                )}
                <Bases baseCells={baseCells} size={baseSize}/>
                <Buildings placements={placements} cellMap={cellMap} size={itemSize}/>
                <ActionIndicators
                    placements={placements}
                    cellMap={cellMap}
                    size={itemSize}
                    movedSoldiers={movedSoldiers}
                    activePlayerId={activePlayerId}
                    selectedId={selectedItem ? null : selectedSoldier}
                />
                {!selectedItem && selectedSoldier && (
                    <Indicators
                        moves={reachable.moves}
                        allies={reachable.allies}
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
