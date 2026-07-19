// Hook des notifications « toast » : observe le journal d'évènements de l'état
// (`state.events`, alimenté par le reducer) et transforme les NOUVEAUX
// évènements en toasts affichés puis auto-effacés.
//
// Déduplication par `seq` (numéro monotone attribué par le reducer) : on ne
// notifie que les évènements dont la `seq` dépasse la dernière vue. Cela évite
// les doublons en online, où le même état (donc les mêmes évènements) peut
// arriver plusieurs fois (application optimiste locale, puis rediffusion
// serveur qui fait autorité) — les `seq` étant déterministes et identiques des
// deux côtés.

import {useEffect, useRef, useState} from 'react';
import {describeEvent} from './toastMessages.js';

// Durée d'affichage d'un toast (ms) avant disparition automatique.
const TOAST_TTL = 4500;
// Nombre maximum de toasts empilés simultanément (les plus anciens sont retirés).
const MAX_VISIBLE = 6;

export function useToasts(state) {
    const [toasts, setToasts] = useState([]);
    // Dernière `seq` déjà notifiée : évite de re-notifier un évènement connu.
    const lastSeenRef = useRef(0);
    // Compteur d'identifiants de toasts (clé React stable, indépendante de `seq`).
    const idRef = useRef(0);
    // Timers d'auto-effacement, pour nettoyage au démontage.
    const timersRef = useRef(new Map());

    const events = state?.events;
    const eventSeq = state?.eventSeq ?? 0;

    useEffect(() => {
        if (!events || !events.length) {
            // Nouvelle partie / état réinitialisé : le compteur repart de 0. On se
            // réaligne sans rien notifier rétroactivement.
            if (eventSeq < lastSeenRef.current) lastSeenRef.current = eventSeq;
            return;
        }
        // Réinitialisation détectée (rejouer une partie) : on repart proprement.
        if (eventSeq < lastSeenRef.current) lastSeenRef.current = 0;

        const fresh = events.filter((e) => e.seq > lastSeenRef.current);
        if (!fresh.length) return;
        lastSeenRef.current = eventSeq;

        const added = [];
        for (const event of fresh) {
            const desc = describeEvent(event, state);
            if (!desc) continue;
            idRef.current += 1;
            added.push({id: idRef.current, ...desc});
        }
        if (!added.length) return;

        setToasts((prev) => {
            const next = [...prev, ...added];
            return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
        });

        // Programme l'effacement de chaque nouveau toast.
        for (const t of added) {
            const timer = setTimeout(() => {
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
                timersRef.current.delete(t.id);
            }, TOAST_TTL);
            timersRef.current.set(t.id, timer);
        }
        // `state` est volontairement hors des dépendances : on réagit au journal
        // (`events`/`eventSeq`), et `describeEvent` lit l'état courant à la volée.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, eventSeq]);

    // Nettoyage des timers en attente au démontage.
    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            for (const timer of timers.values()) clearTimeout(timer);
            timers.clear();
        };
    }, []);

    // Fermeture manuelle d'un toast (clic).
    const dismiss = (id) => {
        const timer = timersRef.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
        setToasts((prev) => prev.filter((x) => x.id !== id));
    };

    return {toasts, dismiss};
}
