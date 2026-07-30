import {
  useId,
  useRef,
  type ReactNode
} from 'react';

import { useModalFocusBoundary } from '../menu/useModalFocusBoundary';
import './RealmFullScreenSurface.css';

export type RealmFullScreenSurfaceTone =
  | 'command'
  | 'keep'
  | 'resource'
  | 'worker'
  | 'water'
  | 'terrain'
  | 'settings';

export function RealmFullScreenSurface({
  eyebrow,
  title,
  subtitle,
  canGoBack,
  backLabel = 'Back',
  onBack,
  onCloseToRealm,
  tone = 'command',
  children,
  footer
}: Readonly<{
  eyebrow?: string;
  title: string;
  subtitle?: string;
  canGoBack: boolean;
  backLabel?: string;
  onBack: () => void;
  onCloseToRealm: () => void;
  tone?: RealmFullScreenSurfaceTone;
  children: ReactNode;
  footer?: ReactNode;
}>) {
  const generatedId = useId().replace(/:/g, '');
  const titleId = `realm-fullscreen-title-${generatedId}`;
  const surfaceRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useModalFocusBoundary({
    dialogRef: surfaceRef,
    initialFocusRef: headingRef,
    onEscape: onBack
  });

  return (
    <section
      aria-labelledby={titleId}
      aria-modal="true"
      className="realm-fullscreen-surface"
      data-realm-fullscreen-surface="true"
      data-tone={tone}
      ref={surfaceRef}
      role="dialog"
    >
      <header className="realm-fullscreen-surface__header">
        <div className="realm-fullscreen-surface__header-grid">
          {canGoBack ? (
            <button
              aria-label={backLabel}
              className="realm-fullscreen-surface__back"
              onClick={onBack}
              type="button"
            >
              <span aria-hidden="true">‹</span>
              <span>{backLabel}</span>
            </button>
          ) : <span aria-hidden="true" />}
          <div className="realm-fullscreen-surface__title">
            {eyebrow ? <p>{eyebrow}</p> : null}
            <h1 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h1>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          <button
            aria-label="Close to Realm"
            className="realm-fullscreen-surface__close"
            onClick={onCloseToRealm}
            type="button"
          >
            <span>CLOSE</span>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>
      <div className="realm-fullscreen-surface__body">
        {children}
      </div>
      {footer ? (
        <footer className="realm-fullscreen-surface__footer">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
