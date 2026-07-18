# Hegemony Supply Wagon runtime assets

The Hegemony Supply Wagon is the animated visual used by the reviewed Gold
expedition presentation. The canonical source is the checksum-pinned
`Warpkeep_Wagon_NoTelescope_GameReady.glb` in the public Warpkeep-Assets
release; Warpkeep serves only the reviewed, checked-in runtime outputs and
never the release URL as a CDN.

Three immutable LODs are provided: exact GameReady High for selected/near
inspection, a 512px-atlas Balanced profile for nearby wagons, and a 256px-atlas
Compact profile for visible distant wagons. Each preserves the 47-joint rig and
all six clips: `Idle`, `Start`, `Stop`, `Turn_Left`, `Turn_Right`, and `Walk`.

The decoded model is not centered at the scene origin. A renderer must center
and ground a private wrapper group from bounds, then interpolate the wrapper
from server-owned journey timestamps. It must not treat the render mesh as a
collider, a movement authority, or a source of Gold/reward state.

See [manifest.json](manifest.json) for archive hashes, toolchain versions,
immutable output hashes, render budgets, and authorization limits.
