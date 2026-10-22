# Production-like values

These examples use the same platform/store/hosted-mcp chart templates. `security-values.example.yaml` preserves M6 TLS, native data authentication, OAuth and isolation with environment-specific host/storage/issuer/API references. Provide reviewed image digests and fresh Secrets before deployment. No cloud account or VPS is provisioned by these files. See `docs/runbooks/production-like.md` for private/public CA separation, dynamic-store public-certificate limits and actual unverified gates.
