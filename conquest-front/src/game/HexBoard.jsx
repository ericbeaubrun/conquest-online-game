// Plateau : composant purement PRÉSENTATIONNEL. Il lit l'état partagé de la
// partie (`game`), en dérive la géométrie d'affichage, et envoie des actions
// via `dispatch`. La sélection courante est un état d'INTERFACE remonté au
// parent — pour qu'il affiche le bon panneau — mais reste local à ce client
// (elle ne transite pas par le serveur). La caméra est gérée par
// `useBoardCamera`, les dessins par les couches de `board/`.
//
// `interactive` (défaut vrai) : quand il est faux — en online, hors du tour du
// joueur local — le plateau reste consultable (pan, zoom, sélection pour
// inspecter) mais AUCUNE action de jeu n'est émise.
import {useCallback, useMemo, useState} from 'react';
import {HEX_SIZE, hexId, hexHeight, pixelToHex} from '@conquest/shared-engine/data/hex.js';
import {getLogicalBoard} from '@conquest/shared-engine/engine/board.js';
import {isAffinityItem} from '@conquest/shared-engine/data/items.js';
import {canReceiveAffinity} from '@conquest/shared-engine/data/soldier.js';
import {buildGeometry} from '@conquest/shared-engine/render/geometry.js';
import {getMapById} from '@conquest/shared-engine/data/maps.js';
import {mapBackground, terrainColors} from '@conquest/shared-engine/data/terrain.js';
import {computeReachable} from '@conquest/shared-engine/engine/selectors.js';
import {
    moveSoldier,
    mergeSoldier,
    attackSoldier,
    chopTree,
    openChest,
    placeItem,
} from '@conquest/shared-engine/engine/actions.js';
import {classifyCell} from './board/targeting.js';
import {useBoardCamera} from './board/useBoardCamera.js';
import {
    ActionIndicators,
    Dimmer,
    Highlight,
    Indicators,
    MoveHighlight,
    Territory,
    Tiles,
} from './board/TerrainLayers.jsx';
import {
    Bases,
    BehaviorMarkers,
    BonusNotifications,
    Buildings,
    NoFightMarkers,
    PlacementPreview,
} from './board/UnitLayers.jsx';
import './HexBoard.scss';

const NO_MOVES = {moves: new Map(), allies: []};

// Types de cibles dont le survol ouvre un aperçu en bas de l'écran : fusion,
// combat et abattage (panneau de l'arbre visé). Un simple déplacement ou une
// conquête n'ont rien à prévisualiser.
const PREVIEW_KINDS = new Set(['merge', 'combat', 'chop', 'openChest', 'loot']);

// Chevron du curseur de sélection : un triangle pointe en bas, posé JUSTE
// au-dessus de l'arête haute de la case (les hexagones sont flat-top, ce bord
// est donc à une demi-hauteur du centre). Sa taille suit celle des cases pour
// rester proportionné quelle que soit la carte.
const selectedChevron = ({cx, cy}) => {
    const tipY = cy - hexHeight() / 2 - HEX_SIZE * 0.14;
    const baseY = tipY - HEX_SIZE * 0.62;
    const halfW = HEX_SIZE * 0.36;
    return `${cx},${tipY} ${cx - halfW},${baseY} ${cx + halfW},${baseY}`;
};

const HexBoard = ({
                      game,
                      dispatch,
                      interactive = true,
                      selectedItem,
                      selectedLevel = 1,
                      onDeselectItem,
                      selection,
                      onSelect,
                      onHoverTarget,
                      showAllStats = false,
                      statBars = false,
                  }) => {
    const {
        mapId,
        ownership,
        placements,
        movedSoldiers,
        activePlayerId,
        players,
        settings,
        destroyedBases,
        baseHp,
    } = game;
    // Bonus activés pour la partie (défaut vrai) : conditionne les notifications.
    const bonusesEnabled = settings?.bonusesEnabled !== false;

    // Modèle logique (règles) et géométrie (rendu), mémoïsés par carte.
    const board = useMemo(() => getLogicalBoard(mapId), [mapId]);
    const {cells, cellMap, base, baseCells} = useMemo(() => buildGeometry(mapId), [mapId]);

    // Palette d'ambiance de la carte : couleurs de terrain et fond du plateau,
    // paramétrables carte par carte (défauts communs si non définis).
    const {tileColors, background} = useMemo(() => {
        const map = getMapById(mapId);
        return {tileColors: terrainColors(map), background: mapBackground(map)};
    }, [mapId]);

    // Couleur par joueur (stable par carte) pour la couche territoire.
    const colors = useMemo(
        () => Object.fromEntries(players.map((p) => [p.id, p.color])),
        [players]
    );

    const baseSize = hexHeight() * 0.95;
    const itemSize = hexHeight() * 0.8;

    // Cases où le joueur actif peut poser l'item : à lui, hors base, non occupées.
    // Une AFFINITÉ fait exception : elle ne se pose pas sur une case libre mais
    // sur un soldat du joueur actif encore sans affinité (mêmes conditions que
    // le reducer, via `canReceiveAffinity`).
    const placeableCells = useMemo(() => {
        if (!selectedItem) return [];
        if (isAffinityItem(selectedItem)) {
            return cells.filter((c) => {
                const placed = placements.get(c.id);
                return canReceiveAffinity(placed) && placed.playerId === activePlayerId;
            });
        }
        return cells.filter(
            (c) =>
                ownership.get(c.id) === activePlayerId &&
                !board.baseIds.has(c.id) &&
                !placements.has(c.id)
        );
    }, [selectedItem, cells, ownership, activePlayerId, board, placements]);
    // Ids des cases posables (recherche O(1) pour l'aperçu de pose au survol).
    const placeableIds = useMemo(() => new Set(placeableCells.map((c) => c.id)), [placeableCells]);

    // Un soldat jouable est sélectionné (et la boutique n'est pas en cours de pose).
    const activeSoldier = !selectedItem && selection?.kind === 'soldier' ? selection : null;

    // Portée du soldat sélectionné (surbrillances + indicateurs). Calculée par
    // le sélecteur partagé avec le reducer, garantissant des règles identiques.
    const reachable = useMemo(
        () => (activeSoldier ? computeReachable(game, board, activeSoldier.id) : NO_MOVES),
        [activeSoldier, game, board]
    );

    // Cases qui restent en pleine lumière quand un soldat est sélectionné : lui-
    // même et toutes ses cibles atteignables (voir `dimIds` plus bas, qui couvre
    // aussi le cas d'un item de boutique sélectionné).
    const activeCellIds = useMemo(() => {
        if (!activeSoldier) return null;
        return new Set([activeSoldier.id, ...reachable.moves.keys()]);
    }, [activeSoldier, reachable]);

    // Case actuellement survolée (pour n'afficher les stats chiffrées que sur
    // l'unité pointée). `null` hors du plateau.
    const [hoveredCellId, setHoveredCellId] = useState(null);
    // `showAllStats` (afficher les stats atk/PV sur toutes les unités, sans
    // avoir à survoler) et `statBars` (les dessiner en jauges plutôt qu'en
    // nombres) sont maintenant réglés depuis la section Paramètres du menu
    // burger — reçus en props plutôt qu'en état local.

    // Cases dont les jauges (attaque / points de vie) s'affichent : la case
    // survolée, et — quand un soldat est sélectionné — le soldat lui-même ainsi
    // que toutes ses cibles atteignables. Ailleurs, aucune jauge — sauf si
    // `showAllStats` force l'affichage sur toutes les unités du plateau.
    const visibleStatIds = useMemo(() => {
        if (showAllStats) return new Set([...placements.keys(), ...baseCells.map((c) => c.id)]);
        const ids = new Set();
        if (hoveredCellId != null) ids.add(hoveredCellId);
        if (activeSoldier) {
            ids.add(activeSoldier.id);
            for (const id of reachable.moves.keys()) ids.add(id);
        }
        return ids;
    }, [showAllStats, placements, baseCells, hoveredCellId, activeSoldier, reachable]);

    // --- Caméra et gestes (pan / pinch / molette / clics) ---
    // Clic droit, n'importe où : désélectionne l'élément sélectionné, qu'il
    // s'agisse d'une case du plateau ou d'un item de boutique en attente de pose.
    const deselect = useCallback(() => {
        onHoverTarget?.(null);
        onSelect(null);
        if (selectedItem) onDeselectItem?.();
    }, [onHoverTarget, onSelect, selectedItem, onDeselectItem]);
    const {svgRef, contentRef, viewBox, clientToSvg, isGesturing, handlers, zoomBy, resetView} = useBoardCamera({
        base,
        onTap: (clientX, clientY) => handleTap(clientX, clientY),
        onRightClick: deselect,
    });

    // Case (hexagone) sous un point écran.
    const cellIdAt = (clientX, clientY) => {
        const {x, y} = clientToSvg(clientX, clientY);
        const {q, r} = pixelToHex({x, y});
        return hexId(q, r);
    };

    // --- Tap sur une case : traduit un clic en action de jeu. ---
    const handleTap = (clientX, clientY) => {
        const id = cellIdAt(clientX, clientY);

        // Mode boutique : placement d'un item sur une case posable (si la main).
        // Cliquer ailleurs (case non posable, hors carte) désélectionne l'item.
        if (selectedItem) {
            if (interactive && placeableIds.has(id)) {
                dispatch(placeItem(id, selectedItem, selectedItem === 'soldier' ? selectedLevel : 1));
            } else {
                onDeselectItem?.();
            }
            return;
        }

        // Tap hors carte : désélection éventuelle.
        if (!cellMap.has(id)) {
            if (selection) onSelect(null);
            return;
        }

        // (1) Un soldat jouable est sélectionné et la case tapée est une action
        // valide (déplacement, conquête, fusion, combat, abattage) — seulement
        // pendant son tour.
        const dest = interactive && activeSoldier ? reachable.moves.get(id) : null;
        if (dest) {
            const from = activeSoldier.id;
            if (dest.kind === 'merge') dispatch(mergeSoldier(from, id));
            else if (dest.kind === 'combat') dispatch(attackSoldier(from, id));
            else if (dest.kind === 'chop') dispatch(chopTree(from, id));
            else if (dest.kind === 'openChest') dispatch(openChest(from, id));
            else dispatch(moveSoldier(from, id));
            onSelect(null);
            return;
        }

        // (2) Sinon, on (dé)sélectionne la case selon son contenu. Recliquer la
        // case déjà sélectionnée la désélectionne (même geste dans les deux sens).
        const next = classifyCell(game, board, id);
        onSelect(selection && next?.id === selection.id ? null : next); // `next` peut être null.
    };

    // --- Survol : aperçu de fusion, de combat ou d'arbre selon la cible pointée. ---
    const onHover = (e) => {
        const id = cellIdAt(e.clientX, e.clientY);
        setHoveredCellId(id);

        if (!onHoverTarget) return;
        // Uniquement hors geste (pas de bouton enfoncé) et soldat sélectionné.
        if (!activeSoldier || isGesturing()) {
            onHoverTarget(null);
            return;
        }
        // Seules les cibles dotées d'un aperçu remontent : fusion, combat et
        // abattage (le panneau de l'arbre visé).
        const move = reachable.moves.get(id);
        onHoverTarget(move && PREVIEW_KINDS.has(move.kind) ? {id, kind: move.kind} : null);
    };
    const onLeave = () => {
        setHoveredCellId(null);
        onHoverTarget?.(null);
    };

    const selectedCell = !selectedItem && selection ? cellMap.get(selection.id) : null;
    const mover = activeSoldier ? placements.get(activeSoldier.id) : null;
    // Cases qui restent en pleine lumière : portée du soldat sélectionné, ou
    // cases posables quand un item de boutique est choisi. `null` : pas de voile.
    const dimIds = activeSoldier ? activeCellIds : selectedItem ? placeableIds : null;

    return (
        <div className="hex-board" style={{borderColor: colors[activePlayerId], background}}>
            <svg
                ref={svgRef}
                className="hex-board__svg"
                viewBox={viewBox}
                preserveAspectRatio="xMidYMid meet"
                {...handlers}
                onPointerCancel={handlers.onPointerUp}
                onMouseMove={onHover}
                onMouseLeave={onLeave}
                onContextMenu={(e) => e.preventDefault()}
                role="group"
                aria-label="Plateau de jeu hexagonal"
            >
                {/* Tout le contenu vit sous ce `<g>` : c'est lui que la caméra
                    translate/scale pendant un geste, pour éviter de toucher au
                    `viewBox` (qui re-rastérise tout le plateau). */}
                <g ref={contentRef} className="hex-board__content">
                <Tiles cells={cells} terrainColors={tileColors}/>
                <Territory cells={cells} ownership={ownership} colors={colors}/>
                {/* Ces deux couches montent elles-mêmes leurs groupes (remplissage
                    statique + contours pulsants par cadence) — voir `PulseLayers`. */}
                {selectedItem && <Highlight cells={placeableCells}/>}
                {activeSoldier && (
                    <MoveHighlight
                        moves={reachable.moves}
                        cellMap={cellMap}
                        game={game}
                        mover={mover}
                    />
                )}
                {selectedItem && placeableIds.has(hoveredCellId) && (
                    <PlacementPreview
                        cell={cellMap.get(hoveredCellId)}
                        type={selectedItem}
                        soldierLevel={selectedLevel}
                        size={itemSize}
                    />
                )}
                <Bases
                    baseCells={baseCells}
                    size={baseSize}
                    destroyedBases={destroyedBases}
                    baseHp={baseHp}
                    visibleStatIds={visibleStatIds}
                    statBars={statBars}
                />
                <Buildings
                    placements={placements}
                    cellMap={cellMap}
                    size={itemSize}
                    visibleStatIds={visibleStatIds}
                    statBars={statBars}
                />
                <BonusNotifications
                    placements={placements}
                    ownership={ownership}
                    cellMap={cellMap}
                    size={itemSize}
                    settings={settings}
                    bonusesEnabled={bonusesEnabled}
                    activePlayerId={activePlayerId}
                />
                <BehaviorMarkers
                    placements={placements}
                    cellMap={cellMap}
                    size={itemSize}
                    activePlayerId={activePlayerId}
                />
                {dimIds && <Dimmer cells={cells} activeIds={dimIds}/>}
                {activeSoldier && (
                    <NoFightMarkers
                        placements={placements}
                        cellMap={cellMap}
                        size={itemSize}
                        mover={mover}
                    />
                )}
                {!activeSoldier && (
                    <ActionIndicators
                        placements={placements}
                        cellMap={cellMap}
                        movedSoldiers={movedSoldiers}
                        activePlayerId={activePlayerId}
                    />
                )}
                {activeSoldier && (
                    <Indicators
                        moves={reachable.moves}
                        cellMap={cellMap}
                        size={itemSize}
                        game={game}
                        mover={mover}
                    />
                )}
                {/* Case sélectionnée : un contour fixe, deux ondes « sonar » qui
                    s'en écartent en fondu, et un chevron qui flotte au-dessus.
                    Le mouvement radial accroche l'œil depuis n'importe où sur
                    la carte, et le chevron — seul repère qui DÉPASSE de la
                    case — reste identifiable une fois le plateau dézoomé, là
                    où un contour se confond avec les surbrillances de portée.
                    Les trois animations ne touchent que `transform` et
                    `opacity` : le GPU compose les couches sans jamais les
                    repeindre, comme pour `hex-board__pulse`. */}
                {selectedCell && (
                    <g
                        className={`hex__selected${selection.kind === 'soldier' ? '' : ' hex__selected--neutral'}`}
                        pointerEvents="none"
                    >
                        <polygon points={selectedCell.points} className="hex__selected-ring"/>
                        <polygon points={selectedCell.points} className="hex__selected-wave"/>
                        <polygon
                            points={selectedCell.points}
                            className="hex__selected-wave hex__selected-wave--late"
                        />
                        <polygon
                            points={selectedChevron(selectedCell)}
                            className="hex__selected-cursor"
                        />
                    </g>
                )}
                </g>
            </svg>

            <div className="hex-board__controls">
                <button onClick={() => zoomBy(0.8)} aria-label="Zoom avant" title="Zoom avant">
                    +
                </button>
                <button onClick={() => zoomBy(1.25)} aria-label="Zoom arrière" title="Zoom arrière">
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
