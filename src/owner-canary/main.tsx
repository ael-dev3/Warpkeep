import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';

import { OwnerCanaryApp } from './OwnerCanaryApp';
import './ownerCanary.css';

class OwnerCanaryErrorBoundary extends Component<
  Readonly<{ children: ReactNode }>,
  Readonly<{ failed: boolean }>
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: unknown, _errorInfo: ErrorInfo) {
    // No exception, credential, identity, or server response is logged.
  }

  render() {
    return this.state.failed ? (
      <main className="owner-canary">
        <section className="owner-canary__panel" role="alert">
          <h1>Owner player canary unavailable</h1>
          <p>
            Close the Mini App host and require independent operator confirmation before continuing.
          </p>
        </section>
      </main>
    ) : this.props.children;
  }
}

document.documentElement.dataset.warpkeepOwnerCanary = 'v1';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OwnerCanaryErrorBoundary>
      <OwnerCanaryApp />
    </OwnerCanaryErrorBoundary>
  </React.StrictMode>,
);
