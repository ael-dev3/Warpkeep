import {
  forwardRef,
  type PointerEventHandler,
  type Ref
} from 'react';

import {
  WARPKEEP_BUILD_INFO,
  type WarpkeepBuildInfo
} from '../../build/buildInfo';

export type WarpkeepPatchNotesState = 'closed' | 'preview' | 'pinned';

export type WarpkeepBuildStampProps = Readonly<{
  buildInfo?: WarpkeepBuildInfo;
  expanded: boolean;
  groupRef?: Ref<HTMLDivElement>;
  interactive: boolean;
  onPointerEnter?: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave?: PointerEventHandler<HTMLButtonElement>;
  onRequestPatchNotes: () => void;
  patchNotesState: WarpkeepPatchNotesState;
}>;

export const WarpkeepBuildStamp = forwardRef<HTMLButtonElement, WarpkeepBuildStampProps>(
  function WarpkeepBuildStamp({
    buildInfo = WARPKEEP_BUILD_INFO,
    expanded,
    groupRef,
    interactive,
    onPointerEnter,
    onPointerLeave,
    onRequestPatchNotes,
    patchNotesState
  }, buttonRef) {
    const releaseText = `${buildInfo.channel.toUpperCase()} ${buildInfo.version}`;
    const deployed = Boolean(buildInfo.commitUrl && buildInfo.fullSha);
    const provenanceText = deployed ? `BUILD ${buildInfo.shortSha}` : buildInfo.shortSha;

    return (
      <div
        className="warpkeep-menu-build-stamp"
        data-build-stamp={deployed ? 'commit' : 'local'}
        data-patch-notes-state={patchNotesState}
        ref={groupRef}
      >
        <button
          aria-controls="warpkeep-latest-patch-notes"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Close' : 'Open'} patch notes for Warpkeep ${releaseText}`}
          className="warpkeep-menu-build-stamp__version"
          disabled={!interactive}
          onClick={onRequestPatchNotes}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          ref={buttonRef}
          tabIndex={interactive ? 0 : -1}
          type="button"
        >
          {releaseText}
        </button>
        <span aria-hidden="true" className="warpkeep-menu-build-stamp__separator">{' · '}</span>
        {deployed ? (
          <a
            aria-label={`Open Warpkeep ${releaseText} build ${buildInfo.shortSha} on GitHub`}
            className="warpkeep-menu-build-stamp__build"
            href={buildInfo.commitUrl}
            referrerPolicy="no-referrer"
            rel="noopener noreferrer"
            tabIndex={interactive ? 0 : -1}
            target="_blank"
          >
            {provenanceText}
          </a>
        ) : (
          <span className="warpkeep-menu-build-stamp__build">{provenanceText}</span>
        )}
      </div>
    );
  }
);
