#!/usr/bin/env bash
# Local P3 candidate for the Cloudflare Pages lane: build /ptr/ from one exact
# signed source, write its payload and mirror plan, prepare a signed public
# commit on the preserved Warpkeep-Live parent, export it with `git archive`
# and verify every file against the plan. Local only: it never pushes,
# uploads or changes DNS, origins or provider state.
#
# Usage: scripts/public-pages-local-candidate.sh <source commit> <source tree>
# Environment (required): WARPKEEP_PUBLIC_ROOT (Warpkeep-Live checkout on the
# parent), WARPKEEP_ALLOWED_SIGNERS (ssh allowed-signers file),
# WARPKEEP_SIGNING_KEY (public key of the signer). Optional:
# WARPKEEP_EVIDENCE_DIR (default artifacts/p3-candidates).
set -euo pipefail

readonly P3_PUBLIC_PARENT=b6afe92e7b09197b1578d992103ac3c8f916d8ad
readonly P3_SIGNER_FINGERPRINT=SHA256:H0mdBKhWdc4xPiVS6gGE49lZUOTEhXMqB0q1SK1Ofec
readonly P3_SIGNER_IDENTITY=ael-dev3
readonly P3_PRESERVED_ROOT_ENTRY_COUNT=341
readonly P3_PRESERVED_ROOT_MANIFEST_SHA256=7699d03b70c901e4fb8453b8b515af03376d398bf79e9eabea1c85f6e303c3ef
readonly P3_RELEASE_BRANCH=release/0.4-living-realm-quality
readonly P3_PLAN=artifacts/delivery/0.4.0/public-pages-ptr-mirror-plan-v1.json
readonly P3_PAYLOAD=artifacts/delivery/0.4.0/public-pages-payload-v1.json

p3_fail() { echo "P3_CANDIDATE_$1" >&2; exit "${2:-1}"; }

p3_validate_arguments() {
  [ "$#" -eq 2 ] || p3_fail ARGUMENTS_INVALID 2
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] && [[ "$2" =~ ^[0-9a-f]{40}$ ]] || p3_fail ARGUMENTS_INVALID 2
}

# Build inputs come only from the reviewed production list below; anything a
# caller's shell exported (for example VITE_PTR_SPACETIMEDB_URI, which makes
# the PTR config unavailable) is removed first.
p3_scrub_build_environment() {
  local name
  for name in $(compgen -e); do
    case "$name" in VITE_*|DEPLOY_BASE|BASE_URL|NODE_ENV|MSYS_NO_PATHCONV|MSYS2_ARG_CONV_EXCL) unset "$name" ;; esac
  done
}

p3_export_build_environment() {
  export DEPLOY_BASE=/ptr/ VITE_WARPKEEP_RELEASE_CHANNEL=alpha VITE_WARPKEEP_BUILD_SHA="$1" \
    VITE_WARPKEEP_REPOSITORY_URL=https://github.com/ael-dev3/Warpkeep \
    VITE_WARPKEEP_CANONICAL_ORIGIN=https://warpkeep.com \
    VITE_WARPKEEP_SHARED_ALPHA_ENABLED=true VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED=false \
    VITE_WARPKEEP_PTR_ENABLED=true \
    VITE_PTR_SPACETIMEDB_DATABASE=c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e \
    VITE_WARPKEEP_AUTH_BRIDGE_URL=https://auth.warpkeep.com VITE_WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com \
    VITE_WARPKEEP_OIDC_AUDIENCE=warpkeep-spacetimedb VITE_SPACETIMEDB_URI=https://maincloud.spacetimedb.com \
    VITE_SPACETIMEDB_DATABASE=c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e
}

# Earlier candidate evidence is never replaced.
p3_require_fresh_evidence() {
  local out
  for out in "$1/plan-$2.json" "$1/prepare-$2.json" "$1/pages-upload-$2"; do
    [ ! -e "$out" ] || p3_fail "EVIDENCE_EXISTS:$out" 8
  done
}

# The plan must carry the unchanged Alpha root of the pinned parent.
p3_assert_plan_identity() {
  node -e '
const [plan, source, tree, parent, count, digest] = process.argv.slice(1);
const p = JSON.parse(require("fs").readFileSync(plan, "utf8"));
if (p.sourceCommit !== source || p.sourceTree !== tree || p.publicParentCommit !== parent
  || p.preservedRootEntryCount !== Number(count) || p.preservedRootManifestSha256 !== digest) process.exit(9);
' "$1" "$2" "$3" "$P3_PUBLIC_PARENT" "$P3_PRESERVED_ROOT_ENTRY_COUNT" "$P3_PRESERVED_ROOT_MANIFEST_SHA256" \
    || p3_fail PLAN_IDENTITY_INVALID 9
}

p3_verify_export() {
  node -e '
const fs = require("fs"), c = require("crypto"), p = require("path");
const [plan, root] = process.argv.slice(1);
const entries = JSON.parse(fs.readFileSync(plan, "utf8")).targetEntries;
const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(x => x.isDirectory() ? walk(p.join(d, x.name)) : [p.join(d, x.name)]);
const bad = entries.filter(e => {
  const file = p.join(root, e.path);
  if (!fs.existsSync(file)) return true;
  const b = fs.readFileSync(file);
  return b.length !== e.byteLength || c.createHash("sha256").update(b).digest("hex") !== e.sha256;
});
const onDisk = walk(root).length;
console.log(JSON.stringify({ verified: entries.length - bad.length, planned: entries.length, onDisk }));
if (bad.length || onDisk !== entries.length) process.exit(7);
' "$1" "$2" || p3_fail EXPORT_MISMATCH 7
}

p3_main() {
  p3_validate_arguments "$@"
  local source=$1 tree=$2 short=${1:0:8}
  : "${WARPKEEP_PUBLIC_ROOT:?}" "${WARPKEEP_ALLOWED_SIGNERS:?}" "${WARPKEEP_SIGNING_KEY:?}"
  local evidence=${WARPKEEP_EVIDENCE_DIR:-artifacts/p3-candidates}
  export GIT_CONFIG_COUNT=3 GIT_CONFIG_KEY_0=gpg.ssh.allowedSignersFile GIT_CONFIG_VALUE_0="$WARPKEEP_ALLOWED_SIGNERS" \
    GIT_CONFIG_KEY_1=gpg.format GIT_CONFIG_VALUE_1=ssh GIT_CONFIG_KEY_2=user.signingkey GIT_CONFIG_VALUE_2="$WARPKEEP_SIGNING_KEY"

  cd "$(git rev-parse --show-toplevel)"
  p3_require_fresh_evidence "$evidence" "$short"
  git fetch -q origin "$P3_RELEASE_BRANCH"
  [ "$(git rev-parse "origin/$P3_RELEASE_BRANCH")" = "$source" ] || p3_fail REMOTE_HEAD_DIFFERS 3
  git -c core.autocrlf=false checkout -q --detach "$source"
  [ "$(git rev-parse HEAD)" = "$source" ] && [ "$(git rev-parse 'HEAD^{tree}')" = "$tree" ] || p3_fail SOURCE_TREE_DIFFERS 3
  [ "$(git log -1 --format=%G?%GK "$source")" = "G$P3_SIGNER_FINGERPRINT" ] || p3_fail SOURCE_SIGNATURE_INVALID 4
  [ -z "$(git status --porcelain --untracked-files=all)" ] || p3_fail SOURCE_DIRTY 5
  [ "$(git -C "$WARPKEEP_PUBLIC_ROOT" rev-parse HEAD)" = "$P3_PUBLIC_PARENT" ] || p3_fail PUBLIC_PARENT_MOVED 6

  p3_scrub_build_environment
  p3_export_build_environment "$source"
  # Scope Git Bash conversion flags to the build; later Node paths need conversion.
  MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' npm run build >/dev/null
  MSYS_NO_PATHCONV=1 node scripts/verify-public-pages-payload.mjs --write "$source" --publication-path /ptr/
  MSYS_NO_PATHCONV=1 node scripts/verify-public-pages-mirror-plan.mjs \
    --public-root "$WARPKEEP_PUBLIC_ROOT" "$source" "$P3_PUBLIC_PARENT" --write-plan
  p3_assert_plan_identity "$P3_PLAN" "$source" "$tree"
  local plan_sha
  plan_sha=$(sha256sum "$P3_PLAN" | cut -c1-64)
  mkdir -p "$evidence"
  cp "$P3_PLAN" "$evidence/plan-$short.json"
  node scripts/public-pages-publication-operator.mjs prepare --source-root "$PWD" \
    --public-root "$WARPKEEP_PUBLIC_ROOT" --plan "$evidence/plan-$short.json" --plan-sha256 "$plan_sha" \
    --signer-fingerprint "$P3_SIGNER_FINGERPRINT" --signer-identity "$P3_SIGNER_IDENTITY" \
    > "$evidence/prepare-$short.json"
  local public
  public=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).publicCommit)' \
    "$evidence/prepare-$short.json")
  [[ "$public" =~ ^[0-9a-f]{40}$ ]] || p3_fail PREPARE_RECEIPT_INVALID 10
  [ "$(git -C "$WARPKEEP_PUBLIC_ROOT" log -1 --format=%G?%GK%P "$public")" = "G$P3_SIGNER_FINGERPRINT$P3_PUBLIC_PARENT" ] \
    || p3_fail PUBLIC_COMMIT_INVALID 10
  git -C "$WARPKEEP_PUBLIC_ROOT" branch "$short-prepared-${public:0:8}" "$public"
  mkdir "$evidence/pages-upload-$short"
  git -C "$WARPKEEP_PUBLIC_ROOT" archive "$public" | tar -x -C "$evidence/pages-upload-$short"
  p3_verify_export "$evidence/plan-$short.json" "$evidence/pages-upload-$short"
  echo "source $source tree $tree plan $plan_sha public $public"
  sha256sum "$P3_PAYLOAD" "$evidence/prepare-$short.json"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then p3_main "$@"; fi
