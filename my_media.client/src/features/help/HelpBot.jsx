import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { CHIPS, chipsOf, starterChips } from "./knowledge";
import { answerFor, formatReportStatus } from "./match";

const POS_KEY = "pulse_help_pos_v1";
const HI_KEY = "pulse_help_hi_v1";
const CHAT_KEY = "pulse_help_chat_v1";

function clamp(pos) {
  const pad = 8;
  const size = 76;
  const maxX = Math.max(pad, window.innerWidth - size - pad);
  const maxY = Math.max(pad, window.innerHeight - size - pad);
  return {
    x: Math.min(Math.max(pad, pos.x), maxX),
    y: Math.min(Math.max(pad, pos.y), maxY),
  };
}

function defaultPos() {
  const narrow = window.innerWidth < 769;
  return clamp({
    x: window.innerWidth - 88,
    y: window.innerHeight - (narrow ? 156 : 104),
  });
}

function readPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return clamp(JSON.parse(raw));
  } catch {
    /* saxlanmış yer oxunmadı */
  }
  return defaultPos();
}

function welcome(path) {
  return {
    id: "hi",
    role: "bot",
    text: "Salam. Mən Nəbzəm. Şikayət, ayar və tətbiqin qalan hissəsi haqqında buradan soruş.",
    chips: chipsOf(starterChips(path)),
  };
}

function readChat(path) {
  try {
    const raw = sessionStorage.getItem(CHAT_KEY);
    const list = raw ? JSON.parse(raw) : null;
    if (Array.isArray(list) && list.length) return list;
  } catch {
    /* söhbət oxunmadı */
  }
  return [welcome(path)];
}

export default function HelpBot() {
  const navigate = useNavigate();
  const location = useLocation();
  const [pos, setPos] = useState(readPos);
  const [open, setOpen] = useState(false);
  const [hiddenHi, setHiddenHi] = useState(() => localStorage.getItem(HI_KEY) === "1");
  const [messages, setMessages] = useState(() => readChat(location.pathname));
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const posRef = useRef(pos);
  const dragRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const waitRef = useRef(0);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* sessiya dolu ola bilər */
    }
  }, [messages]);

  useEffect(() => {
    function onResize() {
      setPos((current) => clamp(current));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const node = listRef.current;
    const last = node?.lastElementChild;
    last?.scrollIntoView({ block: "nearest" });
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, messages, typing]);

  useEffect(() => () => window.clearTimeout(waitRef.current), []);

  function savePos(next) {
    const placed = clamp(next);
    posRef.current = placed;
    setPos(placed);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(placed));
    } catch {
      /* yer saxlanmadı */
    }
  }

  function onDragDown(event) {
    if (event.button != null && event.button !== 0) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      px: posRef.current.x,
      py: posRef.current.y,
      moved: false,
      toggle: event.currentTarget.dataset.launch === "1",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDragMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 6) {
      drag.moved = true;
      setDragging(true);
    }
    if (!drag.moved) return;
    const next = clamp({ x: drag.px + dx, y: drag.py + dy });
    posRef.current = next;
    setPos(next);
  }

  function onDragUp(event) {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!drag) return;
    if (drag.moved) {
      savePos(posRef.current);
      return;
    }
    if (drag.toggle) setOpen((value) => !value);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function ask(text) {
    const clean = text.trim();
    if (!clean || typing) return;
    const mine = { id: `u-${Date.now()}`, role: "user", text: clean };
    setMessages((list) => [...list, mine]);
    setDraft("");
    setTyping(true);
    const reply = answerFor(clean) || {
      text: "Bunu dəqiq tuta bilmədim. Şikayət, ayar, paylaşım, mesaj və hesab haqqında soruşa bilərsən.",
      chips: chipsOf(["report", "settings", "post", "direct", "safety", "start"]),
    };
    let textOut = reply.text;
    if (reply.live === "reports") {
      try {
        const rows = await api.get("/api/reports/mine");
        textOut = formatReportStatus(Array.isArray(rows) ? rows : []);
      } catch {
        textOut = "Şikayət statusunu indi aça bilmədim. Bir az sonra yenidən soruş, ya da Bildirişlərə bax.";
      }
    }
    const delay = Math.min(900, 380 + clean.length * 8);
    waitRef.current = window.setTimeout(() => {
      setMessages((list) => [...list, {
        id: `b-${Date.now()}`,
        role: "bot",
        text: textOut,
        to: reply.to || "",
        linkLabel: reply.linkLabel || "",
        chips: reply.chips || [],
      }]);
      setTyping(false);
    }, delay);
  }

  function submit(event) {
    event.preventDefault();
    ask(draft);
  }

  function resetChat() {
    window.clearTimeout(waitRef.current);
    setTyping(false);
    setMessages([welcome(location.pathname)]);
  }

  function dismissHi(event) {
    event.stopPropagation();
    setHiddenHi(true);
    try {
      localStorage.setItem(HI_KEY, "1");
    } catch {
      /* salam saxlanmadı */
    }
  }

  function openLink(to) {
    setOpen(false);
    navigate(to);
  }

  const panelWidth = Math.min(360, window.innerWidth - 16);
  const alignLeft = pos.x < window.innerWidth / 2 && pos.x + panelWidth < window.innerWidth - 8;
  const openDown = pos.y < 300;
  const slide = alignLeft
    ? Math.min(0, window.innerWidth - 8 - (pos.x + panelWidth))
    : Math.max(0, 8 - (pos.x + 76 - panelWidth));

  return (
    <div
      className={`help-bot${alignLeft ? " is-left" : ""}${openDown ? " is-down" : ""}${dragging ? " is-drag" : ""}${open ? " is-open" : ""}`}
      style={{ left: pos.x, top: pos.y }}
    >
      {open ? (
        <section className="help-panel" role="dialog" aria-label="Kömək" style={{ width: panelWidth, transform: `translateX(${slide}px)` }}>
          <header className="help-head" onPointerDown={onDragDown} onPointerMove={onDragMove} onPointerUp={onDragUp}>
            <Face small />
            <span>
              <strong>Nəbz</strong>
              <span className="help-status">Buradadır</span>
            </span>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={resetChat} aria-label="Söhbəti təmizlə">↻</button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setOpen(false)} aria-label="Bağla">✕</button>
          </header>
          <div className="help-log" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
            {messages.map((row) => (
              <article key={row.id} className={`help-msg is-${row.role}`}>
                {row.role === "bot" ? <Face tiny /> : null}
                <div>
                  <p style={{ whiteSpace: "pre-wrap" }}>{row.text}</p>
                  {row.to ? <button type="button" className="help-jump" onClick={() => openLink(row.to)}>{row.linkLabel}</button> : null}
                  {row.chips?.length ? (
                    <div className="help-chips">
                      {row.chips.map((chip) => (
                        <button key={chip.id} type="button" onClick={() => ask(CHIPS[chip.id])}>{chip.label}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {typing ? (
              <article className="help-msg is-bot">
                <Face tiny />
                <div className="help-typing" aria-label="Yazır"><i /><i /><i /></div>
              </article>
            ) : null}
          </div>
          <form className="help-form" onSubmit={submit}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Sualını yaz"
              aria-label="Sualın"
              maxLength={240}
            />
            <button type="submit" disabled={!draft.trim() || typing} aria-label="Göndər">↑</button>
          </form>
        </section>
      ) : null}
      {!open && !hiddenHi ? (
        <div className="help-hi">
          <p>Şikayət, ayar və tətbiq haqqında soruş.</p>
          <button type="button" onClick={dismissHi} aria-label="Salamı bağla">✕</button>
        </div>
      ) : null}
      <button
        type="button"
        className="help-launch"
        data-launch="1"
        aria-expanded={open}
        aria-label={open ? "Köməyi bağla" : "Kömək"}
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <Face />
        <span>Kömək</span>
      </button>
    </div>
  );
}

function Face({ small, tiny }) {
  const size = tiny ? " is-tiny" : small ? " is-small" : "";
  return (
    <span className={`help-face${size}`} aria-hidden="true">
      <span className="help-eyes"><i /><i /></span>
      <span className="help-smile" />
    </span>
  );
}
