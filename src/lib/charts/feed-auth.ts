// El feed de la VPS usa el mismo secreto que el orquestador MT5
// (MT5_ORCHESTRATOR_SECRET en Render = VANTAX_MT5_SECRET en el .env de la VPS).
export function checkFeedSecret(req: Request): boolean {
  const expected = process.env.MT5_ORCHESTRATOR_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") && auth.slice(7) === expected;
}
