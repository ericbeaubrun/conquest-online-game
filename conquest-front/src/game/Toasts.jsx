// Pile de notifications « toast » affichée en surimpression du plateau. Reçoit
// la liste des toasts actifs (voir `useToasts`) et les rend empilés dans un coin
// de l'écran. Purement présentation : aucune logique de jeu ici.

const Toasts = ({toasts, onDismiss}) => {
    if (!toasts.length) return null;
    return (
        <div className="toasts" role="log" aria-live="polite">
            {toasts.map((t) => (
                <button
                    key={t.id}
                    type="button"
                    className={`toast toast--${t.tone}`}
                    onClick={() => onDismiss(t.id)}
                    title="Masquer"
                >
                    {/* Pastille à la couleur du joueur concerné. */}
                    {t.color && (
                        <span className="toast__dot" style={{background: t.color}} aria-hidden="true"/>
                    )}
                    <span className="toast__text">{t.text}</span>
                </button>
            ))}
        </div>
    );
};

export default Toasts;
