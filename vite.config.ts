import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const staticFiles = ['favicon.svg', 'fighter-hero.png', 'manifest.webmanifest', '_headers', '.assetsignore']

export default defineConfig({
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'cutline-copy-static-files',
      closeBundle() {
        mkdirSync(resolve('dist'), { recursive: true })
        for (const file of staticFiles) {
          copyFileSync(resolve(file), resolve('dist', file))
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
