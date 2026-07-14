import {useEffect, useState} from 'react';
import {endTurn} from '@conquest/shared-engine/engine/actions.js';

// Chrono par tour (réglage `turnTimer`, en secondes ; 0 = désactivé). Quand il
// tombe à zéro, la main passe automatiquement au joueur suivant. Le décompte
// redémarre à chaque changement de joueur / de tour.
export function useTurnTimer(state, dispatch) {
    const {settings, status, activePlayerId, turn} = state;
    const turnTimer = settings?.turnTimer || 0;
    const [timeLeft, setTimeLeft] = useState(turnTimer);

    useEffect(() => {
        if (!turnTimer || status !== 'playing') return undefined;
        setTimeLeft(turnTimer);
        const startedAt = Date.now();
        const id = setInterval(() => {
            const remaining = turnTimer - Math.floor((Date.now() - startedAt) / 1000);
            setTimeLeft(remaining);
            if (remaining <= 0) {
                clearInterval(id);
                dispatch(endTurn());
            }
        }, 250);
        return () => clearInterval(id);
    }, [turnTimer, status, activePlayerId, turn, dispatch]);

    return {turnTimer, timeLeft};
}
