/**
 * Secret scrubbing / redactor
 * Strips API keys, private keys, authorization tokens, and dotenv-style secrets before persistence
 */
const PATTERNS: Array<{ name: string; regex: RegExp; replace: string }> = [
  // Anthropic API keys (sk-ant-...)
  { name: 'anthropic_key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g, replace: '[REDACTED_ANTHROPIC_KEY]' },
  // OpenAI API keys (sk-...)
  { name: 'openai_key', regex: /sk-[a-zA-Z0-9]{32,}/g, replace: '[REDACTED_OPENAI_KEY]' },
  // Generic Bearer tokens
  { name: 'bearer_token', regex: /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, replace: 'Bearer [REDACTED_TOKEN]' },
  // RSA/EC Private Keys
  {
    name: 'private_key',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: '[REDACTED_PRIVATE_KEY]',
  },
  // Dotenv lines with secrets (e.g. KEY=secret_val)
  {
    name: 'env_secret',
    regex: /(?:API_KEY|SECRET|PASSWORD|TOKEN|AUTH|PRIVATE_KEY)\s*=\s*['"]?[^\r\n'"]{8,}['"]?/gi,
    replace: '$1=[REDACTED_SECRET]',
  },
];

export function redactString(str: string): string {
  let redacted = str;
  for (const { regex, replace } of PATTERNS) {
    redacted = redacted.replace(regex, replace);
  }
  return redacted;
}

export function redactPayload<T>(payload: T): T {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === 'string') {
    return redactString(payload) as unknown as T;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => redactPayload(item)) as unknown as T;
  }

  if (typeof payload === 'object') {
    const copy: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      copy[key] = redactPayload(value);
    }
    return copy as T;
  }

  return payload;
}
