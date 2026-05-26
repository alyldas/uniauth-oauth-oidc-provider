# UniAuth OAuth OIDC Provider Rules

## Ownership Boundary

This repository implements SDK-free OAuth/OIDC provider helpers for UniAuth.

It may own:

- authorization-code finish input normalization
- OAuth/OIDC profile mapping
- application-owned token record normalization helpers

It must not own:

- authorization URL creation
- callback routes
- state, nonce, or PKCE storage
- provider secrets
- HTTP client runtime
- token persistence, refresh, or revocation
- UniAuth core auth policy
- database access

## Public API

Use public `@alyldas/uniauth-core` contracts only. Do not import private core internals.

## Local Core Setup

Before running provider tests against local UniAuth, build `../uniauth-core` first:

```sh
cd ../uniauth-core
npm install
npm run build
```

Then return to this repository and run:

```sh
npm install
npm run check
```

## Expected Checks

Run `npm run check` before publishing or committing provider changes.
