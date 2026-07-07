import { useEffect, useMemo, useState } from "react";
import HexBoard from "./game/HexBoard.jsx";
import Shop from "./game/Shop.jsx";
import { MAPS, getMapById, DEFAULT_MAP_ID } from "./game/maps.js";
import { playersForMap } from "./game/players.js";

const GameLayout = () => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [mapId, setMapId] = useState(DEFAULT_MAP_ID);
    const [selectedItem, setSelectedItem] = useState(null);

    const map = getMapById(mapId);
    const players = useMemo(() => playersForMap(map), [map]);
    const [activePlayerId, setActivePlayerId] = useState(players[0].id);
    const [turn, setTurn] = useState(1);
    const activeColor = players.find((p) => p.id === activePlayerId)?.color;

    // Au changement de carte, on repart au tour 1 avec le premier joueur.
    useEffect(() => {
        setActivePlayerId(players[0].id);
        setSelectedItem(null);
        setTurn(1);
    }, [mapId]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggleMenu = () => setMenuOpen((open) => !open);
    const selectMap = (id) => {
        setMapId(id);
        setMenuOpen(false);
    };

    // Fin de tour : on passe la main au joueur suivant. Quand on revient au
    // premier joueur, un tour complet s'est écoulé -> on incrémente le compteur.
    const endTurn = () => {
        const idx = players.findIndex((p) => p.id === activePlayerId);
        const nextIdx = (idx + 1) % players.length;
        setActivePlayerId(players[nextIdx].id);
        if (nextIdx === 0) setTurn((t) => t + 1);
        setSelectedItem(null);
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
                                <div className="stat">
                                    <span role="img" aria-label="money">💰</span>
                                    100
                                </div>
                                <div className="stat">
                                    <span role="img" aria-label="attack">⚔️</span>
                                    50
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <button className="end-turn-button" title="Passer son tour" onClick={endTurn}>→</button>
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
                    map={map}
                    players={players}
                    activePlayerId={activePlayerId}
                    selectedItem={selectedItem}
                />
                <Shop
                    selectedItem={selectedItem}
                    onSelect={setSelectedItem}
                    activeColor={activeColor}
                />
            </div>
        </div>
    );
};

export default GameLayout;
