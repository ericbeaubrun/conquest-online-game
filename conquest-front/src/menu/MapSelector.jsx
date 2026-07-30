// Sélecteur de carte partagé entre les parties locales et en ligne. Une grande
// prévisualisation présente la carte active ; le bandeau inférieur permet
// d'accéder directement à toutes les cartes disponibles dans le mode courant.

import { useMemo } from 'react';
import { getMapById } from '@conquest/shared-engine/data/maps.js';
import { playersForMap } from '@conquest/shared-engine/data/players.js';
import { hexId } from '@conquest/shared-engine/data/hex.js';
import { mapBackground, terrainColors } from '@conquest/shared-engine/data/terrain.js';
import { buildGeometry } from '@conquest/shared-engine/render/geometry.js';

// Cartes proposées en ligne, dans l'ordre du sélecteur.
export const ONLINE_MAP_IDS = ['duel', 'vallee', 'continent', 'archipel'];

// Aperçu statique d'une carte : terrains et points de départ numérotés.
const MapPreview = ({ mapId, spawnInfo }) => {
    const { map, geo, players, colors, background } = useMemo(() => {
        const selectedMap = getMapById(mapId);
        return {
            map: selectedMap,
            geo: buildGeometry(mapId),
            players: playersForMap(selectedMap),
            colors: terrainColors(selectedMap),
            background: mapBackground(selectedMap),
        };
    }, [mapId]);

    const { cells, cellMap, base } = geo;
    const spawnRadius = base.w * 0.028 + 14;

    return (
        <svg
            className="map-preview__svg"
            style={{ background }}
            viewBox={`${base.x} ${base.y} ${base.w} ${base.h}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Aperçu de la carte ${map.name}`}
        >
            {cells.map((cell) => (
                <polygon
                    key={cell.id}
                    points={cell.points}
                    fill={colors[cell.type] || '#888'}
                />
            ))}
            {map.spawns.map((spawn, index) => {
                const cell = cellMap.get(hexId(spawn.q, spawn.r));
                if (!cell) return null;

                const info = spawnInfo?.[index];
                const color = info?.color || players[index]?.color || '#ffd766';
                const filled = info ? info.filled : true;

                return (
                    <g key={index} opacity={filled ? 1 : 0.4}>
                        <circle
                            cx={cell.cx}
                            cy={cell.cy}
                            r={spawnRadius}
                            fill={color}
                            stroke="#000"
                            strokeWidth={spawnRadius * 0.18}
                        />
                        <text
                            x={cell.cx}
                            y={cell.cy}
                            fontSize={spawnRadius * 1.35}
                            fontFamily='"VT323", monospace'
                            fill="#000"
                            textAnchor="middle"
                            dominantBaseline="central"
                        >
                            {index + 1}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

const MapSelector = ({
    mapIds = ONLINE_MAP_IDS,
    mapId,
    onSelect,
    disabled = false,
    spawnInfo,
}) => {
    const ids = mapIds.length > 0 ? mapIds : ONLINE_MAP_IDS;
    const index = Math.max(0, ids.indexOf(mapId));
    const selectedId = ids[index];
    const map = getMapById(selectedId);

    const go = (delta) => {
        if (disabled) return;
        const next = (index + delta + ids.length) % ids.length;
        onSelect(ids[next]);
    };

    return (
        <div className={`map-selector ${disabled ? 'map-selector--disabled' : ''}`}>
            <div className="map-selector__showcase">
                <div className="map-selector__preview">
                    <div className="map-preview">
                        <MapPreview mapId={selectedId} spawnInfo={spawnInfo} />
                    </div>

                    <button
                        type="button"
                        className="map-selector__arrow map-selector__arrow--previous"
                        onClick={() => go(-1)}
                        disabled={disabled}
                        aria-label="Carte précédente"
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        className="map-selector__arrow map-selector__arrow--next"
                        onClick={() => go(1)}
                        disabled={disabled}
                        aria-label="Carte suivante"
                    >
                        ›
                    </button>

                    <span className="map-selector__position">
                        {String(index + 1).padStart(2, '0')} / {String(ids.length).padStart(2, '0')}
                    </span>
                </div>

                <div className="map-selector__details">
                    <span className="map-selector__eyebrow">Carte sélectionnée</span>
                    <h3 className="map-selector__name">{map.name}</h3>
                    <p className="map-selector__description">
                        Choisis ton terrain et prépare les positions de départ avant la
                        conquête.
                    </p>
                    <dl className="map-selector__stats">
                        <div>
                            <dt>Joueurs max</dt>
                            <dd>{map.spawns.length}</dd>
                        </div>
                        <div>
                            <dt>Hexagones</dt>
                            <dd>{map.cells.length}</dd>
                        </div>
                    </dl>
                    {disabled && (
                        <span className="map-selector__readonly">
                            Sélection contrôlée par l’hôte
                        </span>
                    )}
                </div>
            </div>

            <div className="map-selector__rail" role="tablist" aria-label="Cartes disponibles">
                {ids.map((id, optionIndex) => {
                    const option = getMapById(id);
                    const active = id === selectedId;

                    return (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            className={`map-selector__option ${active ? 'map-selector__option--active' : ''}`}
                            onClick={() => onSelect(id)}
                            disabled={disabled}
                        >
                            <span className="map-selector__option-index">
                                {String(optionIndex + 1).padStart(2, '0')}
                            </span>
                            <span className="map-selector__option-copy">
                                <strong>{option.name}</strong>
                                <small>
                                    {option.spawns.length} joueurs · {option.cells.length} cases
                                </small>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default MapSelector;
