## Models Archive Boundary

`src/models` is no longer an active runtime surface.

Canonical subscription-backed provider execution lives in:

- `src/clients/`
- `src/router/subscription-runtime.js`
- `src/bios/client-gateway.js`

The old provider-native model implementations were moved to:

- `archive/legacy-src/models/`

That archive is kept only for archaeology and migration reference. It is not part of the release path.
