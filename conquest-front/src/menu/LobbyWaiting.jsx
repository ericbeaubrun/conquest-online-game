// Salle d'attente d'une partie en ligne, qui fait aussi office d'écran de
// PARAMÉTRAGE. Même structure que la configuration hors-ligne — Carte, Joueurs,
// Réglages avancés — avec deux différences propres à l'online :
//   - la carte se choisit dans un CAROUSEL (sélection réduite de cartes) ;
//   - la liste des joueurs suit les SIÈGES du serveur (connecté / en attente),
//     sans ajout ni retrait manuel.
// Seul l'HÔTE (titulaire du 1er siège) peut modifier la carte et les réglages :
// ses changements sont diffusés en direct aux autres joueurs (lecture seule).
// Les réglages avancés sont EXACTEMENT ceux de l'offline (composant partagé).

import { useEffect, useMemo, useRef, useState } from "react";
import MapSelector from "./MapSelector.jsx";
import { AdvancedSettings, ColorPicker, Segmented } from "./SetupControls.jsx";
import { defaultSettings, BOT_DIFFICULTIES } from "./setupConfig.js";

const difficultyLabel = (id) => BOT_DIFFICULTIES.find((d) => d.id === id)?.label || id;

// Réglages complets : défauts du moteur garnis des valeurs venues du serveur.
const fullSettings = (raw) => ({ ...defaultSettings(), ...(raw || {}) });

const LobbyWaiting = ({
    lobby,
    memberId,
    onConfigure,
    onReorder,
    onSeatKind,
    onSetBotDifficulty,
    onSetIdentity,
    onStart,
    onBack,
}) => {
    const seats = lobby?.seats || [];
    const isHost = lobby?.hostMemberId != null && lobby.hostMemberId === memberId;
    const mySeat = seats.find((s) => s.assignedMemberId === memberId);

    const isFilled = (s) => s.taken;
    const filledCount = seats.filter(isFilled).length;
    // Démarrage possible dès 2 participants — le lobby n'a pas besoin d'être
    // plein, les places libres restent des spawns neutres.
    const canStart = filledCount >= 2;

    // Couleurs des spawns pour l'aperçu : couleur du membre/défaut, atténuée si
    // la place est libre.
    const spawnInfo = useMemo(
        () => seats.map((s) => ({ color: s.color, filled: isFilled(s) })),
        [seats]
    );

    // Couleurs déjà utilisées : interdites pour toute autre sélection. Le
    // ColorPicker exclut lui-même la couleur courante (`!== value`), donc on
    // peut passer l'ensemble complet à chaque sélecteur.
    const usedColors = useMemo(
        () => new Set(seats.filter(isFilled).map((s) => s.color)),
        [seats]
    );

    // Champ de nom : état LOCAL (frappe fluide, sans aller-retour serveur par
    // touche). Amorcé une fois depuis mon siège (nom pré-rempli via localStorage).
    const [nameDraft, setNameDraft] = useState("");
    // Section « Réglages avancés » repliable, fermée par défaut.
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const seeded = useRef(false);
    useEffect(() => {
        if (!seeded.current && mySeat) {
            setNameDraft(mySeat.name || "");
            seeded.current = true;
        }
    }, [mySeat]);

    // Sauvegarde automatique (config hôte). L'activation est activée par défaut.
    // Le mot de passe est un champ en ÉCRITURE SEULE : le serveur ne le renvoie
    // jamais (il ne transmet que `hasPassword`), donc rien ne l'amorce ici. Le
    // laisser vide ne l'efface pas — seule une frappe envoie une nouvelle valeur.
    const autosave = lobby?.autosave !== false;
    const [savePwDraft, setSavePwDraft] = useState("");
    // Une protection existe-t-elle côté serveur ? (Le serveur n'envoie que cet
    // indicateur, jamais le mot de passe.)
    const hasPassword = !!lobby?.hasPassword;
    // ...et l'hôte n'y a-t-il pas retouché ? Sert à le dire à l'écran plutôt que
    // d'afficher un champ vide laissant croire qu'aucune protection n'existe.
    const pwAlreadySet = hasPassword && savePwDraft === "";
    const changeAutosave = (v) => {
        if (isHost) onConfigure?.({ autosave: v });
    };
    // La saisie reste LOCALE ; on ne transmet qu'à la validation (sortie du champ
    // ou touche Entrée). Le serveur dérive une empreinte scrypt à chaque valeur
    // reçue — volontairement coûteuse — : envoyer à chaque frappe lui ferait
    // calculer autant d'empreintes que de caractères, toutes jetées sauf la
    // dernière. `sentPw` évite aussi de renvoyer une valeur inchangée.
    const sentPw = useRef(null);
    const commitSavePassword = () => {
        if (!isHost || sentPw.current === savePwDraft) return;
        sentPw.current = savePwDraft;
        onConfigure?.({ savePassword: savePwDraft });
    };

    const changeName = (v) => {
        setNameDraft(v);
        onSetIdentity?.({ name: v });
    };
    const changeColor = (color) => onSetIdentity?.({ color });

    // Réglages : l'hôte édite une copie LOCALE (ressenti instantané) et diffuse
    // au serveur ; les autres joueurs lisent directement l'état du lobby.
    const [draft, setDraft] = useState(() => fullSettings(lobby?.settings));
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const settings = isHost ? draft : fullSettings(lobby?.settings);

    const updateSetting = (id, value) => {
        if (!isHost) return;
        const next = { ...draftRef.current, [id]: value };
        setDraft(next);
        onConfigure?.({ settings: next });
    };

    const selectMap = (mapId) => {
        if (isHost) onConfigure?.({ mapId });
    };

    return (
        <div className="setup-screen setup-screen--online">
            <header className="setup-topbar">
                <button type="button" className="menu-btn menu-btn--ghost" onClick={onBack}>
                    <i className="menu-btn__back-icon" aria-hidden="true" />
                    Retour
                </button>
                <div className="setup-topbar__heading">
                    <span className="setup-topbar__eyebrow">Salon multijoueur</span>
                    <h1 className="setup-topbar__title">Salle d’attente</h1>
                </div>
                <span className="lobby-codechip" title="Code à partager">
                    <small>CODE DE PARTIE</small>
                    <strong>{lobby?.code}</strong>
                </span>
            </header>

            <div className="setup-body">
                {/* --- Section CARTE --- */}
                <section className="setup-section">
                    <h2 className="setup-section__title">Carte</h2>
                    <MapSelector
                        mapId={lobby?.mapId}
                        onSelect={selectMap}
                        disabled={!isHost}
                        spawnInfo={spawnInfo}
                    />
                    {!isHost && (
                        <p className="lobby-hint">Seul l’hôte peut changer la carte.</p>
                    )}
                </section>

                {/* --- Section JOUEURS --- */}
                <section className="setup-section">
                    <h2 className="setup-section__title">
                        Joueurs
                        <span className="setup-section__count">
                            {filledCount}/{seats.length}
                        </span>
                    </h2>
                    <div className="player-list">
                        {seats.map((s, i) => {
                            const you = s.assignedMemberId === memberId;
                            const isBot = s.kind === "bot";
                            const filled = s.taken || isBot;
                            // L'hôte peut réordonner toute place POURVUE (joueur ou bot).
                            const canReorder = isHost && filled;
                            return (
                                <div className="player-row player-row--seat" key={s.playerId}>
                                    {/* Couleur : éditable pour MON siège, et pour un
                                        BOT si je suis l'hôte ; sinon simple pastille
                                        (atténuée quand la place est libre). */}
                                    {you || (isHost && isBot) ? (
                                        <ColorPicker
                                            value={s.color}
                                            used={usedColors}
                                            label={i + 1}
                                            onChange={changeColor}
                                        />
                                    ) : (
                                        <span
                                            className={`seat__swatch ${filled ? "" : "seat__swatch--free"}`}
                                            style={filled ? { backgroundColor: s.color } : undefined}
                                        >
                                            {i + 1}
                                        </span>
                                    )}

                                    {/* Colonne du nom : champ éditable pour SON siège ; pour
                                        l'hôte sur une place NON occupée, la bascule Joueur/Bot
                                        (et la difficulté) prend la place ; sinon le nom /
                                        « Bot (difficulté) » / « Libre ». */}
                                    {you ? (
                                        <input
                                            className="seat__input"
                                            type="text"
                                            maxLength={16}
                                            value={nameDraft}
                                            placeholder="Ton nom"
                                            onChange={(e) => changeName(e.target.value)}
                                        />
                                    ) : isHost && !s.assignedMemberId ? (
                                        <div className="seat__slotctrl">
                                            <Segmented
                                                size="sm"
                                                options={[
                                                    { value: "human", label: "Joueur" },
                                                    { value: "bot", label: "Bot" },
                                                ]}
                                                value={s.kind}
                                                onChange={(kind) => onSeatKind?.(s.playerId, kind)}
                                            />
                                            {isBot && (
                                                <Segmented
                                                    size="sm"
                                                    options={BOT_DIFFICULTIES.map((d) => ({
                                                        value: d.id,
                                                        label: d.label,
                                                    }))}
                                                    value={s.botDifficulty || "normal"}
                                                    onChange={(botDifficulty) =>
                                                        onSetBotDifficulty?.(s.playerId, botDifficulty)
                                                    }
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <span className="seat__name">
                                            {isBot
                                                ? `Bot (${difficultyLabel(s.botDifficulty)})`
                                                : s.taken ? s.name : "Libre"}
                                        </span>
                                    )}
                                    {s.taken && s.assignedMemberId === lobby?.hostMemberId && (
                                        <img
                                            className="seat__host-crown"
                                            src="/crown.png"
                                            alt="Hôte"
                                            title="Hôte"
                                        />
                                    )}
                                    {you && <span className="seat__you">(vous)</span>}

                                    <span className="seat__ctrls">
                                        {/* Statut à droite : « occupé » (vert) pour une place
                                            pourvue (joueur ayant rejoint OU bot), sinon le
                                            libellé d'attente pour une place restée libre. */}
                                        {filled ? (
                                            <span className="seat__status seat__status--on">
                                                occupé
                                            </span>
                                        ) : isHost ? (
                                            <span className="seat__waiting">
                                                en attente de joueur…
                                            </span>
                                        ) : null}

                                        {isHost && (
                                            <span className="seat__reorder">
                                                <button
                                                    type="button"
                                                    className="seat__arrow"
                                                    onClick={() => onReorder?.(s.playerId, "up")}
                                                    disabled={!canReorder || i === 0}
                                                    title="Monter"
                                                    aria-label="Monter d’une position"
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    type="button"
                                                    className="seat__arrow"
                                                    onClick={() => onReorder?.(s.playerId, "down")}
                                                    disabled={!canReorder || i === seats.length - 1}
                                                    title="Descendre"
                                                    aria-label="Descendre d’une position"
                                                >
                                                    ↓
                                                </button>
                                            </span>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {!mySeat && (
                        <p className="lobby-hint">La partie est pleine : tu es spectateur.</p>
                    )}
                    {isHost && !canStart && (
                        <p className="lobby-hint">
                            Il faut au moins 2 participants pour démarrer. Attends d’autres
                            joueurs — les places restées libres seront des positions neutres.
                        </p>
                    )}
                </section>

                {/* --- Section SAUVEGARDE AUTOMATIQUE --- */}
                <section className="setup-section">
                    <h2 className="setup-section__title">Sauvegarde automatique</h2>
                    {!isHost && (
                        <p className="lobby-hint">Réglée par l’hôte — lecture seule.</p>
                    )}
                    <div className="setting">
                        <div className="setting__text">
                            <span className="setting__label">Sauvegarder la partie</span>
                            <span className="setting__help">
                                Si activé, la partie est conservée quand tous les joueurs la
                                quittent (reprise par mot de passe). Sinon elle est supprimée.
                            </span>
                        </div>
                        <div className="setting__control">
                            <Segmented
                                size="sm"
                                disabled={!isHost}
                                options={[
                                    { value: true, label: "Oui" },
                                    { value: false, label: "Non" },
                                ]}
                                value={autosave}
                                onChange={changeAutosave}
                            />
                        </div>
                    </div>
                    {autosave && (
                        <div className="setting">
                            <div className="setting__text">
                                <span className="setting__label">Mot de passe</span>
                                <span className="setting__help">
                                    {isHost
                                        ? pwAlreadySet
                                            ? "Un mot de passe protège déjà cette partie. Saisir ici le remplace ; le champ vide le laisse inchangé."
                                            : "Demandé pour reprendre la partie sauvegardée (laisser vide = aucun). Validé en quittant le champ."
                                        : hasPassword
                                          ? "Cette partie est protégée par un mot de passe, connu de l'hôte seul."
                                          : "Aucun mot de passe : la partie sauvegardée sera librement reprenable."}
                                </span>
                            </div>
                            <div className="setting__control">
                                <input
                                    className="seat__input"
                                    // Mot de passe masqué à la frappe, et JAMAIS
                                    // pré-rempli : le serveur ne le renvoie pas.
                                    type="password"
                                    autoComplete="new-password"
                                    maxLength={64}
                                    disabled={!isHost}
                                    value={isHost ? savePwDraft : ""}
                                    placeholder={hasPassword ? "(défini)" : "(aucun)"}
                                    onChange={(e) => setSavePwDraft(e.target.value)}
                                    onBlur={commitSavePassword}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            commitSavePassword();
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </section>

                {/* --- Section RÉGLAGES (partagée avec l'offline) --- */}
                <section className="setup-section setup-section--advanced">
                    <button
                        type="button"
                        className={`setup-section__toggle ${advancedOpen ? "setup-section__toggle--open" : ""}`}
                        onClick={() => setAdvancedOpen((o) => !o)}
                        aria-expanded={advancedOpen}
                    >
                        <span className="setup-section__title">Réglages avancés</span>
                        <span className="setup-section__chevron">{advancedOpen ? "▲" : "▼"}</span>
                    </button>
                    {advancedOpen && (
                        <>
                            {!isHost && (
                                <p className="lobby-hint">Réglés par l’hôte — lecture seule.</p>
                            )}
                            <AdvancedSettings
                                settings={settings}
                                onChange={updateSetting}
                                disabled={!isHost}
                            />
                        </>
                    )}
                </section>
            </div>

            {/* Bandeau de lancement */}
            <footer className="setup-launchbar">
                <span className="setup-launchbar__summary">
                    <span>Partage le code</span>
                    <strong className="lobby-shared-code">{lobby?.code}</strong>
                    <span>· {filledCount}/{seats.length} places pourvues</span>
                </span>
                {isHost ? (
                    <button
                        className="menu-btn menu-btn--play menu-btn--launch"
                        onClick={onStart}
                        disabled={!canStart}
                    >
                        {canStart ? "LANCER" : "2 participants minimum…"}
                    </button>
                ) : (
                    <span className="setup-launchbar__summary">
                        En attente que l’hôte lance la partie…
                    </span>
                )}
            </footer>
        </div>
    );
};

export default LobbyWaiting;
