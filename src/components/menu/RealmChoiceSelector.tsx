import {
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref
} from 'react';

import type { RealmChoice, RealmId } from './realmChoicePolicy';
import './RealmChoiceSelector.css';

export type RealmChoiceSelectorProps = Readonly<{
  choices: readonly RealmChoice[];
  busy?: boolean;
  selectedRealmId: RealmId;
  interactive: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  onBack: () => void;
  onContinue: () => void;
  onSelect: (realmId: RealmId) => void;
  statusMessage?: string;
}>;

export function RealmChoiceSelector({
  busy = false,
  choices,
  selectedRealmId,
  interactive,
  headingRef,
  onBack,
  onContinue,
  onSelect,
  statusMessage
}: RealmChoiceSelectorProps) {
  const instanceId = useId().replace(/:/g, '');
  const choiceRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    choiceIndex: number
  ) => {
    if (!interactive || choices.length === 0) return;

    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (choiceIndex + 1) % choices.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (choiceIndex - 1 + choices.length) % choices.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = choices.length - 1;
    }

    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextChoice = choices[nextIndex];
    if (!nextChoice) return;
    onSelect(nextChoice.id);
    choiceRefs.current[nextIndex]?.focus({ preventScroll: true });
  };

  return (
    <section
      aria-labelledby={`realm-choice-heading-${instanceId}`}
      className="realm-choice-selector"
    >
      <header className="realm-choice-selector__header">
        <p className="realm-choice-selector__eyebrow">REALM DIRECTORY</p>
        <h2
          className="realm-choice-selector__heading"
          id={`realm-choice-heading-${instanceId}`}
          ref={headingRef}
          tabIndex={-1}
        >
          CHOOSE YOUR REALM
        </h2>
        <p className="realm-choice-selector__intro">
          Select a destination, review its verified access state, then enter explicitly.
        </p>
      </header>
      <div aria-label="Choose realm" className="realm-choice-selector__choices" role="radiogroup">
        {choices.map((choice, choiceIndex) => {
          const selected = choice.id === selectedRealmId;
          const tooltipId = `realm-choice-tooltip-${instanceId}-${choice.id}`;
          return (
            <div className="realm-choice-selector__choice" key={choice.id}>
              <button
                aria-checked={selected}
                aria-describedby={tooltipId}
                className="realm-choice-selector__button"
                data-admission={choice.admission}
                data-realm={choice.id}
                disabled={!interactive}
                onClick={() => onSelect(choice.id)}
                onKeyDown={(event) => handleKeyDown(event, choiceIndex)}
                ref={(button) => {
                  choiceRefs.current[choiceIndex] = button;
                }}
                role="radio"
                tabIndex={interactive && (selected || !choices.some(({ id }) => id === selectedRealmId))
                  ? 0
                  : -1}
                type="button"
              >
                <span className="realm-choice-selector__identity">
                  <span className="realm-choice-selector__name">{choice.label}</span>
                  <span className="realm-choice-selector__version">version {choice.version}</span>
                </span>
                <span className="realm-choice-selector__admission">
                  <span
                    aria-hidden="true"
                    className="realm-choice-selector__mark"
                  >
                    {choice.admission === 'admitted' ? '✓' : '×'}
                  </span>
                  <span>{choice.statusLabel}</span>
                </span>
              </button>
              <span
                className="realm-choice-selector__tooltip"
                id={tooltipId}
                role="tooltip"
              >
                {choice.tooltip}
              </span>
            </div>
          );
        })}
      </div>
      <p
        aria-live="polite"
        className="realm-choice-selector__status"
        role={statusMessage ? 'status' : undefined}
      >
        {statusMessage ?? '\u00a0'}
      </p>
      <div className="realm-choice-selector__actions">
        <button
          className="realm-choice-selector__action realm-choice-selector__action--secondary"
          disabled={!interactive && !busy}
          onClick={onBack}
          type="button"
        >
          BACK
        </button>
        <button
          aria-busy={busy || undefined}
          className="realm-choice-selector__action realm-choice-selector__action--primary"
          disabled={!interactive || busy}
          onClick={onContinue}
          type="button"
        >
          {busy ? 'CHECKING ACCESS…' : 'ENTER SELECTED REALM'}
        </button>
      </div>
    </section>
  );
}
