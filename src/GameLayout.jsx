import { useEffect, useState } from "react";
import HexBoard from "./game/HexBoard.jsx";
import Shop from "./game/Shop.jsx";
import SoldierPanel from "./game/SoldierPanel.jsx";
import BuildingPanel from "./game/BuildingPanel.jsx";
import TreePanel from "./game/TreePanel.jsx";
import MergePreview from "./game/MergePreview.jsx";
import CombatPreview from "./game/CombatPreview.jsx";
import { MAPS } from "./game/maps.js";
import { useGameSession } from "./game/session/useGameSession.js";
import { setMap, endTurn, placeItem, buyBonus } from "./game/engine/actions.js";
import { incomeFor } from "./game/engine/selectors.js";
import { BUILDING_STATS, canMerge, mergedSoldier } from "./game/engine/rules.js";

const GameLayout = () => {
    // État PARTAGÉ de la partie (tour, joueurs, possession, or...) via la
    // session. En mode online, seul `useGameSession` changera d'implémentation.
    const { state, dispatch } = useGameSession({ mode: "local" });
    const { players, activePlayerId, turn, mapId, gold } = state;

    // État d'INTERFACE local à ce client (ne transite pas par le serveur).
    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    // Sélection courante sur le plateau : { id, kind } où kind vaut 'soldier'
    // (soldat jouable), 'unit' (soldat ennemi / déjà joué), 'building' (base,
    // tour, maison) ou 'tile' (case vide de son territoire). Pilote le panneau
    // affiché en bas (specs vs boutique).
    const [selection, setSelection] = useState(null);
    // Cible survolée par le joueur (soldat sélectionné) : { id, kind } où kind
    // vaut 'merge' (allié fusionnable) ou 'combat' (ennemi attaquable).
    const [hoverTarget, setHoverTarget] = useState(null);

    const activeColor = players.find((p) => p.id === activePlayerId)?.color;
    const colorOf = (playerId) => players.find((p) => p.id === playerId)?.color;

    // Données du soldat/bâtiment sélectionné selon le type de sélection.
    const selectedData = selection ? state.placements.get(selection.id) : null;
    const soldierView =
        selection && (selection.kind === "soldier" || selection.kind === "unit")
            ? selectedData
            : null;
    // Bâtiment sélectionné : un item posé (tour, maison) ou la base d'une case
    // spawn (absente de `placements`, d'où les valeurs synthétisées).
    const buildingView =
        selection && selection.kind === "building"
            ? selectedData
                ? {
                      type: selectedData.type,
                      hp: selectedData.hp ?? BUILDING_STATS[selectedData.type]?.hp ?? 0,
                      atk: selectedData.atk,
                      playerId: selectedData.playerId,
                  }
                : { type: "base", hp: BUILDING_STATS.base.hp, playerId: state.ownership.get(selection.id) }
            : null;
    // Arbre sélectionné : on affiche ses infos (récompense + coût) et le joueur
    // dont il occupe le territoire, le cas échéant.
    const treeOwner =
        selection?.kind === "tree"
            ? players.find((p) => p.id === state.ownership.get(selection.id)) || null
            : null;

    // La boutique bascule en mode « pose directe » quand une case vide est
    // sélectionnée : cliquer un item le pose immédiatement sur cette case.
    const placeTarget = selection?.kind === "tile" ? selection.id : null;

    // Soldat sélectionné et unité survolée : servent aux aperçus de fusion et
    // de combat (affichés uniquement quand l'action est réellement valide).
    const hoverSoldier = selection?.kind === "soldier" ? selectedData : null;
    const targetSoldier =
        hoverTarget && hoverTarget.id !== selection?.id
            ? state.placements.get(hoverTarget.id)
            : null;
    const mergePreview =
        hoverTarget?.kind === "merge" && hoverSoldier && targetSoldier && canMerge(hoverSoldier, targetSoldier)
            ? { from: hoverSoldier, to: targetSoldier, result: mergedSoldier(hoverSoldier, targetSoldier) }
            : null;
    const combatPreview =
        hoverTarget?.kind === "combat" && hoverSoldier && targetSoldier
            ? { attacker: hoverSoldier, defender: targetSoldier }
            : null;

    // Le clic droit sert d'action de jeu (ouvrir la boutique de bonus) : on
    // supprime le menu contextuel natif du navigateur sur toute l'application.
    useEffect(() => {
        const suppress = (e) => e.preventDefault();
        document.addEventListener("contextmenu", suppress);
        return () => document.removeEventListener("contextmenu", suppress);
    }, []);

    // Changement de carte ou de joueur actif : plus rien ne doit rester
    // sélectionné (item de boutique comme sélection de plateau).
    useEffect(() => {
        setSelectedItem(null);
        setSelection(null);
        setHoverTarget(null);
    }, [mapId, activePlayerId]);

    const toggleMenu = () => setMenuOpen((open) => !open);
    const selectMap = (id) => {
        dispatch(setMap(id));
        setMenuOpen(false);
    };
    const handleEndTurn = () => {
        dispatch(endTurn());
        setSelectedItem(null);
    };
    // Clic sur un item de boutique. Si une case vide est sélectionnée, l'item y
    // est posé directement. Sinon, on (dé)sélectionne l'item pour le mode
    // placement classique (surbrillance des cases, puis clic sur le plateau).
    const handleSelectItem = (id) => {
        if (placeTarget) {
            if (id) {
                dispatch(placeItem(placeTarget, id));
                setSelection(null);
            }
            return;
        }
        setSelectedItem(id);
        if (id) setSelection(null);
    };

    return (
        <div className="game-container">
            {/* Barre du haut */}
            <div className="top-bar">
                <div className="burger-menu" onClick={toggleMenu}>
                    ☰
                </div>
                <div className="turn-counter" title="Numéro du tour">
                    Tour {turn}
                </div>
                <div className="players-info">
                    {players.map((player) => (
                        <div
                            className={`player-profile ${
                                player.id === activePlayerId ? "player-profile--active" : ""
                            }`}
                            key={player.id}
                            title={
                                player.id === activePlayerId
                                    ? `Au tour de ${player.name}`
                                    : player.name
                            }
                        >
                            <div
                                className="player-avatar"
                                style={{ backgroundColor: player.color }}
                                aria-label={player.name}
                            />
                            <div className="player-stats">
                                <div className="stat" title="Or en réserve">
                                    <span role="img" aria-label="or">💰</span>
                                    {gold[player.id] ?? 0}
                                </div>
                                <div className="stat" title="Or gagné par tour">
                                    <span role="img" aria-label="or par tour">📈</span>
                                    +{incomeFor(state, player.id)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <button className="end-turn-button" title="Passer son tour" onClick={handleEndTurn}>→</button>
            </div>

            {/* Menu latéral */}
            <div className={`side-menu ${menuOpen ? "open" : ""}`}>
                <div className="menu-section">
                    <span className="menu-section__title">Cartes</span>
                    {MAPS.map((m) => (
                        <button
                            key={m.id}
                            className={`map-option ${m.id === mapId ? "map-option--active" : ""}`}
                            onClick={() => selectMap(m.id)}
                        >
                            <span className="map-option__name">{m.name}</span>
                            <span className="map-option__desc">{m.description}</span>
                        </button>
                    ))}
                </div>

                <div className="menu-section">
                    <span className="menu-section__title">Partie</span>
                    <button>Turn Count</button>
                    <button>Army</button>
                    <button>Economy</button>
                    <button>Save</button>
                    <button>Leave</button>
                </div>
            </div>

            {/* Zone de jeu */}
            <div className="game-content">
                <HexBoard
                    game={state}
                    dispatch={dispatch}
                    selectedItem={selectedItem}
                    selection={selection}
                    onSelect={setSelection}
                    onHoverTarget={setHoverTarget}
                />
                {mergePreview && (
                    <MergePreview
                        from={mergePreview.from}
                        to={mergePreview.to}
                        result={mergePreview.result}
                        color={activeColor}
                    />
                )}
                {combatPreview && (
                    <CombatPreview
                        attacker={combatPreview.attacker}
                        defender={combatPreview.defender}
                        attackerColor={colorOf(combatPreview.attacker.playerId)}
                        defenderColor={colorOf(combatPreview.defender.playerId)}
                    />
                )}
                {/* Un soldat, un bâtiment ou un arbre sélectionné affiche ses
                    caractéristiques ; sinon, la boutique (en mode pose directe
                    quand une case vide est sélectionnée). */}
                {soldierView ? (
                    <SoldierPanel
                        soldier={soldierView}
                        color={colorOf(soldierView.playerId)}
                        owner={players.find((p) => p.id === soldierView.playerId) || null}
                        // Clic droit : ouvre d'emblée la boutique de bonus.
                        openBonus={!!selection?.openBonus}
                        selectionId={selection?.id}
                        // Achat de bonus : possible seulement pour le soldat du
                        // joueur actif ; on lui passe son or et le dispatch.
                        canBuy={soldierView.playerId === activePlayerId}
                        gold={gold[soldierView.playerId] ?? 0}
                        onBuyBonus={(bonusId) => dispatch(buyBonus(selection.id, bonusId))}
                    />
                ) : buildingView ? (
                    <BuildingPanel
                        building={buildingView}
                        color={colorOf(buildingView.playerId)}
                        owner={players.find((p) => p.id === buildingView.playerId) || null}
                    />
                ) : selection?.kind === "tree" ? (
                    <TreePanel owner={treeOwner} />
                ) : (
                    <Shop
                        selectedItem={selectedItem}
                        onSelect={handleSelectItem}
                        activeColor={activeColor}
                        activeGold={gold[activePlayerId] ?? 0}
                    />
                )}
            </div>
        </div>
    );
};

export default GameLayout;
