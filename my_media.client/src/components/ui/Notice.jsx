import { useEffect, useState } from "react";
import { readStoredNotice, useNoticeStore } from "../../stores/useNoticeStore";

export default function Notice() {
  const text = useNoticeStore((s) => s.text);
  const kind = useNoticeStore((s) => s.kind);
  const tick = useNoticeStore((s) => s.tick);
  const show = useNoticeStore((s) => s.show);
  const clear = useNoticeStore((s) => s.clear);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredNotice();
    if (stored?.text) show(stored.text, stored.kind);
    setReady(true);
  }, [show]);

  useEffect(() => {
    if (!ready || !text) return;
    if (!document.querySelector(".stage-lock")) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    const timer = setTimeout(clear, 4200);
    return () => clearTimeout(timer);
  }, [text, tick, ready, clear]);

  if (!text) return null;
  return (
    <p className={`app-notice ${kind === "bad" ? "is-bad" : "is-ok"}`} role="status">
      {text}
    </p>
  );
}
