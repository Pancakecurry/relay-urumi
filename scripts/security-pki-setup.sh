#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/bin:$PATH" KUBECONFIG="$PWD/.local/kubeconfig"
# Fetch and verify pinned artifacts on a clean checkout.
bash scripts/security-pki-fetch.sh
# Signature-verified upstream chart is installed exactly once as its own release.
expected=73a56e1728edd6c99f1f31082618c3259d279a76b7ebd3d4bdc5475c2442d34a
actual=$(shasum -a 256 .tools/vendor/cert-manager/cert-manager-v1.21.2.tgz | cut -d ' ' -f1)
[[ "$actual" = "$expected" ]] || { echo 'Pinned certificate-manager chart hash mismatch'; exit 1; }
node --input-type=module <<'JS'
import {kube,apply} from './scripts/mcp-kube.mjs';
let ns;try{ns=JSON.parse(kube(['get','namespace','relay-pki','-o','json']));}catch(e){if(!e.stderr?.includes('NotFound'))throw e;}
if(ns&&ns.metadata.labels?.['relay-owned']!=='m6')throw new Error('PKI namespace ownership mismatch');
apply({apiVersion:'v1',kind:'Namespace',metadata:{name:'relay-pki',labels:{'relay-owned':'m6','pod-security.kubernetes.io/enforce':'restricted','pod-security.kubernetes.io/enforce-version':'v1.37','pod-security.kubernetes.io/audit':'restricted','pod-security.kubernetes.io/warn':'restricted'}}});
JS
helm lint .tools/vendor/cert-manager/cert-manager-v1.21.2.tgz -f infra/local/cert-manager-values.json
helm upgrade --install relay-cert-manager .tools/vendor/cert-manager/cert-manager-v1.21.2.tgz -n relay-pki -f infra/local/cert-manager-values.json --wait --wait-for-jobs --timeout 240s

node scripts/run-acceptance.mjs scripts/security-pki-root.mjs
