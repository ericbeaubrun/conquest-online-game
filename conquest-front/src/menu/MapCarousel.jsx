// Sélecteur de carte EN LIGNE, sous forme de carousel : un grand aperçu de la
// carte au centre, un bouton « précédent » à gauche et « suivant » à droite. Les
// points de départ (spawns) sont numérotés 1..N, teintés de la couleur du siège
// correspondant. On n'expose qu'une sélection de cartes (voir ONLINE_MAP_IDS).

import { useMemo } from 'react';
import { getMapById } from '@conquest/shared-engine/data/maps.js';
import { playersForMap } from '@conquest/shared-engine/data/players.js';
import { hexId } from '@conquest/shared-engine/data/hex.js';
import { TERRAIN_COLORS } from '@conquest/shared-engine/data/terrain.js';
import { buildGeometry } from '@conquest/shared-engine/render/geometry.js';

// Cartes proposées en ligne (dans l'ordre du carousel).
export const ONLINE_MAP_IDS = ['duel', 'vallee', 'continent', 'archipel'];

// Aperçu statique d'une carte : tuiles teintées par terrain + spawns numérotés.
// `spawnInfo` (optionnel, indexé par spawn) surcharge la couleur du disque et
// signale si la position est occupée : { color, filled }. Non fourni → couleurs
// par défaut de la carte, toutes « pleines ».
const MapPreview = ({ mapId, spawnInfo }) => {
    const { map, geo, players } = useMemo(() => {
        const m = getMapById(mapId);
        return { map: m, geo: buildGeometry(mapId), players: playersForMap(m) };
    }, [mapId]);

    const { cells, cellMap, base } = geo;
    // Disques de spawn dimensionnés relativement à la carte (les grandes cartes
    // ont un viewBox plus large, donc des disques proportionnellement plus gros).
    const r = base.w * 0.028 + 14;

    return (
        <svg
            className="map-preview__svg"
            viewBox={`${base.x} ${base.y} ${base.w} ${base.h}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Aperçu de la carte ${map.name}`}
        >
            {cells.map((c) => (
                <polygon key={c.id} points={c.points} fill={TERRAIN_COLORS[c.type] || '#888'} />
            ))}
            {map.spawns.map((s, i) => {
                const cell = cellMap.get(hexId(s.q, s.r));
                if (!cell) return null;
                const info = spawnInfo?.[i];
                const color = info?.color || players[i]?.color || '#ffd766';
                // Position libre : disque atténué pour la distinguer d'une occupée.
                const filled = info ? info.filled : true;
                return (
                    <g key={i} opacity={filled ? 1 : 0.4}>
                        <circle cx={cell.cx} cy={cell.cy} r={r} fill={color} stroke="#000" strokeWidth={r * 0.18} />
                        <text
                            x={cell.cx}
                            y={cell.cy}
                            fontSize={r * 1.35}
                            fontFamily='"VT323", monospace'
                            fill="#000"
                            textAnchor="middle"
                            dominantBaseline="central"
                        >
                            {i + 1}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

const MapCarousel = ({ mapId, onSelect, disabled = false, spawnInfo }) => {
    const ids = ONLINE_MAP_IDS;
    // Repli si la carte courante n'est pas dans la sélection en ligne.
    const index = Math.max(0, ids.indexOf(mapId));
    const map = getMapById(ids[index]);

    const go = (delta) => {
        if (disabled) return;
        const next = (index + delta + ids.length) % ids.length;
        onSelect(ids[next]);
    };

    return (
        <div className="map-carousel">
            <button
                type="button"
                className="map-carousel__arrow"
                onClick={() => go(-1)}
                disabled={disabled}
                aria-label="Carte précédente"
            >
                ‹
            </button>

            <div className="map-carousel__stage">
                <div className="map-preview">
                    <MapPreview mapId={ids[index]} spawnInfo={spawnInfo} />
                </div>
                <div className="map-carousel__caption">
                    <span className="map-carousel__name">{map.name}</span>
                    <span className="map-carousel__desc">{map.description}</span>
                </div>
                <div className="map-carousel__dots">
                    {ids.map((id, i) => (
                        <span
                            key={id}
                            className={`map-carousel__dot ${i === index ? 'map-carousel__dot--active' : ''}`}
                        />
                    ))}
                </div>
            </div>

            <button
                type="button"
                className="map-carousel__arrow"
                onClick={() => go(1)}
                disabled={disabled}
                aria-label="Carte suivante"
            >
                ›
            </button>
        </div>
    );
};

export default MapCarousel;
