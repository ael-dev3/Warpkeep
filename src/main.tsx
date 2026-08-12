import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WarpkeepErrorBoundary } from './components/errors/WarpkeepErrorBoundary';
import { WARPKEEP_ROOT_ERROR_HANDLERS } from './components/errors/warpkeepRootErrorHandlers';
import './styles/global.css';

if (import.meta.env.VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED === 'true') {
  document.documentElement.dataset.warpkeepAdmissionNotificationsPresentation =
    'warpkeep-admission-notifications-presentation-enabled-v1';
}

ReactDOM.createRoot(
  document.getElementById('root')!,
  WARPKEEP_ROOT_ERROR_HANDLERS
).render(
  <React.StrictMode>
    <WarpkeepErrorBoundary>
      <App />
    </WarpkeepErrorBoundary>
  </React.StrictMode>
);
