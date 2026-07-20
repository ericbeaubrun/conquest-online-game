// Briques d'affichage des caractéristiques, partagées par les panneaux (soldat,
// bâtiment) et les aperçus (fusion, combat) : une pastille chiffrée par stat,
// au même style que le bandeau du plateau (voir `StatBanner` dans
// `board/UnitLayers.jsx`) — orangé pour l'attaque, rouge pour les points de vie,
// cadre noir franc, police pixel.
//
// Les notes en épées / cœurs sur 5 crans ont été retirées : elles donnaient une
// TROISIÈME lecture des mêmes valeurs (icônes, pourcentage, nombre) et surtout
// une lecture propre aux panneaux, que rien ne rappelait sur le plateau.
import {formatStatCompact, formatUnitStatCompact} from './board/constants.js';

// Pastille de valeur brute. `beforeValue` (aperçu de combat) : affiche
// « avant→après », d'où la variante élargie `wide`. `format` : par défaut celui
// du plateau (plafonné à « FF » dès 100), remplacé par `formatStatCompact`
// (sans plafond) là où la valeur réelle prime — combat et structures, dont les
// PV dépassent couramment 100.
const StatValue = ({kind, label, value, beforeValue, wide, format = formatUnitStatCompact}) => (
    <span
        className={`soldier-stat-badge soldier-stat-badge--${kind} ${wide ? 'soldier-stat-badge--wide' : ''}`}
        role="img"
        aria-label={`${label} : ${beforeValue != null ? `${beforeValue} puis ` : ''}${value}`}
    >
        {beforeValue != null && `${format(beforeValue)}→`}
        {format(value)}
    </span>
);

export const AtkValue = ({atk, wide, uncapped = false}) => (
    <StatValue
        kind="atk"
        label="Attaque"
        value={atk}
        wide={wide}
        format={uncapped ? formatStatCompact : undefined}
    />
);

export const HpValue = ({hp, beforeHp, wide, uncapped = false}) => (
    <StatValue
        kind="hp"
        label="Points de vie"
        value={hp}
        beforeValue={beforeHp}
        wide={wide}
        format={uncapped ? formatStatCompact : undefined}
    />
);
