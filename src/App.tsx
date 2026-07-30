import { WarpkeepExperience } from './components/WarpkeepExperience';
import { FarcasterAuthProvider } from './farcaster/FarcasterAuthProvider';
import { MiniAppHostProvider } from './farcaster/miniapp';
import { WarpkeepSpacetimeProvider } from './spacetime';

export default function App() {
  return (
    <MiniAppHostProvider>
      <FarcasterAuthProvider>
        <WarpkeepSpacetimeProvider>
          <WarpkeepExperience />
        </WarpkeepSpacetimeProvider>
      </FarcasterAuthProvider>
    </MiniAppHostProvider>
  );
}
