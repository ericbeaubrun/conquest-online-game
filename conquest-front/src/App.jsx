import { useState } from 'react'
import './App.scss'
import './menu/menu.scss'
import HomePage from './menu/HomePage.jsx'
import OfflineSetup from './menu/OfflineSetup.jsx'
import LoadGame from './menu/LoadGame.jsx'
import OfflineGame from './OfflineGame.jsx'
import OnlineFlow from './OnlineFlow.jsx'

// Routeur d'écrans minimal (sans dépendance de routage). L'application navigue
// entre : l'accueil, la configuration d'une partie hors-ligne, la partie locale,
// et le flux en ligne (lobby + partie). La connexion viendra plus tard.
function App() {
    const [screen, setScreen] = useState('home') // 'home' | 'offline' | 'load' | 'game' | 'online'
    // Dernière configuration hors-ligne : conservée pour la relancer/ré-éditer.
    const [config, setConfig] = useState(null)
    // État sérialisé d'une sauvegarde à recharger (prime sur `config` quand présent).
    const [savedState, setSavedState] = useState(null)

    if (screen === 'offline') {
        return (
            <OfflineSetup
                initialConfig={config}
                onBack={() => setScreen('home')}
                onLaunch={(next) => {
                    setConfig(next)
                    setSavedState(null) // nouvelle partie : on repart d'un état neuf
                    setScreen('game')
                }}
                // Charger une partie : écran dédié, distinct de la création.
                onOpenLoad={() => setScreen('load')}
            />
        )
    }

    if (screen === 'load') {
        return (
            <LoadGame
                onBack={() => setScreen('offline')}
                // Rechargement d'une sauvegarde : on injecte son état figé.
                onLoadSave={(state) => {
                    setSavedState(state)
                    setScreen('game')
                }}
            />
        )
    }

    if (screen === 'game') {
        return (
            <OfflineGame
                config={config}
                savedState={savedState}
                onExit={() => setScreen('home')}
            />
        )
    }

    if (screen === 'online') {
        // Tout le flux en ligne (navigation lobby → salle d'attente → partie) est
        // géré par OnlineFlow, qui possède l'unique connexion socket.
        return <OnlineFlow onExit={() => setScreen('home')} />
    }

    return (
        <HomePage
            onPlayOffline={() => setScreen('offline')}
            onPlayOnline={() => setScreen('online')}
            // Connexion / inscription : écran à venir.
            onLogin={() => {}}
        />
    )
}

export default App
