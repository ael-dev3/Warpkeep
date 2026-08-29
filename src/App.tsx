import { WarpkeepExperience } from './components/WarpkeepExperience';
import { FarcasterAuthProvider } from './farcaster/FarcasterAuthProvider';
import { MiniAppHostProvider } from './farcaster/miniapp';
import { PtrRealmProvider } from './ptr/PtrRealmProvider';
import { WarpkeepSpacetimeProvider } from './spacetime';

export default function App() {
  return (
    <MiniAppHostProvider>
      <PtrRealmProvider>
        <FarcasterAuthProvider>
          <WarpkeepSpacetimeProvider>
            <WarpkeepExperience />
          </WarpkeepSpacetimeProvider>
        </FarcasterAuthProvider>
      </PtrRealmProvider>
    </MiniAppHostProvider>
  );
}
