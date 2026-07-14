#!/bin/zsh
set -euo pipefail
umask 077

readonly repository="${0:A:h:h:h}"
readonly source_file="${repository}/scripts/qa-observer/WarpkeepQaDevice.swift"
readonly application_support="${HOME}/Library/Application Support"
readonly warpkeep_directory="${application_support}/Warpkeep"
readonly observatory_directory="${warpkeep_directory}/qa-observatory"
readonly install_directory="${HOME}/Library/Application Support/Warpkeep/qa-observatory/bin"
readonly output_file="${install_directory}/warpkeep-qa-device"
readonly current_uid="$(/usr/bin/id -u)"

fail() {
  print -u2 -- "Warpkeep QA helper build boundary is unavailable."
  exit 1
}

require_canonical_directory() {
  local path="$1"
  local required_mode="${2:-}"
  [[ -e "${path}" && ! -L "${path}" ]] || fail
  [[ "$(/usr/bin/stat -f '%HT' "${path}")" == "Directory" ]] || fail
  [[ "$(/usr/bin/stat -f '%u' "${path}")" == "${current_uid}" ]] || fail
  [[ "$(/bin/realpath "${path}")" == "${path}" ]] || fail
  local mode="$(/usr/bin/stat -f '%Lp' "${path}")"
  if [[ -n "${required_mode}" ]]; then
    [[ "${mode}" == "${required_mode}" ]] || fail
  else
    (( (8#${mode} & 8#022) == 0 )) || fail
  fi
}

ensure_private_directory() {
  local path="$1"
  if [[ ! -e "${path}" && ! -L "${path}" ]]; then
    /bin/mkdir -m 700 "${path}"
  fi
  require_canonical_directory "${path}" 700
}

require_owner_only_file() {
  local path="$1"
  [[ -e "${path}" && ! -L "${path}" ]] || fail
  [[ "$(/usr/bin/stat -f '%HT' "${path}")" == "Regular File" ]] || fail
  [[ "$(/usr/bin/stat -f '%u' "${path}")" == "${current_uid}" ]] || fail
  [[ "$(/usr/bin/stat -f '%Lp' "${path}")" == "700" ]] || fail
  [[ "$(/usr/bin/stat -f '%l' "${path}")" == "1" ]] || fail
  [[ "$(/bin/realpath "${path}")" == "${path}" ]] || fail
}

require_canonical_directory "${HOME}"
require_canonical_directory "${HOME}/Library"
require_canonical_directory "${application_support}"
ensure_private_directory "${warpkeep_directory}"
ensure_private_directory "${observatory_directory}"
ensure_private_directory "${install_directory}"

key_was_present=false
previous_helper_existed=false
if [[ -e "${output_file}" || -L "${output_file}" ]]; then
  previous_helper_existed=true
  require_owner_only_file "${output_file}"
  old_status="$("${output_file}" status)" || fail
  if [[ "${old_status}" == *'"keyPresent":true'* ]]; then
    key_was_present=true
  fi
  unset old_status
fi

temporary_directory="$(/usr/bin/mktemp -d "${install_directory}/.helper-build.XXXXXX")"
readonly temporary_directory
readonly temporary_file="${temporary_directory}/warpkeep-qa-device"
readonly previous_file="${temporary_directory}/previous-warpkeep-qa-device"
install_replaced=false
cleanup() {
  local cleanup_exit_code=$?
  trap - EXIT HUP INT TERM
  if [[ "${install_replaced}" == true ]]; then
    if [[ "${previous_helper_existed}" == true && -e "${previous_file}" && ! -L "${previous_file}" ]]; then
      /bin/mv -f "${previous_file}" "${output_file}" || cleanup_exit_code=1
    else
      /bin/rm -f "${output_file}" || cleanup_exit_code=1
    fi
  fi
  /bin/rm -f "${temporary_file}"
  /bin/rm -f "${previous_file}"
  /bin/rmdir "${temporary_directory}" 2>/dev/null || true
  exit "${cleanup_exit_code}"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
require_canonical_directory "${temporary_directory}" 700

/usr/bin/xcrun swiftc \
  -parse-as-library \
  -O \
  -whole-module-optimization \
  -framework Foundation \
  -framework Security \
  -framework CryptoKit \
  "${source_file}" \
  -o "${temporary_file}"
/usr/bin/codesign --force --sign - "${temporary_file}" >/dev/null
/bin/chmod 700 "${temporary_file}"
require_owner_only_file "${temporary_file}"

# Verify the candidate before installation. If an old helper can see a key,
# the candidate must prove that its ad-hoc identity can use that same key.
"${temporary_file}" implementation-self-test >/dev/null
if [[ "${key_was_present}" == true ]]; then
  "${temporary_file}" self-test >/dev/null
else
  "${temporary_file}" self-test-if-present >/dev/null
fi

if [[ "${previous_helper_existed}" == true ]]; then
  /bin/cp -p "${output_file}" "${previous_file}"
  require_owner_only_file "${previous_file}"
fi
/bin/mv -f "${temporary_file}" "${output_file}"
install_replaced=true
require_owner_only_file "${output_file}"

# Repeat after the atomic replacement. The EXIT trap restores the prior helper
# (or removes a failed first install) if any post-install check fails.
"${output_file}" implementation-self-test >/dev/null
if [[ "${key_was_present}" == true ]]; then
  # A previously usable key must remain visible and usable after replacement;
  # this catches signing-identity or Keychain access-group discontinuity.
  "${output_file}" self-test >/dev/null
else
  "${output_file}" self-test-if-present >/dev/null
fi
install_replaced=false
/bin/rm -f "${previous_file}"
/bin/rmdir "${temporary_directory}"
trap - EXIT HUP INT TERM
print -- "Warpkeep QA device helper installed and verified."
