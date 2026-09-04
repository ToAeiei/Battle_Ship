import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { getTheme, setTheme } from './lib/ui.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/game.css';
import './styles/admin.css';

setTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
