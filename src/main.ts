import { mount } from 'svelte';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch(() => {
      // A interface continua disponível, mas não promete acesso offline sem cache.
      window.dispatchEvent(new Event('offline-unavailable'));
    });
}
