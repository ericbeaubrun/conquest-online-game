import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // `@conquest/shared-engine` est un workspace lié : sans cette exclusion Vite le
  // pré-bundle une fois dans `node_modules/.vite` et les modifications du moteur
  // (barèmes, règles) restent invisibles en dev tant qu'on ne vide pas le cache.
  optimizeDeps: {
    exclude: ['@conquest/shared-engine'],
  },
  server: {
    // Respecte le port fourni par l'environnement (outil de preview), sinon 5173.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
