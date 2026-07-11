import { WarpkeepExperience } from './components/WarpkeepExperience';
import { FarcasterAuthProvider } from './farcaster/FarcasterAuthProvider';

export default function App() {
  return (
    <FarcasterAuthProvider>
      <WarpkeepExperience />
    </FarcasterAuthProvider>
  );
}
