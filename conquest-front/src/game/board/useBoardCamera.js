// Caméra du plateau : cadrage (viewBox), zoom molette / boutons, glisser (pan)
// et pincer (pinch). Entièrement interne au client — rien n'en transite par le
// serveur. Le hook ne connaît pas les règles du jeu : il traduit les gestes en
// cadrage, et signale les clics utiles via `onTap` / `onRightClick`.
//
// PERFORMANCE — pourquoi deux vues au lieu d'une. Changer le `viewBox` d'un SVG
// force le navigateur à re-rastériser TOUT le contenu (chaque polygone, chaque
// image) : à 60 images par seconde pendant un glissement, c'est intenable sur
// mobile. On distingue donc :
//   - la vue COMMITÉE (`view`, état React) : celle réellement posée en `viewBox` ;
//   - la vue AFFICHÉE (`viewRef`) : celle que voit le joueur pendant le geste.
// Tant qu'un geste est en cours, seule la seconde bouge, et l'écart entre les
// deux est rendu par un `transform` CSS écrit DIRECTEMENT sur le `<g>` racine
// (`contentRef`) — sans re-rendu React, et composité par le GPU. Au relâchement,
// la vue affichée est commitée dans le `viewBox` et le transform revient à
// l'identité, en une seule repeinte.
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {CLICK_THRESHOLD, MIN_VIEW_RATIO} from './constants.js';

// Délai d'inactivité après lequel un zoom molette est commité dans le viewBox.
// La molette arrive par à-coups : on laisse le transform absorber la rafale,
// puis on repasse en rendu natif une fois le joueur immobile.
const WHEEL_COMMIT_DELAY = 180;

export function useBoardCamera({base, onTap, onRightClick, enabled = true}) {
    const svgRef = useRef(null);
    // `<g>` racine portant tout le contenu du plateau : c'est lui qu'on
    // translate/scale pendant les gestes.
    const contentRef = useRef(null);

    const [view, setView] = useState(base); // vue COMMITÉE (= viewBox)
    const committedRef = useRef(view); // même valeur, lisible hors rendu
    const viewRef = useRef(view); // vue AFFICHÉE (live), suivie par les gestes

    // Pose l'écart « vue commitée -> vue affichée » sous forme de transform.
    //
    // Le `viewBox` commité C et la vue voulue V ayant le même rapport largeur /
    // hauteur, `meet` leur donne la MÊME échelle d'écran et le MÊME offset de
    // centrage. Afficher V sous le viewBox C revient donc à appliquer au contenu
    // l'affine, en unités utilisateur : p -> k*p + (C.o - k*V.o), avec k = C.w/V.w.
    // (Le CSS de `.hex-board__content` fixe `transform-box: view-box` et
    // `transform-origin: 0 0` pour que ce calcul soit exact.)
    const applyLive = useCallback((v) => {
        viewRef.current = v;
        const node = contentRef.current;
        if (!node) return;
        const c = committedRef.current;
        if (v.x === c.x && v.y === c.y && v.w === c.w) {
            node.style.transform = '';
            return;
        }
        const k = c.w / v.w;
        node.style.transform = `translate(${c.x - k * v.x}px, ${c.y - k * v.y}px) scale(${k})`;
    }, []);

    // Après chaque commit (rendu avec le nouveau viewBox), le transform doit
    // retomber à l'identité DANS LA MÊME IMAGE, sinon le plateau saute d'une
    // frame. D'où le layout effect, exécuté avant la peinture.
    useLayoutEffect(() => {
        committedRef.current = view;
        applyLive(viewRef.current);
    }, [view, applyLive]);

    // Fige la vue affichée dans le viewBox (retour au rendu natif, net).
    const commit = useCallback(() => setView(viewRef.current), []);
    // Saute directement à une vue (boutons, changement de carte) : rien à animer.
    const jumpTo = useCallback((v) => {
        viewRef.current = v;
        setView(v);
    }, []);

    // Le contenu n'est promu en couche GPU que le temps du geste : une couche
    // permanente serait rastérisée à l'échelle du commit et rendrait le
    // pixel art flou entre deux zooms.
    const setComposited = useCallback((on) => {
        const node = contentRef.current;
        if (node) node.style.willChange = on ? 'transform' : '';
    }, []);

    // Changement de carte : recentre la vue sur la nouvelle carte.
    useEffect(() => {
        jumpTo(base);
    }, [base, jumpTo]);

    // --- Écran -> coordonnées SVG (compatible preserveAspectRatio="meet") ---
    // Par défaut sur la vue AFFICHÉE : le pointage doit suivre ce que le joueur
    // voit, y compris au milieu d'un geste non encore commité.
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
    const wheelCommit = useRef(null);
    useEffect(() => {
        if (!enabled) return undefined;
        const svg = svgRef.current;
        const onWheel = (e) => {
            e.preventDefault();
            const {x, y} = clientToSvg(e.clientX, e.clientY);
            setComposited(true);
            applyLive(zoomFrom(viewRef.current, x, y, e.deltaY < 0 ? 0.85 : 1.18));
            clearTimeout(wheelCommit.current);
            wheelCommit.current = setTimeout(() => {
                setComposited(false);
                commit();
            }, WHEEL_COMMIT_DELAY);
        };
        svg.addEventListener('wheel', onWheel, {passive: false});
        return () => {
            svg.removeEventListener('wheel', onWheel);
            clearTimeout(wheelCommit.current);
        };
    }, [enabled, clientToSvg, zoomFrom, applyLive, commit, setComposited]);

    // --- Pointeurs : glisser (pan) + pincer (pinch) + tap (jouer une case) ---
    const pointers = useRef(new Map()); // pointerId -> {x, y}
    const gesture = useRef(null);
    const moved = useRef(false);
    // Un geste est en cours : l'appelant s'en sert pour taire les aperçus au survol.
    const isGesturing = useCallback(() => pointers.current.size > 0, []);

    const handlers = useMemo(() => {
        // Mode embarqué (mini-démo de l'accueil) : aucune capture de molette,
        // aucun pan/zoom. Un simple clic reste un tap de plateau et le défilement
        // tactile vertical continue d'appartenir à la page.
        if (!enabled) {
            return {
                onClick: (e) => onTap?.(e.clientX, e.clientY),
                onContextMenu: (e) => {
                    e.preventDefault();
                    onRightClick?.();
                },
            };
        }
        return {
        onPointerDown: (e) => {
            if (e.button === 2) {
                onRightClick?.();
                return;
            }
            svgRef.current.setPointerCapture(e.pointerId);
            pointers.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
            setComposited(true);
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
                applyLive(
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
                applyLive(zoomFrom(g.startView, x, y, g.startDist / dist));
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
                // Fin du geste : on repasse en rendu natif (viewBox), net et
                // sans couche GPU résiduelle.
                setComposited(false);
                commit();
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
        };
    }, [enabled, clampView, clientToSvg, zoomFrom, onTap, onRightClick, applyLive, commit, setComposited]);

    // --- Boutons de zoom (autour du centre de la vue) et recentrage ---
    const zoomBy = useCallback(
        (factor) => {
            const v = viewRef.current;
            jumpTo(zoomFrom(v, v.x + v.w / 2, v.y + v.h / 2, factor));
        },
        [zoomFrom, jumpTo]
    );
    const resetView = useCallback(() => jumpTo(clampView(base)), [base, clampView, jumpTo]);

    return {
        svgRef,
        contentRef,
        viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
        clientToSvg,
        isGesturing,
        handlers,
        zoomBy,
        resetView,
    };
}
