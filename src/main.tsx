import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { DialogProvider } from './components/common/Dialogs';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <DialogProvider>
    <App />
  </DialogProvider>
);
