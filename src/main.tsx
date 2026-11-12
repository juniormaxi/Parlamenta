import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { DialogProvider } from './components/common/Dialogs';
import { PublicSitePage } from './components/public/PublicSitePage';
import './index.css';

// /site/<gabinete> — página pública do cidadão (sem login), incorporável no site do parlamentar.
const siteMatch = window.location.pathname.match(/^\/site\/([a-z0-9-]+)\/?$/);

createRoot(document.getElementById('root')!).render(
  <DialogProvider>
    {siteMatch ? <PublicSitePage slug={siteMatch[1]} /> : <App />}
  </DialogProvider>
);
