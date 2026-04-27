import { mount } from 'svelte'
import './app.css'
import './lib/theme'
import App from './App.svelte'

function start() {
  const el = document.getElementById('app')
  if (!el) {
    console.error('[trader-journal] #app not found')
    return
  }
  return mount(App, { target: el })
}

/** Vite+singlefile кладёт inline-бандл в <head> → раньше <div id="app">; без ожидания DOM mount падает (file:// / dist). */
let app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app = start()
  })
} else {
  app = start()
}

export default app
