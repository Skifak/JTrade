import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteSingleFile } from 'vite-plugin-singlefile'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Tauri выставляет TAURI_DEV_HOST для мобильных билдов; на десктопе — undefined.
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  // Vite 8: прямой import 'cropperjs/dist/cropper.css' в dev не резолвится; вариант через
  // src/index.css тянет source с вложенным CSS (&) и падает на трансформе → NS_ERROR_* в FF.
  resolve: {
    alias: {
      'cropperjs/dist/cropper.css': resolve(
        __dirname,
        'node_modules/cropperjs/dist/cropper.css'
      )
    }
  },

  plugins: [svelte(), viteSingleFile()],

  // Чтобы Tauri-CLI не затирал свой лог Vite-овскими очистками экрана.
  clearScreen: false,

  server: {
    // strictPort: совпадает с devUrl в tauri.conf.json (5173).
    port: 5173,
    strictPort: true,
    host: host || false,
    watch: {
      // src-tauri пересобирает Cargo сам — Vite туда смотреть не нужно.
      ignored: ['**/src-tauri/**']
    }
  },

  build: {
    target: 'es2015',
    assetsInlineLimit: 100000000, // всё инлайнить
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        format: 'iife' // вместо es-модулей
      }
    }
  },

  base: './'
})
