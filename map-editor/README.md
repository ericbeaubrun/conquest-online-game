# Éditeur de cartes · Conquest

Outil visuel pour créer des cartes personnalisées **sans écrire de code**.

## Lancer l'éditeur

Ouvrez simplement `index.html` dans un navigateur (double-clic).
Aucune installation, aucun serveur : c'est du HTML/CSS/JS pur.

## Utilisation

1. **Dimensions** — saisissez largeur et hauteur, puis *Générer la grille*
   (un squelette d'hexagones apparaît, tout en herbe).
2. **Pinceau** — choisissez un type de case (herbe, forêt, montagne, sable,
   eau), un point de **départ** (1 à 4) ou **Trou** pour évider une case et
   créer des formes libres.
3. **Peindre** — cliquez une case, ou cliquez-glissez pour en peindre plusieurs.
   Un point de départ est unique : le repeindre le déplace.
4. **Identité** — donnez un nom et un identifiant à la carte.
5. **Exporter** — *Copier le code* ou *Télécharger*. Vous obtenez un bloc
   `defineAsciiMap({...})`.

## Ajouter la carte au jeu

Collez le bloc exporté dans le tableau `CUSTOM_MAPS` de
[`shared-engine/data/customMaps.js`](../shared-engine/data/customMaps.js).
La carte apparaît alors automatiquement dans les menus (hors-ligne et en ligne).

Pour **retirer** une carte, supprimez simplement son bloc du tableau.

## Bon à savoir

- Il faut **au moins 2 points de départ** pour qu'une carte soit jouable
  (l'éditeur prévient sinon).
- La géométrie et les couleurs sont identiques au jeu : ce que vous dessinez
  est ce que vous obtenez à l'écran (bords en zigzag dus au décalage des
  hexagones).
- Assurez-vous que toutes les cases se touchent : des îlots isolés par de l'eau
  ou des trous peuvent être injouables.
