// Salle d'attente d'une partie en ligne : affiche le CODE à partager, l'état des
// sièges (occupés / libres) et permet à l'HÔTE (titulaire du 1er siège) de lancer
// la partie. Les autres joueurs patientent jusqu'au démarrage.

const LobbyWaiting = ({ lobby, localPlayerId, onStart, onQuit }) => {
    const seats = lobby?.seats || [];
    const isHost = seats[0]?.playerId === localPlayerId;
    const takenCount = seats.filter((s) => s.taken).length;
    const mySeat = seats.find((s) => s.playerId === localPlayerId);

    return (
        <div className="setup-screen">
            <header className="setup-topbar">
                <button className="menu-btn menu-btn--ghost" onClick={onQuit}>
                    ← Quitter
                </button>
                <h1 className="setup-topbar__title">Salle d’attente</h1>
                <span className="setup-topbar__spacer" />
            </header>

            <div className="setup-body">
                {/* Code à partager */}
                <section className="setup-section" style={{ textAlign: "center" }}>
                    <h2 className="setup-section__title" style={{ justifyContent: "center" }}>
                        Code de la partie
                    </h2>
                    <div
                        style={{
                            fontSize: "2.6rem",
                            fontWeight: 800,
                            letterSpacing: ".25em",
                            padding: ".4rem 0",
                        }}
                    >
                        {lobby?.code}
                    </div>
                    <p style={{ opacity: 0.7, margin: 0 }}>
                        Partage ce code pour que d’autres joueurs rejoignent.
                    </p>
                </section>

                {/* Sièges */}
                <section className="setup-section">
                    <h2 className="setup-section__title">
                        Joueurs
                        <span style={{ marginLeft: "auto", opacity: 0.7 }}>
                            {takenCount}/{seats.length}
                        </span>
                    </h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                        {seats.map((s) => {
                            const you = s.playerId === localPlayerId;
                            return (
                                <div
                                    key={s.playerId}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: ".6rem",
                                        padding: ".5rem .8rem",
                                        border: `1px solid ${you ? s.color : "#8884"}`,
                                        borderRadius: "8px",
                                    }}
                                >
                                    <span
                                        style={{
                                            width: "1rem",
                                            height: "1rem",
                                            borderRadius: "50%",
                                            background: s.color,
                                            display: "inline-block",
                                        }}
                                    />
                                    <strong>{s.name}</strong>
                                    {you && <span style={{ opacity: 0.7 }}>(vous)</span>}
                                    <span style={{ marginLeft: "auto", opacity: 0.7 }}>
                                        {s.taken ? "connecté" : "en attente…"}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {!mySeat && (
                        <p style={{ opacity: 0.7, marginTop: ".6rem" }}>
                            La partie est pleine : tu es spectateur.
                        </p>
                    )}
                </section>

                {/* Démarrage */}
                <section className="setup-section">
                    {isHost ? (
                        <>
                            <button
                                className="menu-btn menu-btn--play"
                                onClick={onStart}
                                disabled={takenCount < 2}
                            >
                                Démarrer la partie
                            </button>
                            {takenCount < 2 && (
                                <p style={{ opacity: 0.7, marginTop: ".5rem" }}>
                                    En attente d’au moins un autre joueur…
                                </p>
                            )}
                        </>
                    ) : (
                        <p style={{ opacity: 0.7 }}>En attente que l’hôte lance la partie…</p>
                    )}
                </section>
            </div>
        </div>
    );
};

export default LobbyWaiting;
