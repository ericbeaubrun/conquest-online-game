// Catalogue des graphiques statistiques du menu latéral. Séparé de l'overlay
// (chargé en lazy avec Recharts) pour que le menu puisse lister les boutons
// sans tirer la librairie de graphiques dans le bundle initial.

export const STAT_CHARTS = [
    {id: 'territoryEvolution', label: 'Territoire par tour'},
    {id: 'armyEvolution', label: 'Armée par tour'},
    {id: 'goldEvolution', label: 'Or par tour'},
    {id: 'economy', label: 'Économie du tour'},
    {id: 'territoryShare', label: 'Répartition du territoire'},
];
