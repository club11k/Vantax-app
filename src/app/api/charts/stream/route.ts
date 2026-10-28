import { getChartsUserId } from "@/lib/charts/viewer";
import { feedOnline, getLastBars, isTimeframe } from "@/lib/charts/feed-store";

export const dynamic = "force-dynamic";

// Tiempo real de CHARTS (28/10/2026): conexión abierta (Server-Sent Events)
// que manda la vela en curso en cuanto llega del MT5, sin que el navegador
// tenga que preguntar cada segundo.
const CHECK_MS = 100;
const MAX_LIFE_MS = 5 * 60_000; // se reabre sola cada 5 minutos

export async function GET(req: Request) {
  if (!(await getChartsUserId())) return new Response("No autenticado.", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const symbol = (sp.get("symbol") ?? "").slice(0, 64);
  const tf = sp.get("tf") ?? "";
  if (!symbol || !isTimeframe(tf)) return new Response("Petición inválida.", { status: 400 });

  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const started = Date.now();
      let lastSig = "";
      let lastOnline: boolean | null = null;
      let lastPing = Date.now();
      const send = (data: string) => {
        try {
          controller.enqueue(enc.encode(data));
        } catch {
          stop();
        }
      };
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = null;
        try {
          controller.close();
        } catch {
          /* ya cerrada */
        }
      };
      send("retry: 1000\n\n");
      timer = setInterval(() => {
        if (req.signal.aborted || Date.now() - started > MAX_LIFE_MS) return stop();
        const bars = getLastBars(symbol, tf);
        const online = feedOnline();
        const lb = bars[bars.length - 1];
        const sig = lb ? `${lb.t}|${lb.o}|${lb.h}|${lb.l}|${lb.c}|${lb.v}|${bars.length}` : "";
        if (sig !== lastSig || online !== lastOnline) {
          lastSig = sig;
          lastOnline = online;
          send(`data: ${JSON.stringify({ online, bars })}\n\n`);
          lastPing = Date.now();
        } else if (Date.now() - lastPing > 15_000) {
          send(": ping\n\n");
          lastPing = Date.now();
        }
      }, CHECK_MS);
      req.signal.addEventListener("abort", stop);
    },
    cancel() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
