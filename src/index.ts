import {
  UniAuthError,
  UniAuthErrorCode,
  type AuthIdentityProvider,
  type AuthProvider,
  type FinishInput,
  type ProviderIdentityAssertion,
} from '@alyldas/uniauth-core'

export interface OAuthOidcAuthorizationCodeExchangeInput {
  readonly code: string
  readonly state?: string
  readonly redirectUri?: string
  readonly codeVerifier?: string
  readonly metadata?: Record<string, unknown>
}

export interface OAuthOidcTokenSet {
  readonly accessToken?: string
  readonly refreshToken?: string
  readonly idToken?: string
  readonly tokenType?: string
  readonly expiresAt?: Date
  readonly scopes?: readonly string[]
}

export const OAuthOidcTokenBindingKind = {
  CallbackState: 'callback-state',
  Session: 'session',
  Identity: 'identity',
  User: 'user',
} as const

export type OAuthOidcTokenBindingKind = ExtensibleString<
  (typeof OAuthOidcTokenBindingKind)[keyof typeof OAuthOidcTokenBindingKind]
>

export interface OAuthOidcTokenBinding {
  readonly kind: OAuthOidcTokenBindingKind
  readonly value: string
}

export interface OAuthOidcTokenRecord {
  readonly provider: AuthIdentityProvider
  readonly providerUserId: string
  readonly binding: OAuthOidcTokenBinding
  readonly accessToken?: string
  readonly refreshToken?: string
  readonly idToken?: string
  readonly tokenType?: string
  readonly expiresAt?: Date
  readonly scopes?: readonly string[]
  readonly metadata?: Record<string, unknown>
}

export interface CreateOAuthOidcTokenRecordInput {
  readonly provider: AuthIdentityProvider
  readonly providerUserId: string
  readonly binding: OAuthOidcTokenBinding
  readonly tokens: OAuthOidcTokenSet
  readonly metadata?: Record<string, unknown>
}

export interface OAuthOidcFetchProfileInput {
  readonly tokens: OAuthOidcTokenSet
  readonly state?: string
  readonly metadata?: Record<string, unknown>
}

export interface OAuthOidcClient {
  exchangeCode(input: OAuthOidcAuthorizationCodeExchangeInput): Promise<OAuthOidcTokenSet>
  fetchProfile(input: OAuthOidcFetchProfileInput): Promise<OAuthOidcProfile>
}

export interface OAuthOidcProfile {
  readonly subject: string
  readonly email?: string
  readonly emailVerified?: boolean
  readonly phone?: string
  readonly phoneVerified?: boolean
  readonly displayName?: string
  readonly preferredUsername?: string
  readonly pictureUrl?: string
  readonly locale?: string
  readonly issuer?: string
  readonly metadata?: Record<string, unknown>
}

export interface OAuthOidcProviderOptions {
  readonly providerId: AuthIdentityProvider
  readonly client: OAuthOidcClient
  readonly mapProfile?: OAuthOidcProfileMapper
}

export interface OAuthOidcProfileMapperInput {
  readonly provider: AuthIdentityProvider
  readonly profile: OAuthOidcProfile
  readonly finishInput: FinishInput
  readonly exchangeInput: OAuthOidcAuthorizationCodeExchangeInput
}

export type OAuthOidcProfileMapper = (
  input: OAuthOidcProfileMapperInput,
) => ProviderIdentityAssertion | Promise<ProviderIdentityAssertion>

type ExtensibleString<T extends string> = T | (string & {})

export function createOAuthOidcProvider(options: OAuthOidcProviderOptions): AuthProvider {
  if (!isRecord(options)) {
    throw invalidInput('OAuth/OIDC provider options are required.')
  }

  const providerId = requireNonBlankString(
    options.providerId,
    'OAuth/OIDC provider id is required.',
  )

  if (!isRecord(options.client)) {
    throw invalidInput('OAuth/OIDC provider client is required.')
  }

  if (typeof options.client.exchangeCode !== 'function') {
    throw invalidInput('OAuth/OIDC provider client exchangeCode is required.')
  }

  if (typeof options.client.fetchProfile !== 'function') {
    throw invalidInput('OAuth/OIDC provider client fetchProfile is required.')
  }

  if (options.mapProfile !== undefined && typeof options.mapProfile !== 'function') {
    throw invalidInput('OAuth/OIDC profile mapper must be a function.')
  }

  const mapProfile = options.mapProfile ?? mapOAuthOidcProfileToAssertion

  return {
    id: providerId,
    async finish(finishInput) {
      const exchangeInput = readAuthorizationCodeExchangeInput(finishInput)
      const tokens = normalizeProviderTokenSet(await options.client.exchangeCode(exchangeInput))
      const profile = await options.client.fetchProfile(
        readFetchProfileInput(tokens, exchangeInput),
      )

      return mapProfile({
        provider: providerId,
        profile,
        finishInput,
        exchangeInput,
      })
    },
  }
}

export function mapOAuthOidcProfileToAssertion(
  input: OAuthOidcProfileMapperInput,
): ProviderIdentityAssertion {
  if (!isRecord(input)) {
    throw invalidInput('OAuth/OIDC profile mapper input is required.')
  }

  if (!isRecord(input.profile)) {
    throw invalidInput('OAuth/OIDC profile is required.')
  }

  const subject = requireNonBlankString(
    input.profile.subject,
    'OAuth/OIDC profile subject is required.',
  )
  const email = readString(input.profile.email)
  const phone = readString(input.profile.phone)
  const metadata = buildOAuthOidcAssertionMetadata(input.profile)

  return {
    provider: input.provider,
    providerUserId: subject,
    ...(email ? { email, emailVerified: input.profile.emailVerified === true } : {}),
    ...(phone ? { phone, phoneVerified: input.profile.phoneVerified === true } : {}),
    ...optionalProp('displayName', readString(input.profile.displayName)),
    ...optionalProp('metadata', metadata),
  }
}

export function createOAuthOidcTokenRecord(
  input: CreateOAuthOidcTokenRecordInput,
): OAuthOidcTokenRecord {
  if (!isRecord(input)) {
    throw invalidInput('OAuth/OIDC token record input is required.')
  }

  const provider = requireNonBlankString(
    input.provider,
    'OAuth/OIDC token record provider is required.',
  )
  const providerUserId = requireNonBlankString(
    input.providerUserId,
    'OAuth/OIDC token record provider user id is required.',
  )
  const binding = normalizeBinding(input.binding)
  const tokens = normalizePersistedTokenSet(input.tokens)
  const metadata = normalizeTokenRecordMetadata(input.metadata)

  return {
    provider,
    providerUserId,
    binding,
    ...tokens,
    ...optionalProp('metadata', metadata),
  }
}

function readAuthorizationCodeExchangeInput(
  input: FinishInput,
): OAuthOidcAuthorizationCodeExchangeInput {
  const payload = readFinishPayload(input)
  const code = readString(input.code) ?? readString(payload.code)

  if (!code) {
    throw invalidInput('OAuth/OIDC authorization code is required.')
  }

  const state = readString(input.state) ?? readString(payload.state)
  const metadata = readAuthorizationCodeMetadata(input, payload)

  return {
    code,
    ...optionalProp('state', state),
    ...optionalProp('redirectUri', readString(payload.redirectUri)),
    ...optionalProp('codeVerifier', readString(payload.codeVerifier)),
    ...optionalProp('metadata', metadata),
  }
}

function readAuthorizationCodeMetadata(
  input: FinishInput,
  payload: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
    return normalizeMetadataRecord(
      payload.metadata,
      'OAuth/OIDC finish metadata must be a plain object.',
    )
  }

  return normalizeMetadataRecord(
    input.metadata,
    'OAuth/OIDC finish metadata must be a plain object.',
  )
}

function readFetchProfileInput(
  tokens: OAuthOidcTokenSet,
  exchangeInput: OAuthOidcAuthorizationCodeExchangeInput,
): OAuthOidcFetchProfileInput {
  return {
    tokens,
    ...optionalProp('state', exchangeInput.state),
    ...optionalProp('metadata', exchangeInput.metadata),
  }
}

function normalizeProviderTokenSet(tokens: OAuthOidcTokenSet): OAuthOidcTokenSet {
  if (!isRecord(tokens)) {
    throw invalidInput('OAuth/OIDC token set is required.')
  }

  const tokenSet = tokens as OAuthOidcTokenSet
  const accessToken = readString(tokenSet.accessToken)
  const refreshToken = readString(tokenSet.refreshToken)
  const idToken = readString(tokenSet.idToken)

  if (!accessToken && !idToken) {
    throw invalidInput('OAuth/OIDC token set must include an access token or id token.')
  }

  return {
    ...optionalProp('accessToken', accessToken),
    ...optionalProp('refreshToken', refreshToken),
    ...optionalProp('idToken', idToken),
    ...optionalProp('tokenType', readString(tokenSet.tokenType)),
    ...optionalProp(
      'expiresAt',
      normalizeOptionalDate(tokenSet.expiresAt, 'OAuth/OIDC token expiration time is invalid.'),
    ),
    ...optionalProp(
      'scopes',
      normalizeOptionalStringArray(
        tokenSet.scopes,
        'OAuth/OIDC token scopes must be an array of strings.',
      ),
    ),
  }
}

function buildOAuthOidcAssertionMetadata(
  profile: OAuthOidcProfileMapperInput['profile'],
): Record<string, unknown> | undefined {
  const profileMetadata = normalizeMetadataRecord(
    profile.metadata,
    'OAuth/OIDC profile metadata must be a plain object.',
  )
  const metadata = {
    ...optionalProp('issuer', readString(profile.issuer)),
    ...optionalProp('preferredUsername', readString(profile.preferredUsername)),
    ...optionalProp('pictureUrl', readString(profile.pictureUrl)),
    ...optionalProp('locale', readString(profile.locale)),
    ...profileMetadata,
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function normalizeBinding(binding: OAuthOidcTokenBinding): OAuthOidcTokenBinding {
  if (!isRecord(binding)) {
    throw invalidInput('OAuth/OIDC token record binding is required.')
  }

  return {
    kind: requireNonBlankString(binding.kind, 'OAuth/OIDC token record binding kind is required.'),
    value: requireNonBlankString(
      binding.value,
      'OAuth/OIDC token record binding value is required.',
    ),
  }
}

function normalizePersistedTokenSet(
  tokens: OAuthOidcTokenSet,
): Omit<OAuthOidcTokenRecord, 'provider' | 'providerUserId' | 'binding' | 'metadata'> {
  if (!isRecord(tokens)) {
    throw invalidInput('OAuth/OIDC token set is required.')
  }

  const accessToken = readString(tokens.accessToken)
  const refreshToken = readString(tokens.refreshToken)
  const idToken = readString(tokens.idToken)
  const tokenType = readString(tokens.tokenType)
  const expiresAt = normalizeOptionalDate(
    tokens.expiresAt,
    'OAuth/OIDC token expiration time is invalid.',
  )
  const scopes = normalizeOptionalStringArray(
    tokens.scopes,
    'OAuth/OIDC token scopes must be an array of strings.',
  )

  if (!accessToken && !refreshToken && !idToken) {
    throw invalidInput(
      'OAuth/OIDC token record must include an access token, refresh token, or id token.',
    )
  }

  return {
    ...optionalProp('accessToken', accessToken),
    ...optionalProp('refreshToken', refreshToken),
    ...optionalProp('idToken', idToken),
    ...optionalProp('tokenType', tokenType),
    ...optionalProp('expiresAt', expiresAt),
    ...optionalProp('scopes', scopes),
  }
}

function normalizeTokenRecordMetadata(value: unknown): Record<string, unknown> | undefined {
  const metadata = normalizeMetadataRecord(
    value,
    'OAuth/OIDC token record metadata must be a plain object.',
  )

  return metadata ? { ...metadata } : undefined
}

function requireNonBlankString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalidInput(message)
  }

  return value.trim()
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  return value.trim() || undefined
}

function normalizeOptionalDate(value: unknown, message: string): Date | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw invalidInput(message)
  }

  return value
}

function normalizeOptionalStringArray(
  value: unknown,
  message: string,
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw invalidInput(message)
  }

  const items = [...new Set(value.map((item) => item.trim()).filter(Boolean))]
  return items.length > 0 ? items : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readFinishPayload(input: FinishInput): Record<string, unknown> {
  return isRecord(input.payload) ? input.payload : {}
}

function normalizeMetadataRecord(
  value: unknown,
  message: string,
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isPlainRecord(value)) {
    throw invalidInput(message)
  }

  return value
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function optionalProp<TKey extends string, TValue>(
  key: TKey,
  value: TValue | undefined,
): { readonly [K in TKey]?: TValue } {
  return (value === undefined ? {} : { [key]: value }) as { readonly [K in TKey]?: TValue }
}

function invalidInput(message: string): UniAuthError {
  return new UniAuthError(UniAuthErrorCode.InvalidInput, message)
}
