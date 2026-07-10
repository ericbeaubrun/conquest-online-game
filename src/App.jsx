import { useState } from 'react'
import './App.scss'
import './menu/menu.scss'
import HomePage from './menu/HomePage.jsx'
import OfflineSetup from './menu/OfflineSetup.jsx'
import OfflineGame from './OfflineGame.jsx'
import OnlineFlow from './OnlineFlow.jsx'

// Routeur d'écrans minimal (sans dépendance de routage). L'application navigue
// entre : l'accueil, la configuration d'une partie hors-ligne, la partie locale,
// et le flux en ligne (lobby + partie). La connexion viendra plus tard.
function App() {
    const [screen, setScreen] = useState('home') // 'home' | 'offline' | 'game' | 'online'
    // Dernière configuration hors-ligne : conservée pour la relancer/ré-éditer.
    const [config, setConfig] = useState(null)

    if (screen === 'offline') {
        return (
            <OfflineSetup
                initialConfig={config}
                onBack={() => setScreen('home')}
                onLaunch={(next) => {
                    setConfig(next)
                    setScreen('game')
                }}
            />
        )
    }

    if (screen === 'game') {
        return <OfflineGame config={config} onExit={() => setScreen('home')} />
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
