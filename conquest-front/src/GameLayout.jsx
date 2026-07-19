import {lazy, Suspense, useEffect, useMemo, useState} from "react";
import HexBoard from "./game/HexBoard.jsx";
import Shop from "./game/Shop.jsx";
import SoldierPanel from "./game/SoldierPanel.jsx";
import BuildingPanel from "./game/BuildingPanel.jsx";
import TreePanel from "./game/TreePanel.jsx";
import ChestPanel from "./game/ChestPanel.jsx";
import MergePreview from "./game/MergePreview.jsx";
import CombatPreview from "./game/CombatPreview.jsx";
import TopBar from "./game/TopBar.jsx";
import SideMenu from "./game/SideMenu.jsx";
import GameOverOverlay from "./game/GameOverOverlay.jsx";
import Toasts from "./game/Toasts.jsx";
import {useTurnTimer} from "./game/useTurnTimer.js";
import {useToasts} from "./game/useToasts.js";
import {buildSelectionView} from "./game/selectionView.js";
import {endTurn, placeItem, buyBonus, resetGame} from "@conquest/shared-engine/engine/actions.js";
import {isAffinityItem} from "@conquest/shared-engine/data/items.js";

// Overlay des statistiques chargé en LAZY : Recharts (et les composants de
// graphiques) restent dans un chunk séparé, téléchargé au premier clic sur un
// bouton de statistique du menu latéral — le chargement initial ne paie rien.
const StatsOverlay = lazy(() => import("./game/stats/StatsOverlay.jsx"));

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
    // Niveau du soldat sélectionné (achat direct depuis la 2e page de la boutique).
    const [selectedLevel, setSelectedLevel] = useState(1);
    // Tiroir de la boutique : replié par défaut, tiré vers le haut par son onglet.
    // Il s'ouvre aussi d'office en pose directe (case vide sélectionnée).
    const [shopOpen, setShopOpen] = useState(false);
    // Sélection sur le plateau : { id, kind } — 'soldier' | 'unit' | 'building' |
    // 'tree' | 'tile'. Pilote le panneau affiché en bas (specs vs boutique).
    const [selection, setSelection] = useState(null);
    // Cible survolée, soldat sélectionné : { id, kind } — 'merge' | 'combat'.
    const [hoverTarget, setHoverTarget] = useState(null);
    // Graphique statistique ouvert (id du catalogue STAT_CHARTS), null = fermé.
    const [statsChart, setStatsChart] = useState(null);

    const {turnTimer, timeLeft} = useTurnTimer(state, dispatch);
    // Notifications « toast » dérivées du journal d'évènements de l'état (achats,
    // combats, morts, effets de bonus). Alimenté aussi bien en local qu'en online
    // (les actions des adversaires et des bots voyagent dans l'état).
    const {toasts, dismiss: dismissToast} = useToasts(state);

    const colorOf = (playerId) => players.find((p) => p.id === playerId)?.color;
    const activeColor = colorOf(activePlayerId);
    const winner = winnerId ? players.find((p) => p.id === winnerId) : null;

    // Panneaux et aperçus dérivés de la sélection / du survol.
    const {soldierView, buildingView, treeView, chestView, placeTarget, mergePreview, combatPreview} = useMemo(
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

    // Menu burger ouvert : la touche Échap le referme (en plus du clic sur le
    // burger, l'overlay ou "Quitter").
    useEffect(() => {
        if (!menuOpen) return;
        const onKeyDown = (e) => {
            if (e.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [menuOpen]);

    // Changement de carte ou de joueur actif : plus rien ne doit rester
    // sélectionné (item de boutique comme sélection de plateau).
    useEffect(() => {
        setSelectedItem(null);
        setSelectedLevel(1);
        setSelection(null);
        setHoverTarget(null);
    }, [mapId, activePlayerId]);

    const handleEndTurn = () => {
        if (!canAct) return; // pas la main : on ne termine pas le tour d'autrui
        dispatch(endTurn());
        setSelectedItem(null);
    };
    // Clic sur un item de boutique. Si une case vide est sélectionnée, l'item y
    // est posé directement. Sinon, on (dé)sélectionne l'item pour le mode
    // placement classique (surbrillance des cases, puis clic sur le plateau).
    // Les affinités échappent à la pose directe : leur cible est un SOLDAT et
    // non une case vide, elles passent donc toujours par le mode placement.
    const handleSelectItem = (id, level = 1) => {
        if (!canAct) return; // hors de son tour : la boutique est en lecture seule
        if (placeTarget && !isAffinityItem(id)) {
            if (id) {
                dispatch(placeItem(placeTarget, id, level));
                setSelection(null);
            }
            return;
        }
        setSelectedItem(id);
        setSelectedLevel(level);
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
                menuOpen={menuOpen}
                onToggleMenu={() => setMenuOpen((open) => !open)}
                onEndTurn={handleEndTurn}
            />

            {/* Overlay : capte le clic hors du tiroir pour le refermer (en plus
                de la touche Échap et du bouton burger). */}
            {menuOpen && (
                <div className="side-menu-overlay" onClick={() => setMenuOpen(false)}/>
            )}
            <SideMenu
                open={menuOpen}
                turn={state.turn}
                maxTurns={state.settings?.maxTurns}
                // Ouvrir un graphique referme le tiroir : l'overlay prend l'écran.
                onOpenStats={(chartId) => {
                    setStatsChart(chartId);
                    setMenuOpen(false);
                }}
                onExit={onExit}
            />

            {statsChart && (
                <Suspense
                    fallback={
                        <div className="stats-overlay">
                            <p className="stats-overlay__loading">Chargement des graphiques…</p>
                        </div>
                    }
                >
                    <StatsOverlay
                        state={state}
                        chart={statsChart}
                        onSelect={setStatsChart}
                        onClose={() => setStatsChart(null)}
                    />
                </Suspense>
            )}

            <div className="game-content">
                <Toasts toasts={toasts} onDismiss={dismissToast}/>
                <HexBoard
                    game={state}
                    dispatch={dispatch}
                    interactive={canAct}
                    selectedItem={selectedItem}
                    selectedLevel={selectedLevel}
                    onDeselectItem={() => setSelectedItem(null)}
                    selection={selection}
                    onSelect={setSelection}
                    onHoverTarget={setHoverTarget}
                />
                {/* Un seul panneau occupe le bas de l'écran à la fois. Priorité :
                    aperçu de fusion / combat (survol d'une cible), puis l'arbre
                    — survolé pour abattage ou sélectionné, l'aperçu primant donc
                    sur le panneau du soldat qui s'en approche —, puis les
                    caractéristiques du soldat / bâtiment sélectionné, enfin la
                    boutique (en mode pose directe quand une case vide est
                    sélectionnée). */}
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
                ) : treeView ? (
                    <TreePanel
                        tree={treeView.tree}
                        owner={treeView.owner}
                        settings={settings}
                    />
                ) : chestView ? (
                    <ChestPanel loot={chestView.loot}/>
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
                        // Défis d'état : lus en direct sur le plateau courant.
                        world={state}
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
                ) : (
                    <Shop
                        selectedItem={selectedItem}
                        selectedLevel={selectedLevel}
                        onSelect={handleSelectItem}
                        activeGold={gold[activePlayerId] ?? 0}
                        settings={settings}
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
