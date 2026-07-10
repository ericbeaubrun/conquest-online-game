import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const rootDir = dirname(fileURLToPath(import.meta.url))
// Le moteur partagé vit à la racine du monorepo (../shared-engine), en dehors
// de la racine Vite (conquest-front). On l'expose via l'alias @shared et on
// autorise Vite à servir des fichiers hors de sa racine.
const sharedEngineDir = resolve(rootDir, '../shared-engine')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': sharedEngineDir,
    },
  },
  server: {
    // Respecte le port fourni par l'environnement (outil de preview), sinon 5173.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    fs: {
      // Autorise l'accès au moteur partagé situé au-dessus de la racine Vite.
      allow: [rootDir, sharedEngineDir],
    },
  },
})
