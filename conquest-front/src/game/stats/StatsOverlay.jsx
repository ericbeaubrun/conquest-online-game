// Overlay des statistiques de partie (ouvert depuis le menu latéral). Chargé en
// LAZY par GameLayout : Recharts et ces composants n'entrent pas dans le bundle
// initial, ils ne sont téléchargés qu'au premier graphique ouvert.
//
// Les données viennent exclusivement de `session.state` (identiques en local et
// en online) : l'historique par tour de `state.statsHistory` (alimenté par le
// reducer), complété d'un point « en direct » pour le tour en cours, et les
// sélecteurs instantanés du moteur (économie, répartition du territoire).
import {useEffect, useMemo, useState} from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import {statsSnapshot, economyBreakdown} from '@conquest/shared-engine/engine/stats.js';
import {getLogicalBoard} from '@conquest/shared-engine/engine/board.js';
import {STAT_CHARTS} from './chartList.js';

// Couleurs hors joueurs : cases neutres, et postes de l'économie (mêmes teintes
// que le reste de l'interface : gain vert, coût rouge, or doré).
const NEUTRAL_COLOR = '#9a9a9a';
const GAIN_COLOR = '#5bd35b';
const COST_COLOR = '#ff6b6b';
const NET_COLOR = '#ffd766';

// Habillage commun des infobulles Recharts (style sombre du jeu).
const TOOLTIP_STYLE = {
    background: '#1c1c1c',
    border: '2px solid #000',
    boxShadow: '0 0 0 2px #4a4a4a',
    fontSize: 13,
};
const AXIS_STYLE = {fill: '#a9a9a9', fontSize: 12};

// ---- Courbes d'évolution (une ligne par joueur, une métrique par graphique) ----
const EvolutionChart = ({rows, players, unit}) => (
    <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{top: 8, right: 16, bottom: 0, left: -8}}>
            <CartesianGrid stroke="#3a3a3a" strokeDasharray="3 3"/>
            <XAxis dataKey="t" tick={AXIS_STYLE} stroke="#4a4a4a" label={{value: 'Tour', position: 'insideBottomRight', offset: -4, fill: '#a9a9a9', fontSize: 12}}/>
            <YAxis tick={AXIS_STYLE} stroke="#4a4a4a" allowDecimals={false} width={44}/>
            <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(t) => `Tour ${t}`} formatter={(v, name) => [`${v}${unit ? ` ${unit}` : ''}`, name]}/>
            <Legend wrapperStyle={{fontSize: 13}}/>
            {players.map((p) => (
                <Line
                    key={p.id}
                    dataKey={p.id}
                    name={p.name}
                    stroke={p.color}
                    strokeWidth={2}
                    // Peu de points (début de partie) : on les matérialise pour
                    // qu'une courbe d'un seul tour reste visible.
                    dot={rows.length <= 2 ? {r: 4, fill: p.color} : false}
                    isAnimationActive={false}
                />
            ))}
        </LineChart>
    </ResponsiveContainer>
);

// ---- Infobulle détaillée de l'économie : ventilation poste par poste ----
const EconomyTooltip = ({active, payload}) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const lines = [
        ['Revenu de base', d.base, GAIN_COLOR],
        ['Cases possédées', d.tiles, GAIN_COLOR],
        ['Maisons', d.houses, GAIN_COLOR],
        ['Soldats', -d.soldiers, COST_COLOR],
        ['Tours', -d.towers, COST_COLOR],
        ['Arbres', -d.trees, COST_COLOR],
    ].filter(([, v]) => v !== 0);
    return (
        <div style={{...TOOLTIP_STYLE, padding: '8px 10px', color: '#fff'}}>
            <div style={{marginBottom: 4, color: d.color}}>{d.name}</div>
            {lines.map(([label, v, color]) => (
                <div key={label} style={{display: 'flex', justifyContent: 'space-between', gap: 16}}>
                    <span style={{color: '#a9a9a9'}}>{label}</span>
                    <span style={{color}}>{v > 0 ? `+${v}` : v}</span>
                </div>
            ))}
            <div style={{display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4, borderTop: '1px solid #4a4a4a', paddingTop: 4}}>
                <span style={{color: '#a9a9a9'}}>Net / tour</span>
                <span style={{color: NET_COLOR}}>{d.net}</span>
            </div>
        </div>
    );
};

// ---- Histogramme de l'économie instantanée (gains / dépenses / net) ----
const EconomyChart = ({rows}) => (
    <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{top: 8, right: 16, bottom: 0, left: -8}} barGap={2}>
            <CartesianGrid stroke="#3a3a3a" strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="name" tick={AXIS_STYLE} stroke="#4a4a4a" interval={0}/>
            <YAxis tick={AXIS_STYLE} stroke="#4a4a4a" allowDecimals={false} width={44}/>
            <Tooltip content={<EconomyTooltip/>} cursor={{fill: 'rgba(255, 255, 255, 0.06)'}}/>
            <Legend wrapperStyle={{fontSize: 13}}/>
            <Bar dataKey="gains" name="Gains / tour" fill={GAIN_COLOR} isAnimationActive={false}/>
            <Bar dataKey="costs" name="Dépenses / tour" fill={COST_COLOR} isAnimationActive={false}/>
        </BarChart>
    </ResponsiveContainer>
);

// ---- Camembert de la répartition du territoire (joueurs + neutre) ----
const TerritoryPie = ({rows, total}) => (
    <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{top: 8, right: 8, bottom: 8, left: 8}}>
            <Pie
                data={rows}
                dataKey="value"
                nameKey="name"
                stroke="#1c1c1c"
                strokeWidth={2}
                isAnimationActive={false}
                label={({name, value}) => `${name} : ${value}`}
            >
                {rows.map((r) => (
                    <Cell key={r.name} fill={r.color}/>
                ))}
            </Pie>
            <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => [`${v} case${v > 1 ? 's' : ''} (${Math.round((v / total) * 100)}%)`, name]}
            />
            <Legend wrapperStyle={{fontSize: 13}}/>
        </PieChart>
    </ResponsiveContainer>
);

// Lignes Recharts d'une métrique donnée : {t, p1: valeur, p2: valeur, ...}.
const buildMetricRows = (history, players, metric) =>
    history.map((snap) => {
        const row = {t: snap.t};
        for (const p of players) row[p.id] = snap.players[p.id]?.[metric] ?? 0;
        return row;
    });

const StatsOverlay = ({state, chart, onSelect, onClose}) => {
    // Bascule effectif / puissance du graphique « Armée » (voir plus bas).
    const [armyMetric, setArmyMetric] = useState('power');
    const {players} = state;

    // Touche Échap : referme l'overlay (en plus de la croix et du fond).
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    // Historique par tour : instantanés enregistrés par le reducer, complétés du
    // point « en direct » du tour en cours (recalculé depuis l'état courant).
    const history = useMemo(
        () => [...(state.statsHistory || []), statsSnapshot(state)],
        [state]
    );
    const territoryRows = useMemo(() => buildMetricRows(history, players, 'tiles'), [history, players]);
    const goldRows = useMemo(() => buildMetricRows(history, players, 'gold'), [history, players]);
    const armyRows = useMemo(() => buildMetricRows(history, players, armyMetric), [history, players, armyMetric]);

    // Économie instantanée : ventilation par joueur (voir `economyBreakdown`).
    const economyRows = useMemo(
        () => players.map((p) => ({name: p.name, color: p.color, ...economyBreakdown(state, p.id)})),
        [state, players]
    );

    // Répartition du territoire : cases de chaque joueur + cases neutres
    // restantes (cases jouables de la carte, eau exclue).
    const {pieRows, playableCells} = useMemo(() => {
        const playable = getLogicalBoard(state.mapId).cells.filter((c) => !c.blocked).length;
        const live = history[history.length - 1];
        const rows = players
            .map((p) => ({name: p.name, color: p.color, value: live.players[p.id]?.tiles ?? 0}))
            .filter((r) => r.value > 0);
        const owned = rows.reduce((sum, r) => sum + r.value, 0);
        if (playable - owned > 0) rows.push({name: 'Neutre', color: NEUTRAL_COLOR, value: playable - owned});
        return {pieRows: rows, playableCells: playable};
    }, [state, players, history]);

    const current = STAT_CHARTS.find((c) => c.id === chart) || STAT_CHARTS[0];

    return (
        <div className="stats-overlay" onClick={() => onClose?.()}>
            <div className="stats-panel" onClick={(e) => e.stopPropagation()}>
                <button className="stats-panel__close" onClick={() => onClose?.()} aria-label="Fermer">
                    ✕
                </button>
                <div className="stats-panel__tabs">
                    {STAT_CHARTS.map((c) => (
                        <button
                            key={c.id}
                            className={`stats-panel__tab ${c.id === current.id ? 'stats-panel__tab--active' : ''}`}
                            onClick={() => onSelect?.(c.id)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
                {/* Bascule propre au graphique « Armée » : puissance (PV + attaque
                    cumulés) ou simple effectif d'unités. */}
                {current.id === 'armyEvolution' && (
                    <div className="stats-panel__toggle">
                        <button
                            className={armyMetric === 'power' ? 'stats-panel__tab--active' : ''}
                            onClick={() => setArmyMetric('power')}
                        >
                            Puissance (PV + ATQ)
                        </button>
                        <button
                            className={armyMetric === 'units' ? 'stats-panel__tab--active' : ''}
                            onClick={() => setArmyMetric('units')}
                        >
                            Effectif
                        </button>
                        <button
                            className={armyMetric === 'levels' ? 'stats-panel__tab--active' : ''}
                            onClick={() => setArmyMetric('levels')}
                        >
                            Niveaux cumulés
                        </button>
                    </div>
                )}
                <div className="stats-panel__chart">
                    {current.id === 'territoryEvolution' && (
                        <EvolutionChart rows={territoryRows} players={players} unit="cases"/>
                    )}
                    {current.id === 'armyEvolution' && (
                        <EvolutionChart
                            rows={armyRows}
                            players={players}
                            unit={armyMetric === 'units' ? 'unités' : armyMetric === 'levels' ? 'niveaux' : ''}
                        />
                    )}
                    {current.id === 'goldEvolution' && (
                        <EvolutionChart rows={goldRows} players={players} unit="or"/>
                    )}
                    {current.id === 'economy' && <EconomyChart rows={economyRows}/>}
                    {current.id === 'territoryShare' && (
                        <TerritoryPie rows={pieRows} total={playableCells}/>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StatsOverlay;
