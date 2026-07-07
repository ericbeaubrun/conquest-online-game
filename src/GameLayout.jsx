import { useEffect, useState } from "react";
import HexBoard from "./game/HexBoard.jsx";
import Shop from "./game/Shop.jsx";
import SoldierPanel from "./game/SoldierPanel.jsx";
import { MAPS } from "./game/maps.js";
import { useGameSession } from "./game/session/useGameSession.js";
import { setMap, endTurn } from "./game/engine/actions.js";
import { incomeFor } from "./game/engine/selectors.js";

const GameLayout = () => {
    // État PARTAGÉ de la partie (tour, joueurs, possession, or...) via la
    // session. En mode online, seul `useGameSession` changera d'implémentation.
    const { state, dispatch } = useGameSession({ mode: "local" });
    const { players, activePlayerId, turn, mapId, gold } = state;

    // État d'INTERFACE local à ce client (ne transite pas par le serveur).
    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    // Case (id) du soldat sélectionné : pilote l'affichage boutique vs specs.
    const [selectedSoldier, setSelectedSoldier] = useState(null);

    const activeColor = players.find((p) => p.id === activePlayerId)?.color;
    // Données du soldat sélectionné (null si aucun, ou s'il vient de bouger).
    const selectedSoldierData =
        selectedSoldier != null ? state.placements.get(selectedSoldier) : null;

    // Changement de carte ou de joueur actif : plus rien ne doit rester
    // sélectionné (item de boutique comme soldat).
    useEffect(() => {
        setSelectedItem(null);
        setSelectedSoldier(null);
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
    // Sélectionner un item de boutique referme le menu du soldat (et inversement,
    // sélectionner un soldat se fait toujours hors mode boutique).
    const handleSelectItem = (id) => {
        setSelectedItem(id);
        if (id) setSelectedSoldier(null);
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
                    selectedSoldier={selectedSoldier}
                    onSelectSoldier={setSelectedSoldier}
                />
                {/* Un soldat sélectionné affiche ses caractéristiques ;
                    sinon, la boutique. */}
                {selectedSoldierData ? (
                    <SoldierPanel soldier={selectedSoldierData} color={activeColor} />
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
