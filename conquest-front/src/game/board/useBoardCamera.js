// Caméra du plateau : cadrage (viewBox), zoom molette / boutons, glisser (pan)
// et pincer (pinch). Entièrement interne au client — rien n'en transite par le
// serveur. Le hook ne connaît pas les règles du jeu : il traduit les gestes en
// cadrage, et signale les clics utiles via `onTap` / `onRightClick`.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {CLICK_THRESHOLD, MIN_VIEW_RATIO} from './constants.js';

export function useBoardCamera({base, onTap, onRightClick}) {
    const svgRef = useRef(null);
    const [view, setView] = useState(base);
    const viewRef = useRef(view);
    viewRef.current = view; // toujours à jour pour les listeners natifs / gestes

    // Changement de carte : recentre la vue sur la nouvelle carte.
    useEffect(() => {
        setView(base);
    }, [base]);

    // --- Écran -> coordonnées SVG (compatible preserveAspectRatio="meet") ---
    const clientToSvg = useCallback((clientX, clientY, v = viewRef.current) => {
        const rect = svgRef.current.getBoundingClientRect();
        const scale = Math.min(rect.width / v.w, rect.height / v.h);
        const offsetX = (rect.width - v.w * scale) / 2;
        const offsetY = (rect.height - v.h * scale) / 2;
        return {
            x: v.x + (clientX - rect.left - offsetX) / scale,
            y: v.y + (clientY - rect.top - offsetY) / scale,
        };
    }, []);

    // Maintient la vue à l'intérieur de la carte et borne le zoom.
    const clampView = useCallback(
        (v) => {
            const w = Math.min(v.w, base.w);
            const h = Math.min(v.h, base.h);
            const x =
                w >= base.w
                    ? base.x + (base.w - w) / 2
                    : Math.min(Math.max(v.x, base.x), base.x + base.w - w);
            const y =
                h >= base.h
                    ? base.y + (base.h - h) / 2
                    : Math.min(Math.max(v.y, base.y), base.y + base.h - h);
            return {x, y, w, h};
        },
        [base]
    );

    // Zoom autour d'un point SVG donné, à partir d'une vue de départ.
    const zoomFrom = useCallback(
        (startView, svgX, svgY, factor) => {
            const minW = base.w * MIN_VIEW_RATIO;
            let cf = factor;
            if (startView.w * cf < minW) cf = minW / startView.w;
            if (startView.w * cf > base.w) cf = base.w / startView.w;
            const w = startView.w * cf;
            const h = startView.h * cf;
            const x = svgX - (svgX - startView.x) * cf;
            const y = svgY - (svgY - startView.y) * cf;
            return clampView({x, y, w, h});
        },
        [base, clampView]
    );

    // --- Molette : zoom vers le curseur ---
    useEffect(() => {
        const svg = svgRef.current;
        const onWheel = (e) => {
            e.preventDefault();
            const {x, y} = clientToSvg(e.clientX, e.clientY);
            setView((v) => zoomFrom(v, x, y, e.deltaY < 0 ? 0.85 : 1.18));
        };
        svg.addEventListener('wheel', onWheel, {passive: false});
        return () => svg.removeEventListener('wheel', onWheel);
    }, [clientToSvg, zoomFrom]);

    // --- Pointeurs : glisser (pan) + pincer (pinch) + tap (jouer une case) ---
    const pointers = useRef(new Map()); // pointerId -> {x, y}
    const gesture = useRef(null);
    const moved = useRef(false);
    // Un geste est en cours : l'appelant s'en sert pour taire les aperçus au survol.
    const isGesturing = useCallback(() => pointers.current.size > 0, []);

    const handlers = useMemo(() => ({
        onPointerDown: (e) => {
            if (e.button === 2) {
                onRightClick?.();
                return;
            }
            svgRef.current.setPointerCapture(e.pointerId);
            pointers.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
            if (pointers.current.size === 1) {
                moved.current = false;
                gesture.current = {
                    mode: 'pan',
                    startClient: {x: e.clientX, y: e.clientY},
                    startView: viewRef.current,
                };
            } else if (pointers.current.size === 2) {
                const [p1, p2] = [...pointers.current.values()];
                gesture.current = {
                    mode: 'pinch',
                    startDist: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1,
                    startView: viewRef.current,
                    mid: {x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2},
                };
                moved.current = true; // un pincement n'est jamais un tap
            }
        },

        onPointerMove: (e) => {
            if (!pointers.current.has(e.pointerId)) return;
            pointers.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
            const g = gesture.current;
            if (!g) return;

            if (g.mode === 'pan' && pointers.current.size === 1) {
                const dx = e.clientX - g.startClient.x;
                const dy = e.clientY - g.startClient.y;
                if (Math.hypot(dx, dy) > CLICK_THRESHOLD) moved.current = true;
                const rect = svgRef.current.getBoundingClientRect();
                const scale = Math.min(rect.width / g.startView.w, rect.height / g.startView.h);
                setView(
                    clampView({
                        x: g.startView.x - dx / scale,
                        y: g.startView.y - dy / scale,
                        w: g.startView.w,
                        h: g.startView.h,
                    })
                );
            } else if (g.mode === 'pinch' && pointers.current.size >= 2) {
                const [p1, p2] = [...pointers.current.values()];
                const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
                const {x, y} = clientToSvg(g.mid.x, g.mid.y, g.startView);
                setView(zoomFrom(g.startView, x, y, g.startDist / dist));
            }
        },

        onPointerUp: (e) => {
            pointers.current.delete(e.pointerId);
            try {
                svgRef.current.releasePointerCapture(e.pointerId);
            } catch {
                /* pointeur déjà relâché */
            }
            const g = gesture.current;
            if (g && g.mode === 'pan' && pointers.current.size === 0 && !moved.current) {
                onTap?.(e.clientX, e.clientY); // tap sans déplacement
            }
            if (pointers.current.size === 0) {
                gesture.current = null;
            } else if (pointers.current.size === 1) {
                const [p] = [...pointers.current.values()];
                gesture.current = {
                    mode: 'pan',
                    startClient: {x: p.x, y: p.y},
                    startView: viewRef.current,
                };
                moved.current = true; // reste d'un pincement : pas un tap
            }
        },
    }), [clampView, clientToSvg, zoomFrom, onTap, onRightClick]);

    // --- Boutons de zoom (autour du centre de la vue) et recentrage ---
    const zoomBy = useCallback(
        (factor) => setView((v) => zoomFrom(v, v.x + v.w / 2, v.y + v.h / 2, factor)),
        [zoomFrom]
    );
    const resetView = useCallback(() => setView(clampView(base)), [base, clampView]);

    return {
        svgRef,
        viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
        clientToSvg,
        isGesturing,
        handlers,
        zoomBy,
        resetView,
    };
}
