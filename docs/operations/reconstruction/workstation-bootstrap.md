# Workstation bootstrap

## Supported baseline

The primary reference is a supported macOS release with Xcode Command Line Tools; GitHub-hosted Ubuntu is the CI reference. Use a current Chromium/WebKit-class browser with WebGL2 and a disposable-profile capability.

| Tool | Release baseline |
| --- | --- |
| Node.js | 22.x (release tested on 22.22.3) |
| npm | 10.x (release tested on 10.9.8) |
| pnpm | 11.7.0 |
| Wrangler | 4.110.0 through the auth-bridge lockfile |
| SpacetimeDB CLI/module | 2.6.1; CLI commit `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87` |
| glTF-Transform CLI | 4.4.1 |
| Host utilities | Git, `unzip`, `curl`, `tar`, SHA-256 tooling |

Pinned SpacetimeDB 2.6.1 archive hashes are:

| Platform | SHA-256 |
| --- | --- |
| macOS Apple Silicon | `4736035e991bba6f416c99c08d02e5985534bf238732ea8464f199050e694f9f` |
| macOS Intel | `8d58ccc6762822710ce047dbf0d9d29ada95e5d70f300b1b6ee7cae09183b558` |
| CI Linux x64 | `cb03bb4706dc6bd6ef080c9bbd220a6e7d10430a65e7be2ba6be27ec7e3a9118` |

## Clean installation

On a clean macOS workstation, install the Xcode Command Line Tools, then install [Homebrew](https://brew.sh/) from its official instructions. Install the pinned release toolchain before cloning either repository:

```sh
xcode-select --install

brew update
brew install git node@22
export PATH="$(brew --prefix node@22)/bin:$HOME/.local/bin:$PATH"

npm install --global npm@10.9.8 pnpm@11.7.0
mkdir -p "$HOME/.local/bin"

case "$(uname -m)" in
  arm64)
    stdb_platform=aarch64-apple-darwin
    stdb_sha256=4736035e991bba6f416c99c08d02e5985534bf238732ea8464f199050e694f9f
    ;;
  x86_64)
    stdb_platform=x86_64-apple-darwin
    stdb_sha256=8d58ccc6762822710ce047dbf0d9d29ada95e5d70f300b1b6ee7cae09183b558
    ;;
  *)
    echo "Unsupported macOS architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

stdb_archive="$(mktemp -d)/spacetime-2.6.1.tar.gz"
curl --fail --location --proto '=https' --tlsv1.2 --retry 3 \
  --output "$stdb_archive" \
  "https://github.com/clockworklabs/SpacetimeDB/releases/download/v2.6.1/spacetime-${stdb_platform}.tar.gz"
echo "${stdb_sha256}  ${stdb_archive}" | shasum -a 256 --check
tar -xzf "$stdb_archive" -C "$(dirname "$stdb_archive")" spacetimedb-cli
install -m 0755 "$(dirname "$stdb_archive")/spacetimedb-cli" "$HOME/.local/bin/spacetime"
```

Persist the two `PATH` entries in the operator's shell profile, open a fresh shell, and verify the toolchain before cloning:

```sh
git --version
node --version
npm --version
pnpm --version
spacetime --version
```

Require Node 22.x, npm 10.9.8, pnpm 11.7.0, and SpacetimeDB 2.6.1. The SpacetimeDB output must identify commit `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`. Wrangler and glTF-Transform do not need global installs: the repository lockfile and exact `npx` invocation below provide them.

Clone and restore the exact recorded source only after those checks pass:

```sh
git clone https://github.com/ael-dev3/Warpkeep.git
git clone https://github.com/ael-dev3/Warpkeep-Assets.git

cd Warpkeep
git fetch --tags --prune
git checkout --detach <recorded-full-sha>
npm ci

pnpm --dir services/auth-bridge install --frozen-lockfile
pnpm --dir spacetimedb install --frozen-lockfile

pnpm --dir services/auth-bridge exec wrangler --version
npx --yes @gltf-transform/cli@4.4.1 --version
```

Use Git worktrees for isolated candidate/release work. Do not develop directly in an old dirty operational checkout, and never “clean” unknown changes with destructive reset commands.

## Private local state

Keep these untracked:

- root `.env*` except committed examples;
- `services/auth-bridge/.dev.vars`;
- `.cache/warpkeep-assets/`;
- Wrangler state and authentication;
- Maincloud credentials;
- browser profiles and HAR/network captures;
- private operational claims, reports, and recovery manifests.

Private files should be owner-readable only (`0600`) inside owner-only directories (`0700`). Environment files contain values only on the authorized machine; public reconstruction docs record names and purposes, never values.
