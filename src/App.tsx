import { WarpkeepExperience } from './components/WarpkeepExperience';
import { FarcasterAuthProvider } from './farcaster/FarcasterAuthProvider';
import { WarpkeepSpacetimeProvider } from './spacetime';

export default function App() {
  return (
    <FarcasterAuthProvider>
      <WarpkeepSpacetimeProvider>
        <WarpkeepExperience />
      </WarpkeepSpacetimeProvider>
    </FarcasterAuthProvider>
  );
}
