"use client";

import { useEffect, useRef } from "react";

export function TradingViewWidget({
  src,
  config,
  height = 400,
}: {
  src: string;
  config: object;
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const configKey = JSON.stringify(config);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    el.innerHTML = "";
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = configKey;
    el.appendChild(script);
    return () => {
      el.innerHTML = "";
    };
  }, [src, configKey]);

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <div ref={container} style={{ height }} />
    </div>
  );
}
