import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'mapbox-gl/dist/mapbox-gl.css';
import './styles/index.css';

import { App } from './App';

const root = document.getElementById('root');

if (!root) throw new Error('Root element was not found.');

createRoot(root).render(
  <StrictMode>
    {/* BASE_URL повторяет base из vite.config.ts: '/dev/' на dev-стенде, '/' на боевом */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
