const DEFAULT_PORT = 3041;
const DEFAULT_WEBHOOK_PATHS = new Set(["/", "/wh"]);
const SECRET_PREFIX = "TRIBUTE_API_KEY__";

type SecretMap = Map<string, string>;

export const TRIBUTE_SECRET = Bun.env.TRIBUTE_API_KEY ?? "";

export function normalizeWebhookPath(pathname: string): string {
  if (!pathname) return "/";
  const trimmed = pathname.trim();
  if (!trimmed) return "/";
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = prefixed.replace(/\/{2,}/g, "/");
  if (collapsed === "/") {
    return "/";
  }
  const withoutTrailingSlash = collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
  return withoutTrailingSlash.toLowerCase();
}

function decodeEnvSecretPath(rawKey: string): string | null {
  if (!rawKey) {
    return null;
  }
  const parts = rawKey
    .split("__")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/_/g, "-").toLowerCase());

  if (parts.length === 0) {
    return null;
  }
  return normalizeWebhookPath(parts.join("/"));
}

function loadSecretsFromJson(): SecretMap {
  const map: SecretMap = new Map();
  const raw = Bun.env.TRIBUTE_SECRET_MAP;
  if (!raw) {
    return map;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        const path = normalizeWebhookPath(key);
        if (path) {
          map.set(path, value);
        }
      } else {
        console.warn(`Ignoring non-string tribute secret for path "${key}"`);
      }
    }
  } catch (error) {
    console.error("Failed to parse TRIBUTE_SECRET_MAP; expected JSON object", error);
  }

  return map;
}

function loadSecretsFromEnvPrefix(existing: SecretMap): SecretMap {
  const map = new Map(existing);
  for (const [key, value] of Object.entries(Bun.env)) {
    if (!key.startsWith(SECRET_PREFIX)) continue;
    if (!value) continue;
    const rawSlug = key.slice(SECRET_PREFIX.length);
    const path = decodeEnvSecretPath(rawSlug);
    if (!path) {
      console.warn(`Ignoring ${key} because its suffix could not be converted to a path`);
      continue;
    }
    map.set(path, value);
  }
  return map;
}

const SECRET_OVERRIDES: SecretMap = loadSecretsFromEnvPrefix(loadSecretsFromJson());

export const PORT = (() => {
  const fromEnv = Bun.env.PORT;
  if (!fromEnv) return DEFAULT_PORT;
  const parsed = Number.parseInt(fromEnv, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
})();

function getSecretValueForPath(normalizedPath: string): string | undefined {
  if (SECRET_OVERRIDES.has(normalizedPath)) {
    return SECRET_OVERRIDES.get(normalizedPath);
  }
  if (DEFAULT_WEBHOOK_PATHS.has(normalizedPath)) {
    return TRIBUTE_SECRET;
  }
  return undefined;
}

export function getWebhookSecret(pathname: string): string | null {
  const normalized = normalizeWebhookPath(pathname);
  const secret = getSecretValueForPath(normalized);
  return secret === undefined ? null : secret;
}

export function getKnownWebhookPaths(): string[] {
  const paths = new Set<string>();
  for (const path of SECRET_OVERRIDES.keys()) {
    paths.add(path);
  }
  for (const path of DEFAULT_WEBHOOK_PATHS) {
    paths.add(path);
  }
  return Array.from(paths).sort();
}

export function ensureConfig() {
  const configuredPaths = getKnownWebhookPaths();
  if (configuredPaths.length === 0) {
    console.warn("No webhook endpoints configured; set TRIBUTE_API_KEY or TRIBUTE_SECRET_MAP.");
  }

  const hasDefaultSecret = TRIBUTE_SECRET.length > 0;
  if (!hasDefaultSecret) {
    const defaultsOverridden = Array.from(DEFAULT_WEBHOOK_PATHS).some((path) => {
      const override = SECRET_OVERRIDES.get(path);
      return typeof override === "string" && override.length > 0;
    });

    if (!defaultsOverridden) {
      console.warn("TRIBUTE_API_KEY not set; default webhook endpoints (/, /wh) will fail signature checks.");
    }
  }

  for (const [path, secret] of SECRET_OVERRIDES.entries()) {
    if (!secret) {
      console.warn(`Webhook path ${path} configured with an empty secret`);
    }
  }
}

export { DEFAULT_WEBHOOK_PATHS, SECRET_OVERRIDES };
