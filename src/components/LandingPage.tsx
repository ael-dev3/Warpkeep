interface LandingPageProps {
  onEnterCastle: () => void;
}

const loopSteps = ['Build', 'Train', 'Scout', 'Raid', 'Ally', 'Rule'];

export function LandingPage({ onEnterCastle }: LandingPageProps) {
  return (
    <main className="landing-shell">
      <section className="hero-panel">
        <p className="eyebrow">Farcaster-native strategy</p>
        <h1>Warpkeep</h1>
        <p className="tagline">Every FID has a castle.</p>
        <p className="hero-copy">A Farcaster-native strategy game where your FID becomes a kingdom.</p>
        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={onEnterCastle}>
            Sign in with Farcaster
          </button>
          <span className="placeholder-note">Placeholder auth for the seed build</span>
        </div>
      </section>

      <section className="loop-panel" aria-label="Game loop">
        {loopSteps.map((step, index) => (
          <div className="loop-step" key={step}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </section>

      <section className="principles-panel">
        <h2>A realm seeded for future agents</h2>
        <p>
          This first pass keeps the world small on purpose: deterministic reducers, clear docs, Farcaster identity,
          and a SpacetimeDB-ready state model. AI can add ravens, advisors, lore, and court reports later without
          controlling authoritative game state.
        </p>
      </section>
    </main>
  );
}
