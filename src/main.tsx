import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

try {

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        registration.update().catch(() => {});
      }
    },
    onRegisterError() {
      // Non-fatal in preview or restricted environments
    },
  });
} catch {
  // Ignore non-fatal SW registration issues
}

createRoot(document.getElementById('root')!).render(<App />);
