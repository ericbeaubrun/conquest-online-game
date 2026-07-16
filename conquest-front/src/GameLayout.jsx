import {useEffect, useMemo, useState} from "react";
import HexBoard from "./game/HexBoard.jsx";
import Shop from "./game/Shop.jsx";
import SoldierPanel from "./game/SoldierPanel.jsx";
import BuildingPanel from "./game/BuildingPanel.jsx";
import TreePanel from "./game/TreePanel.jsx";
import MergePreview from "./game/MergePreview.jsx";
import CombatPreview from "./game/CombatPreview.jsx";
import TopBar from "./game/TopBar.jsx";
import SideMenu from "./game/SideMenu.jsx";
import GameOverOverlay from "./game/GameOverOverlay.jsx";
import {useTurnTimer} from "./game/useTurnTimer.js";
import {buildSelectionView} from "./game/selectionView.js";
import {setMap, endTurn, placeItem, buyBonus, resetGame} from "@conquest/shared-engine/engine/actions.js";

const GameLayout = ({session, onExit}) => {
    // État PARTAGÉ de la partie (tour, joueurs, possession, or...) fourni par la
    // SESSION, créée par le parent (hors-ligne : reducer local ; online : socket
    // partagé du lobby). GameLayout ne connaît pas le transport : il lit l'état,
    // dispatche des actions, et respecte `isMyTurn`. Identique dans les deux modes.
    const {state, dispatch, isMyTurn, mode = "local", ready = true, localPlayerId = null} = session;
    const online = mode === "online";
    const {players, activePlayerId, mapId, gold, settings, status, winnerId, endReason} = state;
    const bonusesEnabled = settings?.bonusesEnabled !== false;
    // Ce client peut-il agir ? En hotseat local, toujours (le contrôle suit le
    // joueur actif) ; en online, seulement pendant son propre tour. Sert à
    // verrouiller toutes les actions de jeu (pose, fin de tour, plateau).
    const canAct = isMyTurn && status === "playing";

    // --- État d'INTERFACE, local à ce client (ne transite pas par le serveur) ---
    const [menuOpen, setMenuOpen] = useState(false);
    // Item de boutique sélectionné, en attente d'être posé sur le plateau.
    const [selectedItem, setSelectedItem] = useState(null);
    // Tiroir de la boutique : replié par défaut, tiré vers le haut par son onglet.
    // Il s'ouvre aussi d'office en pose directe (case vide sélectionnée).
    const [shopOpen, setShopOpen] = useState(false);
    // Niveau de soldat à acheter (1 = base) : conditionne prix, stats et placement.
    const [soldierLevel, setSoldierLevel] = useState(1);
    // Sélection sur le plateau : { id, kind } — 'soldier' | 'unit' | 'building' |
    // 'tree' | 'tile'. Pilote le panneau affiché en bas (specs vs boutique).
    const [selection, setSelection] = useState(null);
    // Cible survolée, soldat sélectionné : { id, kind } — 'merge' | 'combat'.
    const [hoverTarget, setHoverTarget] = useState(null);

    const {turnTimer, timeLeft} = useTurnTimer(state, dispatch);

    const colorOf = (playerId) => players.find((p) => p.id === playerId)?.color;
    const activeColor = colorOf(activePlayerId);
    const winner = winnerId ? players.find((p) => p.id === winnerId) : null;

    // Panneaux et aperçus dérivés de la sélection / du survol.
    const {soldierView, buildingView, treeOwner, placeTarget, mergePreview, combatPreview} = useMemo(
        () => buildSelectionView(state, selection, hoverTarget),
        [state, selection, hoverTarget]
    );

    // Le clic droit sert d'action de jeu (désélectionner) : on supprime le menu
    // contextuel natif du navigateur sur toute l'application.
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
                dispatch(placeItem(placeTarget, id, id === "soldier" ? soldierLevel : 1));
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
    if (online && !ready) {
        return (
            <div className="game-container" style={{display: "grid", placeItems: "center"}}>
                <div style={{textAlign: "center", opacity: 0.8}}>
                    <p style={{fontSize: "1.2rem"}}>Connexion au serveur…</p>
                    <button className="menu-btn menu-btn--ghost" onClick={() => onExit?.()}>
                        Annuler
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="game-container">
            <TopBar
                state={state}
                localPlayerId={localPlayerId}
                online={online}
                turnTimer={turnTimer}
                timeLeft={timeLeft}
                canAct={canAct}
                onToggleMenu={() => setMenuOpen((open) => !open)}
                onEndTurn={handleEndTurn}
            />

            <SideMenu open={menuOpen} mapId={mapId} onSelectMap={selectMap} onExit={onExit}/>

            <div className="game-content">
                <HexBoard
                    game={state}
                    dispatch={dispatch}
                    interactive={canAct}
                    selectedItem={selectedItem}
                    onDeselectItem={() => setSelectedItem(null)}
                    soldierLevel={soldierLevel}
                    selection={selection}
                    onSelect={setSelection}
                    onHoverTarget={setHoverTarget}
                />
                {/* Un seul panneau occupe le bas de l'écran à la fois. Priorité :
                    aperçu de fusion / combat (survol d'une cible), puis les
                    caractéristiques du soldat / bâtiment / arbre sélectionné,
                    enfin la boutique (en mode pose directe quand une case vide
                    est sélectionnée). */}
                {mergePreview ? (
                    <MergePreview
                        from={mergePreview.from}
                        to={mergePreview.to}
                        result={mergePreview.result}
                        color={activeColor}
                    />
                ) : combatPreview ? (
                    <CombatPreview
                        attacker={combatPreview.attacker}
                        defender={combatPreview.defender}
                        attackerColor={colorOf(combatPreview.attacker.playerId)}
                        defenderColor={colorOf(combatPreview.defender.playerId)}
                    />
                ) : soldierView ? (
                    <SoldierPanel
                        soldier={soldierView}
                        color={colorOf(soldierView.playerId)}
                        owner={players.find((p) => p.id === soldierView.playerId) || null}
                        selectionId={selection?.id}
                        // Achat de bonus : possible seulement pour le soldat du
                        // joueur actif ; on lui passe son or et le dispatch.
                        canBuy={soldierView.playerId === activePlayerId}
                        gold={gold[soldierView.playerId] ?? 0}
                        onBuyBonus={(bonusId) => dispatch(buyBonus(selection.id, bonusId))}
                        settings={settings}
                        bonusesEnabled={bonusesEnabled}
                        onClose={() => setSelection(null)}
                    />
                ) : buildingView ? (
                    <BuildingPanel
                        building={buildingView}
                        color={colorOf(buildingView.playerId)}
                        owner={players.find((p) => p.id === buildingView.playerId) || null}
                        settings={settings}
                        onClose={() => setSelection(null)}
                    />
                ) : selection?.kind === "tree" ? (
                    <TreePanel owner={treeOwner} settings={settings}/>
                ) : (
                    <Shop
                        selectedItem={selectedItem}
                        onSelect={handleSelectItem}
                        activeColor={activeColor}
                        activeGold={gold[activePlayerId] ?? 0}
                        settings={settings}
                        soldierLevel={soldierLevel}
                        onSoldierLevel={setSoldierLevel}
                        // Tiroir : ouvert par l'onglet, ou forcé ouvert en pose
                        // directe (case vide sélectionnée).
                        open={shopOpen || !!placeTarget}
                        placeMode={!!placeTarget}
                        onToggle={() => setShopOpen((o) => !o)}
                        onClose={() => {
                            setShopOpen(false);
                            setSelection(null);
                            setSelectedItem(null);
                        }}
                        canAct={canAct}
                    />
                )}
            </div>

            {status === "over" && (
                <GameOverOverlay
                    winner={winner}
                    endReason={endReason}
                    onReplay={() => dispatch(resetGame())}
                    onExit={() => onExit?.()}
                />
            )}
        </div>
    );
};

export default GameLayout;
