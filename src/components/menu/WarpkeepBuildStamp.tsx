import {
  formatWarpkeepBuildStamp,
  WARPKEEP_BUILD_INFO,
  type WarpkeepBuildInfo
} from '../../build/buildInfo';

export type WarpkeepBuildStampProps = Readonly<{
  buildInfo?: WarpkeepBuildInfo;
}>;

export function WarpkeepBuildStamp({
  buildInfo = WARPKEEP_BUILD_INFO
}: WarpkeepBuildStampProps) {
  const text = formatWarpkeepBuildStamp(buildInfo);
  if (buildInfo.commitUrl && buildInfo.fullSha) {
    return (
      <a
        aria-label={`Open Warpkeep ${buildInfo.channel.toUpperCase()} ${buildInfo.version} build ${buildInfo.shortSha} on GitHub`}
        className="warpkeep-menu-build-stamp"
        data-build-stamp="commit"
        href={buildInfo.commitUrl}
        referrerPolicy="no-referrer"
        rel="noopener noreferrer"
        target="_blank"
      >
        {text}
      </a>
    );
  }

  return (
    <p className="warpkeep-menu-build-stamp" data-build-stamp="local">
      {text}
    </p>
  );
}
