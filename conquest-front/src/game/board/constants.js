// Constantes de rendu du plateau : images, tailles et seuils de geste. Isolées
// ici pour que `HexBoard` et ses couches partagent la même source.
import {ITEM_SRC} from '@conquest/shared-engine/data/items.js';

export const BASE_SRC = '/base.png';
export const TREE_SRC = '/forestTree.png';
// Images des items posés, arbres compris (les arbres ne sont pas en boutique).
export const PLACEMENT_SRC = {...ITEM_SRC, tree: TREE_SRC};
// Indicateur de fusion sur un allié fusionnable (étoile pleine).
export const MERGE_SRC = '/etoilePleine.png';
// Indicateurs de combat, selon l'issue prévue du point de vue de l'attaquant :
// victoire (vert), défaite (rouge), égalité (jaune), double élimination (violet).
export const FIGHT_SRC = {
    win: '/fightIndicatorGreen.png',
    lose: '/fightIndicatorRed.png',
    draw: '/fightIndicatorYellow.png',
    doubleKo: '/fightIndicatorPurple.png',
};
// Abattage d'un arbre : action neutre (bleu, comme la fusion avant son
// changement de visuel).
export const CHOP_SRC = '/fightIndicatorBlue.png';
export const NOTIF_SRC = '/notif.png';

// Icône d'affinité (feu / glace / foudre), même correspondance que le panneau
// du soldat.
export const AFFINITY_SRC = {
    fire: '/fire.png',
    ice: '/ice.png',
    lightning: '/thunder.png',
};

// Surbrillance de la portée d'un soldat selon le type de case : déplacement
// (blanc), conquête (or) ou fusion (cyan). Le combat n'y figure pas : sa
// couleur dépend de l'issue prévue (voir `MoveHighlight`).
export const MOVE_CLASS = {
    move: 'hex__reachable',
    conquer: 'hex__conquerable',
    merge: 'hex__mergeable',
    chop: 'hex__choppable',
};

export const MIN_VIEW_RATIO = 0.14; // zoom avant max : on peut voir jusqu'à 14% de la carte
export const CLICK_THRESHOLD = 6; // px : en-deçà d'un déplacement, un pointeur = un clic

// Taille d'affichage d'un item posé selon son type : tours 1,5×, maison 0,75×,
// soldat 1×. Une base est dessinée 1,2× (voir la couche `Bases`).
export const BASE_SCALE = 1.2;
export const placementImgSize = (type, size) => {
    if (type === 'attackTower' || type === 'defenseTower') return size * 1.5;
    if (type === 'house') return size * 0.75;
    return size;
};

// Format compact (3 caractères max) pour un nombre de points de vie élevé
// (ex. la base) : 1000 -> « 1k », 1200 -> « 1k2 », 2000 -> « 2k »… seule la
// tranche des centaines est gardée, les dizaines/unités sont tronquées.
export const formatStatValue = (value) => {
    if (value < 1000) return String(value);
    const thousands = Math.floor(value / 1000);
    const hundreds = Math.floor((value % 1000) / 100);
    return hundreds > 0 ? `${thousands}k${hundreds}` : `${thousands}k`;
};
