import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WarpkeepErrorBoundary } from './components/errors/WarpkeepErrorBoundary';
import { WARPKEEP_ROOT_ERROR_HANDLERS } from './components/errors/warpkeepRootErrorHandlers';
import './styles/global.css';

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
