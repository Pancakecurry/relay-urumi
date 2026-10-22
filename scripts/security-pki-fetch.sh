#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/bin:$PATH"
vendor_dir=${RELAY_PKI_VENDOR_DIR:-.tools/vendor/cert-manager}
mkdir -p "$vendor_dir"
chart="$vendor_dir/cert-manager-v1.21.2.tgz"
keyring="$vendor_dir/cert-manager-keyring.gpg"
if [[ ! -f "$chart" || ! -f "$chart.prov" ]]; then
  helm pull oci://quay.io/jetstack/charts/cert-manager --version v1.21.2 --prov --destination "$vendor_dir"
fi
actual=$(shasum -a 256 "$chart" | cut -d ' ' -f1)
[[ "$actual" = 73a56e1728edd6c99f1f31082618c3259d279a76b7ebd3d4bdc5475c2442d34a ]] || { echo 'Pinned certificate chart hash mismatch'; exit 1; }
if [[ ! -f "$keyring" ]]; then
 curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://cert-manager.io/public-keys/cert-manager-keyring-2021-09-20-1020CF3C033D4F35BAE1C19E1226061C665DF13E.gpg --output "$keyring"
fi
verification=$(helm verify --keyring "$keyring" "$chart")
[[ "$verification" = *1020CF3C033D4F35BAE1C19E1226061C665DF13E* ]] || { echo 'Unexpected chart signing fingerprint'; exit 1; }
printf '%s\n' "$verification"
