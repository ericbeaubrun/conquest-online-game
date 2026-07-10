import { useEffect, useState } from "react";
import HexBoard from "./game/HexBoard.jsx";
import Shop from "./game/Shop.jsx";
import SoldierPanel from "./game/SoldierPanel.jsx";
import BuildingPanel from "./game/BuildingPanel.jsx";
import TreePanel from "./game/TreePanel.jsx";
import MergePreview from "./game/MergePreview.jsx";
import CombatPreview from "./game/CombatPreview.jsx";
import { MAPS } from "./game/maps.js";
import { setMap, endTurn, placeItem, buyBonus, resetGame } from "./game/engine/actions.js";
import { incomeFor } from "./game/engine/selectors.js";
import { BUILDING_STATS, canMerge, mergedSoldier } from "./game/engine/rules.js";

const GameLayout = ({ session, onExit }) => {
    // État PARTAGÉ de la partie (tour, joueurs, possession, or...) fourni par la
    // SESSION, créée par le parent (hors-ligne : reducer local ; online : socket
    // partagé du lobby). GameLayout ne connaît pas le transport : il lit l'état,
    // dispatche des actions, et respecte `isMyTurn`. Identique dans les deux modes.
    const { state, dispatch, isMyTurn, mode = "local", ready = true, localPlayerId = null } = session;
    const online = mode === "online";
    const { players, activePlayerId, turn, mapId, gold, settings, status, winnerId, endReason } = state;
    const bonusesEnabled = settings?.bonusesEnabled !== false;
    // Ce client peut-il agir ? En hotseat local, toujours (le contrôle suit le
    // joueur actif) ; en online, seulement pendant son propre tour. Sert à
    // verrouiller toutes les actions de jeu (pose, fin de tour, plateau).
    const canAct = isMyTurn && status === "playing";

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

    // Chrono par tour (réglage `turnTimer`, en secondes ; 0 = désactivé). Quand
    // il tombe à zéro, la main passe automatiquement au joueur suivant. Le
    // décompte redémarre à chaque changement de joueur / de tour.
    const turnTimer = settings?.turnTimer || 0;
    const [timeLeft, setTimeLeft] = useState(turnTimer);
    useEffect(() => {
        if (!turnTimer || status !== "playing") return undefined;
        setTimeLeft(turnTimer);
        const startedAt = Date.now();
        const id = setInterval(() => {
            const remaining = turnTimer - Math.floor((Date.now() - startedAt) / 1000);
            setTimeLeft(remaining);
            if (remaining <= 0) {
                clearInterval(id);
                dispatch(endTurn());
            }
        }, 250);
        return () => clearInterval(id);
    }, [turnTimer, status, activePlayerId, turn, dispatch]);

    const activeColor = players.find((p) => p.id === activePlayerId)?.color;
    const colorOf = (playerId) => players.find((p) => p.id === playerId)?.color;

    // Vainqueur et libellé de la condition de fin, pour l'écran de victoire.
    const winner = winnerId ? players.find((p) => p.id === winnerId) : null;
    const END_REASONS = {
        elimination: "Dernier joueur en lice",
        domination: "Domination du territoire",
        economy: "Course à l’or remportée",
        timeout: "Limite de tours atteinte",
    };

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
        if (!canAct) return; // pas la main : on ne termine pas le tour d'autrui
        dispatch(endTurn());
        setSelectedItem(null);
    };
    // Clic sur un item de boutique. Si une case vide est sélectionnée, l'item y
    // est posé directement. Sinon, on (dé)sélectionne l'item pour le mode
    // placement classique (surbrillance des cases, puis clic sur le plateau).
    const handleSelectItem = (id) => {
        if (!canAct) return; // hors de son tour : la boutique est en lecture seule
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

    // Online : tant que le serveur n'a pas envoyé le premier état, on affiche un
    // écran de connexion (l'état courant n'est encore que provisoire). Placé
    // APRÈS tous les hooks pour respecter les règles des hooks.
    if (mode === "online" && !ready) {
        return (
            <div className="game-container" style={{ display: "grid", placeItems: "center" }}>
                <div style={{ textAlign: "center", opacity: 0.8 }}>
                    <p style={{ fontSize: "1.2rem" }}>Connexion au serveur…</p>
                    <button className="menu-btn menu-btn--ghost" onClick={() => onExit?.()}>
                        Annuler
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="game-container">
            {/* Barre du haut */}
            <div className="top-bar">
                <div className="burger-menu" onClick={toggleMenu}>
                    ☰
                </div>
                <div className="turn-counter" title="Numéro du tour">
                    Tour {turn}
                    {settings?.maxTurns ? `/${settings.maxTurns}` : ""}
                </div>
                {online && (
                    <div className="turn-counter" title="Votre place dans la partie">
                        {localPlayerId
                            ? `Vous : ${players.find((p) => p.id === localPlayerId)?.name ?? localPlayerId}`
                            : "Spectateur"}
                    </div>
                )}
                {turnTimer > 0 && (
                    <div
                        className={`turn-timer ${timeLeft <= 5 ? "turn-timer--low" : ""}`}
                        title="Temps restant pour ce tour"
                    >
                        ⏱ {Math.max(0, timeLeft)}s
                    </div>
                )}
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
                <button
                    className="end-turn-button"
                    title={canAct ? "Passer son tour" : "En attente du tour adverse"}
                    onClick={handleEndTurn}
                    disabled={!canAct}
                >→</button>
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
                    <button onClick={() => onExit?.()}>Leave</button>
                </div>
            </div>

            {/* Zone de jeu */}
            <div className="game-content">
                <HexBoard
                    game={state}
                    dispatch={dispatch}
                    interactive={canAct}
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
                        settings={settings}
                        bonusesEnabled={bonusesEnabled}
                    />
                ) : buildingView ? (
                    <BuildingPanel
                        building={buildingView}
                        color={colorOf(buildingView.playerId)}
                        owner={players.find((p) => p.id === buildingView.playerId) || null}
                        settings={settings}
                    />
                ) : selection?.kind === "tree" ? (
                    <TreePanel owner={treeOwner} settings={settings} />
                ) : (
                    <Shop
                        selectedItem={selectedItem}
                        onSelect={handleSelectItem}
                        activeColor={activeColor}
                        activeGold={gold[activePlayerId] ?? 0}
                        settings={settings}
                    />
                )}
            </div>

            {/* Écran de fin de partie : voile sombre + panneau du vainqueur. */}
            {status === "over" && (
                <div className="game-over">
                    <div className="game-over__panel">
                        <span className="game-over__label">Partie terminée</span>
                        {winner ? (
                            <>
                                <div
                                    className="game-over__avatar"
                                    style={{ backgroundColor: winner.color }}
                                    aria-hidden="true"
                                />
                                <h2 className="game-over__winner">
                                    {winner.name} l’emporte !
                                </h2>
                            </>
                        ) : (
                            <h2 className="game-over__winner">Match nul</h2>
                        )}
                        <span className="game-over__reason">
                            {END_REASONS[endReason] || ""}
                        </span>
                        <div className="game-over__actions">
                            <button
                                className="game-over__btn game-over__btn--primary"
                                onClick={() => dispatch(resetGame())}
                            >
                                Rejouer
                            </button>
                            <button
                                className="game-over__btn"
                                onClick={() => onExit?.()}
                            >
                                Menu principal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameLayout;
