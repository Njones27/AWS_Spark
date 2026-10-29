import '@fontsource-variable/fredoka';
import '@fontsource-variable/lexend';
import '@xyflow/react/dist/style.css';
import './styles/theme.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
