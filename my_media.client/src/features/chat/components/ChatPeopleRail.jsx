import { useEffect, useRef, useState } from "react";
import Avatar from "../../../components/ui/Avatar";
import Icon from "../../../components/ui/Icon";
import Button from "../../../components/ui/Button";
import ExpressionPicker from "../../expression/ExpressionPicker";

function noteLabel(person) {
  const text = (person?.noteText || "").trim();
  if (!text) return "";
  const kind = person?.noteKind || "text";
  if (kind === "music") return `♫ ${text}`;
  if (kind === "location") return `⌖ ${text}`;
  return text;
}

function NoteSheet({ me, onClose, onSave }) {
  const [kind, setKind] = useState(me?.noteKind || "text");
  const [text, setText] = useState(me?.noteText || "");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(me?.noteKind && me.noteKind !== "text" ? me.noteKind : "text");

  async function submit(clear) {
    const value = clear ? "" : text.trim();
    if (!clear && !value) return;
    setBusy(true);
    try {
      await onSave(value, kind);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="note-sheet" role="dialog" aria-label="Durum">
      <div className="note-sheet-card note-sheet-wide">
        <header className="note-sheet-head">
          <strong>Durum / Note</strong>
          <button type="button" onClick={onClose} aria-label="Bağla">×</button>
        </header>
        <p className="muted">Musiqi, məkan, emoji və stiker — Instagram Notes kimi 24 saat.</p>

        <div className="note-kind-row">
          {[
            { id: "text", label: "Yazı" },
            { id: "pick", label: "Emoji / Stiker / Musiqi / Məkan" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={(item.id === "text" ? mode === "text" : mode !== "text") ? "is-on" : ""}
              onClick={() => setMode(item.id === "text" ? "text" : "emoji")}
            >
              {item.label}
            </button>
          ))}
        </div>

        {mode === "text" ? (
          <input
            autoFocus
            value={text}
            maxLength={60}
            placeholder="Share a thought…"
            onChange={(e) => {
              setText(e.target.value);
              setKind("text");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit(false);
            }}
          />
        ) : (
          <>
            <ExpressionPicker
              initialTab={["music", "location", "emoji", "sticker"].includes(kind) ? (kind === "sticker" ? "sticker" : kind) : "emoji"}
              onPick={(payload) => {
                const nextKind = payload.kind === "sticker" ? "emoji" : payload.kind;
                setKind(nextKind);
                setText(payload.text);
              }}
            />
            {text ? <p className="note-picked">Seçildi: <strong>{text}</strong></p> : null}
          </>
        )}

        <div className="note-sheet-actions">
          {me?.noteText ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => submit(true)}>Sil</Button>
          ) : null}
          <Button type="button" disabled={busy || !text.trim()} onClick={() => submit(false)}>Paylaş</Button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPeopleRail({ people, onOpen, onSetNote, me }) {
  const row = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const [openNote, setOpenNote] = useState(false);
  const list = people || [];

  function measure() {
    const el = row.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({
      left: el.scrollLeft > 6,
      right: max > 6 && el.scrollLeft < max - 6,
    });
  }

  useEffect(() => {
    measure();
    const el = row.current;
    if (!el) return undefined;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      watch.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [list.length, me?.noteText]);

  function move(dir) {
    const el = row.current;
    if (!el) return;
    el.scrollBy({ left: dir * 160, behavior: "smooth" });
  }

  if (!list.length && !me) return null;

  return (
    <>
      <div className="chat-people-rail" aria-label="Aktiv profillər">
        <div className="chat-people-slot">
          {edge.left ? (
            <button type="button" className="chat-people-nav" onClick={() => move(-1)} aria-label="Sola">
              <Icon name="back" size={18} />
            </button>
          ) : null}
        </div>
        <div className="chat-people" ref={row} onScroll={measure}>
          {me ? (
            <button type="button" className="chat-person chat-person-me" onClick={() => setOpenNote(true)} title="Durum əlavə et">
              <span className="chat-person-face">
                {me.noteText ? (
                  <span className="chat-note-bubble">{noteLabel(me)}</span>
                ) : (
                  <span className="chat-note-plus" aria-hidden="true">+</span>
                )}
                <Avatar src={me.avatar} alt={me.username || ""} />
              </span>
              <span>Sənin notun</span>
            </button>
          ) : null}
          {list.map((person) => {
            const bubble = noteLabel(person);
            return (
              <button key={person.id} type="button" className="chat-person" onClick={() => onOpen(person)}>
                <span className="chat-person-face">
                  {bubble ? <span className="chat-note-bubble">{bubble}</span> : null}
                  <Avatar src={person.avatar} alt={person.fullName || person.username} />
                  {person.isOnline === true ? (
                    <span className="chat-person-dot" aria-label="Aktiv" />
                  ) : person.isOnline === false ? (
                    <span className="chat-person-dot is-offline" aria-label="Oflayn" />
                  ) : null}
                </span>
                <span>{person.username}</span>
              </button>
            );
          })}
        </div>
        <div className="chat-people-slot">
          {edge.right ? (
            <button type="button" className="chat-people-nav" onClick={() => move(1)} aria-label="Sağa">
              <Icon name="next" size={18} />
            </button>
          ) : null}
        </div>
      </div>
      {openNote ? (
        <NoteSheet
          me={me}
          onClose={() => setOpenNote(false)}
          onSave={async (text, kind) => {
            await onSetNote?.(text, kind);
          }}
        />
      ) : null}
    </>
  );
}
