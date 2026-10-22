#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" = Darwin && "$(uname -m)" = arm64 ]] || { echo 'This pinned local operator binary is for macOS arm64; select and review a matching upstream artifact on another host.'; exit 1; }
mkdir -p .tools/vendor/cmctl .tools/bin
artifact=.tools/vendor/cmctl/cmctl-v2.6.1-darwin-arm64
if [[ ! -f "$artifact" ]]; then
 curl --fail --silent --show-error --location --proto '=https' https://github.com/cert-manager/cmctl/releases/download/v2.6.1/cmctl_darwin_arm64 --output "$artifact"
fi
printf '%s\n' "158413ab2f8466c2680317a9618396ed206f4207451d6c24f6f14ccdc6788d4e  $artifact" | shasum -a 256 -c -
cp "$artifact" .tools/bin/cmctl
chmod 755 .tools/bin/cmctl
.tools/bin/cmctl version --client
