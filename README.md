# UniAuth OAuth OIDC Provider

[![GitHub Packages](https://img.shields.io/static/v1?label=GitHub%20Packages&message=%40alyldas%2Funiauth-oauth-oidc-provider&color=24292f&logo=github)](https://github.com/users/alyldas/packages/npm/package/uniauth-oauth-oidc-provider)

`@alyldas/uniauth-oauth-oidc-provider` exposes a small SDK-free contract for OAuth and OIDC
provider adapters. It maps a validated provider profile into a UniAuth `ProviderIdentityAssertion`
and delegates account decisions to the existing UniAuth core flow.

## Runtime Boundary

This package does not own authorization URL creation, callback routes, state and nonce validation,
redirect URI policy, PKCE storage, provider secrets, HTTP clients, token persistence, refresh, or
revocation.

## Install

Configure the GitHub Packages registry for the package scope before installing:

```ini
@alyldas:registry=https://npm.pkg.github.com
```

GitHub Packages can require authentication for package reads. Use a token with `read:packages` in local npm config or CI secrets; do not commit tokens.

```bash
npm install @alyldas/uniauth-core @alyldas/uniauth-oauth-oidc-provider
```

## Usage

```ts
import { createOAuthOidcProvider, type OAuthOidcClient } from '@alyldas/uniauth-oauth-oidc-provider'

const client: OAuthOidcClient = {
  async exchangeCode(input) {
    return appOAuthClient.exchangeCode({
      code: input.code,
      redirectUri: input.redirectUri,
      codeVerifier: input.codeVerifier,
    })
  },
  async fetchProfile(input) {
    return appOAuthClient.fetchUserInfo(input.tokens)
  },
}

providerRegistry.register(
  createOAuthOidcProvider({
    providerId: 'example-oauth',
    client,
  }),
)
```

```ts
await auth.public.provider.signIn({
  provider: 'example-oauth',
  finishInput: {
    code: request.query.code,
    state: request.query.state,
    payload: {
      redirectUri: 'https://app.example/auth/callback',
      codeVerifier: request.session.oauthCodeVerifier,
    },
  },
})
```

The built-in mapper uses `profile.subject` as `providerUserId`, maps verified email and phone
claims, and copies only reduced profile metadata such as issuer, preferred username, picture URL,
locale, and explicit app-provided profile metadata.

Use `mapProfile` when a provider needs a custom subject format or tenant-specific metadata:

```ts
createOAuthOidcProvider({
  providerId: 'tenant-oauth',
  client,
  mapProfile: ({ provider, profile }) => ({
    provider,
    providerUserId: `${profile.issuer}:${profile.subject}`,
  }),
})
```

Use `createOAuthOidcTokenRecord(...)` when an application needs one normalized shape for
application-owned token persistence. See [provider token persistence](docs/provider-token-persistence.md).

## Security Notes

- Validate `state`, `nonce`, redirect URI, and PKCE verifier in application code.
- Keep provider secrets in the application-owned client.
- Do not store access tokens, ID tokens, or refresh tokens in `ProviderIdentityAssertion.metadata`.
- Token storage, refresh token rotation, and provider revocation remain application-owned.
- UniAuth policy invariants still apply after mapping.

## Local Checks

```bash
npm run check
```
