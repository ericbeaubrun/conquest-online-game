// Traduit la sélection et le survol du plateau (état d'interface) en données
// prêtes à afficher : quel panneau montrer en bas, et quel aperçu (fusion /
// combat) superposer. Aucune règle n'est réécrite : `canMerge`, `mergedSoldier`
// et les stats des bâtiments viennent du moteur partagé.
import {BUILDING_STATS, canMerge, mergedSoldier} from '@conquest/shared-engine/engine/rules.js';
import {unitAt} from './board/targeting.js';

export function buildSelectionView(state, selection, hoverTarget) {
    const {players, placements, ownership, baseHp} = state;
    const selected = selection ? placements.get(selection.id) : null;

    // Soldat (allié jouable ou simple unité consultée) : panneau du soldat.
    const soldierView =
        selection?.kind === 'soldier' || selection?.kind === 'unit' ? selected : null;

    // Bâtiment : un item posé (tour, maison) ou la base d'une case spawn
    // (absente de `placements`, d'où les valeurs synthétisées).
    const buildingView =
        selection?.kind === 'building'
            ? selected
                ? {
                    type: selected.type,
                    hp: selected.hp ?? BUILDING_STATS[selected.type]?.hp ?? 0,
                    atk: selected.atk,
                    playerId: selected.playerId,
                }
                : {
                    type: 'base',
                    // PV courants de la base (elle peut avoir été assiégée).
                    hp: baseHp?.[selection.id] ?? BUILDING_STATS.base.hp,
                    playerId: ownership.get(selection.id),
                }
            : null;

    // Arbre : on affiche ses infos (récompense + coût) et le joueur dont il
    // occupe le territoire, le cas échéant.
    const treeOwner =
        selection?.kind === 'tree'
            ? players.find((p) => p.id === ownership.get(selection.id)) || null
            : null;

    // Case vide sélectionnée : la boutique bascule en « pose directe » (cliquer
    // un item le pose immédiatement sur cette case).
    const placeTarget = selection?.kind === 'tile' ? selection.id : null;

    // Aperçus : uniquement quand un soldat jouable survole une cible valide.
    const mover = selection?.kind === 'soldier' ? selected : null;
    const target =
        mover && hoverTarget && hoverTarget.id !== selection.id ? unitAt(state, hoverTarget.id) : null;
    const mergePreview =
        target && hoverTarget.kind === 'merge' && canMerge(mover, target)
            ? {from: mover, to: target, result: mergedSoldier(mover, target)}
            : null;
    const combatPreview =
        target && hoverTarget.kind === 'combat' ? {attacker: mover, defender: target} : null;

    return {soldierView, buildingView, treeOwner, placeTarget, mergePreview, combatPreview};
}
