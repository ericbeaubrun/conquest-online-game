// Configuration DEV : bascules d'affichage réservées au développement, pour
// rendre le jeu plus « cryptique » (on cache l'information) ou plus transparent
// (on la montre) selon les aspects. Ce fichier n'a AUCUN effet sur les règles
// du jeu — uniquement sur ce que le client dessine à l'écran.
//
// Chaque bascule est un simple booléen ; ajoute-en au fur et à mesure.
export const DEV_CONFIG = {
    // Affiche les nombres à côté des barres de vie / d'attaque dans le panneau
    // qui s'ouvre à la sélection d'un soldat ou d'une structure. À false, les
    // jauges restent visibles mais sans leur valeur chiffrée.
    showPanelStatValues: false,

    // Affiche les nombres d'attaque / points de vie dans les aperçus de combat
    // et de fusion (survol d'une cible). À false, les cartes gardent leurs
    // jauges mais sans valeurs chiffrées.
    showPreviewStatValues: true,

    // Affiche le rang d'attaque (« Novice » … « Divin », par tranche de 10 % de
    // l'attaque max) au-dessus de la barre d'attaque, dans le panneau du soldat.
    showAtkRankLabel: true,

    // Affiche le rang d'attaque (« status ») au-dessus de chaque carte des
    // panneaux de fusion (Sélectionné/Cible/Fusion) et de combat
    // (Attaquant/Cible).
    showPreviewRankLabel: true,

    // Affiche le badge « −X » au-dessus de l'icône cœur dans le panneau de
    // combat (dégâts subis par l'unité dans l'échange).
    showFightDamageBadge: false, // delete

    // Affiche le badge de niveau (« LVL X ») sur le portrait, dans le panneau
    // du soldat sélectionné.
    showSoldierPanelLevel: false,

    // Affiche le badge de niveau (« LVL X ») sur les portraits des panneaux
    // de fusion et de combat.
    showPreviewLevel: false,
};
