// Retour au DÉBUT DE TOUR : restitution d'un état figé, EN DEHORS du reducer.
//
// Ce n'est pas une règle du jeu mais un filet de sécurité offert au joueur (clic
// manqué, tour mal engagé, envie d'essayer une ouverture puis de se raviser).
// Ça ne peut donc PAS être une action du reducer : celui-ci est une fonction
// pure, sans aucune mémoire du passé. L'instantané est conservé par l'APPELANT —
// la session front en hors-ligne, le lobby serveur en ligne. En ligne il reste
// côté serveur : si le client envoyait lui-même l'état à restaurer, n'importe
// qui pourrait injecter un plateau arbitraire.
//
// Ce module vit dans l'engine partagé (et non côté front) parce que les DEUX
// côtés doivent calculer le même état restauré, au bit près : le client
// l'applique optimistiquement, le serveur rediffuse ensuite le sien.

import {emit} from './events.js';

// Restaure `turnStart` (instantané pris au début du tour courant) par-dessus
// `current`.
//
// Le JOURNAL D'ÉVÈNEMENTS, lui, ne recule pas : il est repris de l'état courant
// et reçoit un évènement `turnReset`. C'est volontaire à deux titres. D'abord
// les notifications déjà affichées ne peuvent pas être « dé-vues » — en ligne,
// les adversaires ont assisté au tour en direct, mieux vaut leur annoncer sa
// réinitialisation que de faire reculer leur plateau sans un mot. Ensuite une
// `seq` qui reculerait ferait re-notifier tout le journal chez chaque client
// (déduplication par `seq` croissante, cf. `useToasts`).
//
// Renvoie `current` INCHANGÉ quand la restitution n'a pas lieu d'être : c'est ce
// que teste l'appelant pour savoir si quelque chose s'est passé.
export function restoreTurnStart(current, turnStart) {
    if (!current || !turnStart || turnStart === current) return current;
    // Partie terminée : le tour n'est plus à rejouer (l'écran de fin est ouvert,
    // et une victoire ne se dé-gagne pas d'un clic).
    if (current.status !== 'playing') return current;
    // GARDE-FOU : on ne franchit JAMAIS une frontière de tour. Un instantané
    // périmé (partie reprise après sauvegarde, message arrivé en retard)
    // ressusciterait le tour d'un autre joueur — avec son revenu, ses
    // apparitions et ses combats. Pendant un tour, ni la main ni le compteur de
    // tours ne bougent : leur égalité suffit à identifier le même tour.
    if (turnStart.activePlayerId !== current.activePlayerId) return current;
    if (turnStart.turn !== current.turn) return current;

    return emit(
        {...turnStart, events: current.events, eventSeq: current.eventSeq},
        {kind: 'turnReset', playerId: current.activePlayerId}
    );
}
