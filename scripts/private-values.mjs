import { Buffer } from 'node:buffer';

// Collect actual credential values from private fixtures. Kubernetes projection
// keys and scheduling keys are public identifiers; Secret values are scanned
// separately from live Secrets, so a field name is not itself a credential.
export function privateValues(value, secrets, field = '', path = []) {
  const location = path.join('.');
  const reference = field === 'key' && (
    /(?:^|\.)(?:secretKeyRef|configMapKeyRef)\.key$/.test(location) ||
    /(?:^|\.)volumes\.\d+\.(?:(?:secret|configMap)|projected\.sources\.\d+\.(?:secret|configMap))\.items\.\d+\.key$/.test(location) ||
    /(?:^|\.)spec\.tolerations\.\d+\.key$/.test(location)
  );
  if (reference) return;
  if (typeof value === 'string' && value.length >= 16 && /password|token|cookie|(^|_)key$|^authorization$|verifier|newKey|^code$/i.test(field)) {
    secrets.push(value, Buffer.from(value).toString('base64'));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) privateValues(child, secrets, key, [...path, key]);
  }
}
