// Mise en forme des évènements de jeu (émis PAR LE REDUCER dans `state.events`)
// en notifications « toast » lisibles. L'engine reste sans dépendance
// d'affichage : il ne produit que des DONNÉES (kind + payload) ; toute la
// composition de texte (titres de soldats, libellés FR, couleurs) vit ici.
//
// `describeEvent(event, state)` renvoie `{ text, tone, color }` (ou `null` pour
// un évènement à ignorer). `tone` pilote la teinte du toast, `color` est la
// couleur du joueur concerné (pastille d'accent).

import {atkRankLabel, affinityLabel, bonusLabel, raceLabel} from '@conquest/shared-engine/data/soldier.js';
import {unitLabel, unitKindById} from '@conquest/shared-engine/data/units.js';
import {lootLabel} from '@conquest/shared-engine/data/chests.js';
import {SOLDIER_ATK_MAX} from '@conquest/shared-engine/engine/rules.js';
import {colorName} from '@conquest/shared-engine/data/colors.js';
import {ITEMS} from '@conquest/shared-engine/data/items.js';

// Couleur (hex) d'un joueur d'après son id.
const colorOf = (state, playerId) => state.players?.find((p) => p.id === playerId)?.color;
// Nom lisible de la couleur d'un joueur (« Rouge », « Bleu »…).
const sideName = (state, playerId) => colorName(colorOf(state, playerId));

// Libellé d'une structure (mort/achat).
const BUILDING_LABEL = {
    house: 'Maison',
    attackTower: "Tour d'attaque",
    defenseTower: 'Tour de défense',
    base: 'Base',
};
const buildingLabel = (id) => BUILDING_LABEL[id] ?? ITEMS.find((i) => i.id === id)?.name ?? 'Structure';

// Titre complet d'une unité pour les notifications : « Novice Ignorant Rouge »
// pour un soldat, un libellé dédié pour les unités invoquées et les structures.
function unitTitle(state, unit) {
    if (!unit) return 'Unité';
    const side = sideName(state, unit.playerId);
    if (unit.type === 'base') return `Base de ${side}`;
    if (unit.type !== 'soldier') return `${buildingLabel(unit.type)} ${side}`;
    // Unités invoquées / envoûtées : pas de rang d'attaque, le nom de leur
    // espèce au catalogue (« Squelette », « Dragon », « Corbeau »…).
    const summoned = unitLabel(unit);
    if (summoned) return `${summoned} ${side}`;
    const rank = atkRankLabel(unit.atk, SOLDIER_ATK_MAX);
    const race = raceLabel(unit);
    return `${rank} ${race} ${side}`;
}

// Suffixe « (−N or) » / « (+N or) » pour les évènements avec coût/gain.
const spend = (n) => `(−${n} or)`;
const earn = (n) => `(+${n} or)`;

// Fabrique un descripteur de toast à partir d'un évènement du journal.
// `null` = évènement sans notification.
export function describeEvent(event, state) {
    const side = event.playerId != null ? sideName(state, event.playerId) : null;
    const color = event.playerId != null ? colorOf(state, event.playerId) : null;

    switch (event.kind) {
        // --- Achats en boutique ---
        case 'buySoldier':
            return {tone: 'buy', color, text: `${side} : soldat niveau ${event.level} acheté ${spend(event.cost)}`};
        case 'buyBuilding':
            return {tone: 'buy', color, text: `${side} : ${buildingLabel(event.itemType)} construite ${spend(event.cost)}`};
        case 'buyAffinity':
            return {tone: 'buy', color, text: `${side} : affinité ${affinityLabel(event.affinity)} appliquée ${spend(event.cost)}`};
        case 'buyBonus':
            return {tone: 'buy', color, text: `${side} : bonus ${bonusLabel(event.bonusId)} équipé ${spend(event.cost)}`};

        // --- Fusion ---
        case 'merge':
            return {tone: 'merge', color, text: `${side} : fusion → niveau ${event.level}`};

        // --- Combat / morts ---
        case 'attack':
            return {
                tone: 'combat',
                color: colorOf(state, event.attacker?.playerId),
                text: `${unitTitle(state, event.attacker)} attaque ${unitTitle(state, event.defender)}`,
            };
        case 'death': {
            const isBase = event.unit?.type === 'base';
            return {
                tone: isBase ? 'base' : 'death',
                color: colorOf(state, event.unit?.playerId),
                text: isBase
                    ? `${unitTitle(state, event.unit)} détruite !`
                    : `${unitTitle(state, event.unit)} a été tué`,
            };
        }

        // --- Coffres ---
        case 'chestOpened':
            return {tone: 'buy', color, text: `${side} : coffre ouvert — ${lootLabel({kind: event.loot})} à ramasser`};
        case 'lootGold':
            return {tone: 'buy', color, text: `${side} : butin ramassé ${earn(event.amount)}`};
        case 'lootAffinity':
            return {
                tone: 'bonus',
                color,
                text: event.gained
                    ? `${side} : butin — affinité ${affinityLabel(event.affinity)} obtenue`
                    : `${side} : butin — affinité ${affinityLabel(event.affinity)} perdue (soldat déjà élémentaire)`,
            };
        case 'lootStat': {
            const stat = event.stat === 'hp' ? 'PV' : 'ATK';
            return {
                tone: 'bonus',
                color,
                text: event.amount > 0
                    ? `${side} : butin — +${event.amount} ${stat}`
                    : `${side} : butin — ${stat} déjà au maximum`,
            };
        }
        case 'lootUnit':
            return {tone: 'bonus', color, text: `${side} : butin — ${unitKindById(event.unit)?.label ?? 'renfort'} allié rejoint le combat`};

        // --- Effets de bonus (souvent peu visuels) ---
        case 'bonusUndead':
            return {tone: 'bonus', color, text: `${side} — Mort-vivant : squelette laissé sur place`};
        case 'bonusBlackKnight':
            return {tone: 'bonus', color, text: `${side} — Chevalier noir : statistiques du squelette absorbées`};
        case 'bonusDruid':
            return {tone: 'bonus', color, text: `${side} — Druide : arbre transformé en allié`};
        case 'bonusFarmer':
            return {tone: 'bonus', color, text: `${side} — Fermier : ${event.count} arbre${event.count > 1 ? 's' : ''} poussé${event.count > 1 ? 's' : ''}`};
        case 'bonusAlchemist':
            return {tone: 'bonus', color, text: `${side} — Alchimiste : +1 ATK à un allié (−1 PV)`};
        case 'bonusPriest':
            return {tone: 'bonus', color, text: `${side} — Prêtre : +1 PV à un allié (−1 PV)`};
        case 'bonusVampire':
            return {tone: 'bonus', color, text: `${side} — Vampire : ${event.amount} PV drainés`};
        case 'bonusMagician':
            return {tone: 'bonus', color, text: `${side} — Magicien : affinité ${affinityLabel(event.affinity)} offerte ${earn(event.gold)}`};
        case 'bonusWarlock':
            return {tone: 'bonus', color, text: `${side} — Démoniste : squelette invoqué`};
        case 'bonusConqueror':
            return {tone: 'bonus', color, text: `${side} — Conquérant : ${event.count} case${event.count > 1 ? 's' : ''} annexée${event.count > 1 ? 's' : ''}`};
        case 'bonusSorcerer':
            return {tone: 'bonus', color, text: `${side} — Sorcier : ${event.count} ennemi${event.count > 1 ? 's' : ''} envoûté${event.count > 1 ? 's' : ''}`};
        case 'bonusSorcererDragon':
            return {tone: 'bonus', color, text: `${side} — Sorcier : dragon invoqué`};
        case 'bonusKing':
            return {tone: 'bonus', color, text: `${side} — Roi : +${event.amount} or de revenu`};

        default:
            return null;
    }
}
