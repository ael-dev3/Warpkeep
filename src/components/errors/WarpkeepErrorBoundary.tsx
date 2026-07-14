import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useRef,
  useState
} from 'react';
import './WarpkeepErrorBoundary.css';

type WarpkeepErrorBoundaryProps = Readonly<{
  children: ReactNode;
  onRequestReload?: () => void;
}>;

type WarpkeepErrorBoundaryState = Readonly<{
  failed: boolean;
}>;

type WarpkeepRecoveryScreenProps = Readonly<{
  onRequestReload: () => void;
}>;

function reloadWarpkeep() {
  window.location.reload();
}

function WarpkeepRecoveryScreen({ onRequestReload }: WarpkeepRecoveryScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [reloadRequested, setReloadRequested] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const requestReload = () => {
    if (reloadRequested) return;
    setReloadRequested(true);
    onRequestReload();
  };

  return (
    <main
      aria-describedby="warpkeep-recovery-copy"
      aria-labelledby="warpkeep-recovery-title"
      className="warpkeep-recovery"
    >
      <div aria-hidden="true" className="warpkeep-recovery__atmosphere">
        <span className="warpkeep-recovery__orbit warpkeep-recovery__orbit--outer" />
        <span className="warpkeep-recovery__orbit warpkeep-recovery__orbit--inner" />
        <span className="warpkeep-recovery__sigil">W</span>
      </div>

      <section className="warpkeep-recovery__panel">
        <p className="warpkeep-recovery__wordmark">WARPKEEP</p>
        <p className="warpkeep-recovery__eyebrow">RECOVERY WARD</p>
        <h1
          className="warpkeep-recovery__title"
          id="warpkeep-recovery-title"
          ref={headingRef}
          tabIndex={-1}
        >
          THE REALM FALTERED
        </h1>
        <p className="warpkeep-recovery__copy" id="warpkeep-recovery-copy" role="alert">
          Warpkeep could not continue safely. Reload the realm to restore the experience.
        </p>
        <button
          className="warpkeep-recovery__action"
          disabled={reloadRequested}
          onClick={requestReload}
          type="button"
        >
          {reloadRequested ? 'RELOADING…' : 'RELOAD WARPKEEP'}
        </button>
        <p aria-live="polite" className="warpkeep-recovery__status" role="status">
          {reloadRequested ? 'Reloading the realm.' : 'Reloading restarts this view.'}
        </p>
      </section>
    </main>
  );
}

/**
 * Last-resort UI containment for render and lifecycle failures. Error objects
 * deliberately remain outside component state and rendered output so a
 * failure cannot disclose runtime details to players.
 */
export class WarpkeepErrorBoundary extends Component<
  WarpkeepErrorBoundaryProps,
  WarpkeepErrorBoundaryState
> {
  state: WarpkeepErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): WarpkeepErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: unknown, _errorInfo: ErrorInfo) {
    // Intentionally do not persist, render, or forward potentially sensitive
    // error data. Production observability should receive sanitized events at
    // an explicit reporting boundary rather than leaking browser state here.
  }

  render() {
    if (this.state.failed) {
      return (
        <WarpkeepRecoveryScreen
          onRequestReload={this.props.onRequestReload ?? reloadWarpkeep}
        />
      );
    }

    return this.props.children;
  }
}
