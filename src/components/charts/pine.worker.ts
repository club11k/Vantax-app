// Cálculo de indicadores Pine en segundo plano (Web Worker), para que un
// indicador pesado no congele el gráfico (28/10/2026).
import { PineRuntime, PineBar } from "@/lib/pine/runtime";

const runtimes = new Map<string, { code: string; rt: PineRuntime }>();

self.onmessage = (e: MessageEvent) => {
  const { reqId, id, code, bars, opts, sec } = e.data as {
    reqId: number;
    id: string;
    code: string;
    bars: PineBar[];
    opts: { symbol: string; tf: string; mintick: number; inputs: Record<string, any> };
    sec: Record<string, PineBar[] | "error">;
  };
  try {
    let r = runtimes.get(id);
    if (!r || r.code !== code) {
      r = { code, rt: new PineRuntime(code) };
      runtimes.set(id, r);
    }
    const missing = new Set<string>();
    const t0 = performance.now();
    const out = r.rt.run(bars, {
      ...opts,
      secBars: (s: string, tf: string) => {
        const v = sec[s + "|" + tf];
        return v === undefined ? null : v;
      },
      missing,
    });
    (self as any).postMessage({ reqId, out, missing: [...missing], ms: performance.now() - t0 });
  } catch (err) {
    (self as any).postMessage({ reqId, error: (err as Error).message });
  }
};
