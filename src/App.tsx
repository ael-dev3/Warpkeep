import { lazy, Suspense } from 'react';

const WarpkeepRuntime = lazy(() => import('./WarpkeepRuntime'));

function RuntimeFallback() {
  return (
    <main
      aria-label="Opening the Warpkeep gateway"
      role="status"
      style={{
        alignItems: 'center',
        background: '#010207',
        color: '#f2dfae',
        display: 'grid',
        fontFamily: 'Georgia, "Times New Roman", serif',
        inset: 0,
        letterSpacing: '0.12em',
        minHeight: '100vh',
        padding: '2rem',
        placeItems: 'center',
        position: 'fixed',
        textAlign: 'center',
        textTransform: 'uppercase',
      }}
    >
      Opening the gateway
    </main>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RuntimeFallback />}>
      <WarpkeepRuntime />
    </Suspense>
  );
}
