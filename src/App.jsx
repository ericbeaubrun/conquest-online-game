import { useState } from 'react'
import './App.scss'
import './menu/menu.scss'
import HomePage from './menu/HomePage.jsx'
import OfflineSetup from './menu/OfflineSetup.jsx'
import GameLayout from './GameLayout.jsx'

// Routeur d'écrans minimal (sans dépendance de routage). L'application navigue
// entre trois écrans : l'accueil, la configuration d'une partie hors-ligne, et
// la partie elle-même. La connexion et le mode online seront ajoutés plus tard.
function App() {
    const [screen, setScreen] = useState('home') // 'home' | 'offline' | 'game'
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
        return <GameLayout config={config} onExit={() => setScreen('home')} />
    }

    return (
        <HomePage
            onPlayOffline={() => setScreen('offline')}
            // Online : rejoint la partie de test partagée sur le serveur socket.io.
            // Room codée en dur pour l'instant (lobby/matchmaking à venir).
            onPlayOnline={() => {
                setConfig({ online: true, roomId: 'test' })
                setScreen('game')
            }}
            // Connexion / inscription : écran à venir.
            onLogin={() => {}}
        />
    )
}

export default App
