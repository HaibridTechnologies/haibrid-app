import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import meticulous from '@alwaysmeticulous/recorder-plugin/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const token = env.METICULOUS_RECORDING_TOKEN

  return {
    plugins: [
      token ? meticulous({ recordingToken: token }) : null,
      react(),
    ].filter(Boolean),
    server: {
      port: 5173,
      proxy: {
        '/api':  'http://localhost:3000',
        '/pdfs': 'http://localhost:3000',
      },
    },
  }
})
