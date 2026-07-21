// Constantes de rendu du plateau : images, tailles et seuils de geste. Isolées
// ici pour que `HexBoard` et ses couches partagent la même source.
import {ITEM_SRC} from '@conquest/shared-engine/data/items.js';
import {treeSrc} from '@conquest/shared-engine/data/trees.js';
import {CHEST_SRC, lootSrc} from '@conquest/shared-engine/data/chests.js';
import {unitScale} from '@conquest/shared-engine/data/units.js';

export const BASE_SRC = '/base.png';
// Images des items posés. Les arbres n'y figurent pas : leur image dépend de
// leur essence (voir `placementSrc`), pas seulement de leur type.
export const PLACEMENT_SRC = ITEM_SRC;

// Image d'un item posé. Arbres, coffres et butins ne sont pas en boutique : leur
// image vient de leur propre catalogue (et dépend, pour les deux premiers, de
// leur essence / de leur contenu).
export const placementSrc = (placed) => {
    if (placed?.type === 'tree') return treeSrc(placed);
    if (placed?.type === 'chest') return CHEST_SRC;
    if (placed?.type === 'loot') return lootSrc(placed);
    return PLACEMENT_SRC[placed?.type];
};
// Indicateur de fusion sur un allié fusionnable (mêmes coins que l'indicateur
// de combat, en blanc — comme l'abattage d'un arbre).
export const MERGE_SRC = '/fightIndicatorWhite.png';
// Indicateurs de combat, selon l'issue prévue du point de vue de l'attaquant :
// victoire (vert), défaite (rouge), égalité (jaune), double élimination (orange).
export const FIGHT_SRC = {
    win: '/fightIndicatorGreen.png',
    lose: '/fightIndicatorRed.png',
    draw: '/fightIndicatorYellow.png',
    doubleKo: '/fightIndicatorOrange.png',
};
// Abattage d'un arbre : vert, comme une victoire assurée (l'arbre ne riposte pas).
export const CHOP_SRC = '/fightIndicatorGreen.png';
// Ouverture d'un coffre : même indicateur vert (aucune riposte non plus).
export const OPEN_CHEST_SRC = '/fightIndicatorGreen.png';
export const NOTIF_SRC = '/notif.png';
// Icône « comportement » : posée au-dessus d'un soldat en pilote automatique
// pendant le tour de son propriétaire (visible de tous les joueurs).
export const BEHAVIOR_SRC = '/characters/comportement.png';

// Icône d'affinité, même correspondance que le panneau du soldat. Le bouclier
// n'est pas un élément (il ne s'achète pas) mais s'affiche comme les autres :
// c'est bien une affinité portée par le soldat.
// Croix posée sur les unités ennemies avec lesquelles le soldat sélectionné ne
// peut PAS se battre à cause de son affinité (voir `canFight`).
export const NO_FIGHT_SRC = '/croix.png';

export const AFFINITY_SRC = {
    fire: '/fire.png',
    ice: '/ice.png',
    lightning: '/thunder.png',
    shield: '/bouclier.png',
};

// Surbrillance de la portée d'un soldat selon le type de case : déplacement
// (blanc), conquête (blanc) ou fusion (blanc). Le combat n'y figure pas : sa
// couleur dépend de l'issue prévue (voir `MoveHighlight`).
export const MOVE_CLASS = {
    move: 'hex__reachable',
    conquer: 'hex__conquerable',
    merge: 'hex__mergeable',
    chop: 'hex__choppable',
    openChest: 'hex__choppable',
    // Ramassage d'un butin : c'est un déplacement, il en garde la surbrillance.
    loot: 'hex__reachable',
};

export const MIN_VIEW_RATIO = 0.14; // zoom avant max : on peut voir jusqu'à 14% de la carte
export const CLICK_THRESHOLD = 6; // px : en-deçà d'un déplacement, un pointeur = un clic

// Taille d'affichage d'un item posé : tours 1,5×, maison 0,75×, soldat 1×. Une
// base est dessinée 1,2× (voir la couche `Bases`). Les unités invoquées portent
// leur propre échelle au catalogue (`units.js`) — le dragon déborde de sa case.
// Prend l'unité ENTIÈRE et non son seul type : un dragon est un `soldier` comme
// un autre, seule son espèce le distingue.
export const BASE_SCALE = 1.2;
export const placementImgSize = (placed, size) => {
    const type = placed?.type;
    if (type === 'attackTower' || type === 'defenseTower') return size * 1.5;
    if (type === 'house') return size * 0.75;
    // Coffres et butins : de petits objets posés au sol, dessinés bien en deçà
    // d'une case pour ne pas se confondre avec les unités qui l'occupent. Le
    // coffre, plus volumineux, est un peu plus grand que le butin qu'il livre.
    if (type === 'chest') return size * 0.85;
    if (type === 'loot') return size * 0.4;
    return size * unitScale(placed);
};

// Décalage VERTICAL d'un item posé, en plus de son centrage sur la case. Nul
// pour presque tout : seul le coffre est descendu vers le bas de sa case, pour
// qu'il ait l'air posé au sol plutôt que flottant en son milieu.
export const placementImgOffsetY = (placed, size) =>
    placed?.type === 'chest' ? size * 0.18 : 0;

// Format compact (3 caractères max) pour un nombre de points de vie élevé
// (ex. la base) : 1000 -> « 1k », 1200 -> « 1k2 », 2000 -> « 2k »… seule la
// tranche des centaines est gardée, les dizaines/unités sont tronquées.
export const formatStatCompact = (value) => {
    if (value < 1000) return String(value);
    const thousands = Math.floor(value / 1000);
    const hundreds = Math.floor((value % 1000) / 100);
    return hundreds > 0 ? `${thousands}k${hundreds}` : `${thousands}k`;
};

// Format des SOLDATS (jamais les structures : base, maison, tours) : au-delà de
// 99, on affiche « FF » plutôt que de tronquer le nombre, les soldats
// n'atteignant pas des valeurs à hauteur de base/bâtiment.
//
// Aucun des deux formats ne rembourre les valeurs à un chiffre d'un zéro : tous
// les affichages (bandeau du plateau, pastilles des panneaux et de la boutique)
// ont désormais une largeur fixe, qui aligne les nombres sans les déformer.
export const formatUnitStatCompact = (value) => (value >= 100 ? 'FF' : formatStatCompact(value));
