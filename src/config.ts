const DEFAULT_PORT = 3041;

export const TRIBUTE_SECRET = Bun.env.TRIBUTE_API_KEY ?? "";

export const PORT = (() => {
  const fromEnv = Bun.env.PORT;
  if (!fromEnv) return DEFAULT_PORT;
  const parsed = Number.parseInt(fromEnv, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
})();

export function ensureConfig() {
  if (!TRIBUTE_SECRET) {
    console.warn("TRIBUTE_API_KEY not set; webhook signature verification will fail.");
  }
}
