import { useEffect, useRef, useState } from "react";
import Icon from "../../../components/ui/Icon";
import { useAppStore } from "../../../stores/useAppStore";
import { api } from "../../../services/api";
import { uploadFile, MUSIC_TRACKS } from "../../../utils/upload";
import { useStoryStore } from "../store/useStoryStore";
import { notify } from "../../../stores/useNoticeStore";
import ExpressionPicker from "../../expression/ExpressionPicker";

export default function StoryUploader() {
  const open = useAppStore((s) => s.storyOpen);
  const setStoryOpen = useAppStore((s) => s.setStoryOpen);
  const load = useStoryStore((s) => s.load);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const textRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [text, setText] = useState("");
  const [sticker, setSticker] = useState("");
  const [music, setMusic] = useState("");
  const [place, setPlace] = useState("");
  const [audience, setAudience] = useState("all");
  const [panel, setPanel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setText("");
    setSticker("");
    setMusic("");
    setPlace("");
    setPanel("");
    setBusy(false);
    setError("");
    setDrag(false);
  }

  function close() {
    setStoryOpen(false);
  }

  function takeFile(picked) {
    if (!picked) return;
    if (!picked.type.startsWith("image") && !picked.type.startsWith("video")) {
      setError("Şəkil və ya qısa video seç");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setError("");
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  }

  async function publish() {
    if (!file) {
      setError("Əvvəl şəkil və ya video əlavə et");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const kind = file.type.startsWith("video") ? "video" : "image";
      const uploaded = await uploadFile(file, kind);
      const track = MUSIC_TRACKS.find((t) => t.name === music);
      const caption = [text, place ? `⌖ ${place}` : ""].filter(Boolean).join(" · ");
      await api.post("/api/stories", {
        mediaUrl: uploaded.url,
        mediaExtension: uploaded.extension,
        text: caption,
        sticker,
        music: track ? `${track.name}||${track.url}` : music,
        mediaType: kind,
        audience,
      });
      close();
      notify("Hekayə yayıldı");
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Hekayə göndərilmədi");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="moment-back" onClick={close}>
      <div className="moment-board" onClick={(e) => e.stopPropagation()}>
        <header className="moment-top">
          <div>
            <p className="moment-kicker">Pulse lövhəsi</p>
            <h3>Yeni hekayə</h3>
          </div>
          <button type="button" className="moment-x" onClick={close} aria-label="Bağla">
            Bağla
          </button>
        </header>

        <input
          ref={galleryRef}
          className="sr-only"
          type="file"
          accept="image/*,video/*"
          onChange={(e) => {
            takeFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          className="sr-only"
          type="file"
          accept="image/*,video/*"
          capture="environment"
          onChange={(e) => {
            takeFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {!preview ? (
          <button
            type="button"
            className={`moment-drop${drag ? " is-drag" : ""}`}
            onClick={() => galleryRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              takeFile(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="moment-drop-orb">
              <Icon name="camera" size={28} />
            </span>
            <strong>Kadrı lövhəyə qoy</strong>
            <span>Qalereyadan seç və ya bura sürüşdür. 24 saat sonra öz-özünə silinəcək.</span>
          </button>
        ) : (
          <div className="moment-stage">
            {file?.type.startsWith("video") ? (
              <video className="moment-media" src={preview} autoPlay muted loop playsInline />
            ) : (
              <img className="moment-media" src={preview} alt="" />
            )}
            {text ? <p className="moment-caption">{text}</p> : null}
            {sticker ? <span className="moment-mark">{sticker}</span> : null}
            {music ? <span className="moment-track">♪ {music}</span> : null}
            {place ? <span className="moment-track">⌖ {place}</span> : null}
          </div>
        )}

        {preview ? (
          <>
            <div className="moment-tools">
              <button type="button" className={panel === "text" ? "is-on" : ""} onClick={() => { setPanel("text"); textRef.current?.focus(); }}>
                Yazı
              </button>
              <button type="button" className={panel === "express" ? "is-on" : ""} onClick={() => setPanel(panel === "express" ? "" : "express")}>
                Emoji / Stiker / Musiqi / Məkan
              </button>
              <button type="button" className={audience === "close" ? "is-on" : ""} onClick={() => setAudience(audience === "close" ? "all" : "close")}>
                {audience === "close" ? "Yaxın çevrə" : "Hamı"}
              </button>
            </div>
            {panel === "text" || text ? (
              <input
                ref={textRef}
                className="moment-text"
                value={text}
                maxLength={80}
                placeholder="Lövhəyə yaz..."
                onChange={(e) => setText(e.target.value)}
              />
            ) : null}
            {panel === "express" ? (
              <ExpressionPicker
                onPick={(payload) => {
                  if (payload.kind === "emoji" || payload.kind === "sticker") {
                    setSticker(payload.text);
                  } else if (payload.kind === "music") {
                    const name = payload.meta?.title || payload.text.split(" — ")[0];
                    setMusic(name);
                  } else if (payload.kind === "location") {
                    setPlace(payload.text);
                  }
                }}
              />
            ) : null}
          </>
        ) : (
          <div className="moment-pick">
            <button type="button" onClick={() => galleryRef.current?.click()}>Qalereya</button>
            <button type="button" onClick={() => cameraRef.current?.click()}>Kamera</button>
          </div>
        )}

        {error ? <p className="error-text">{error}</p> : null}

        <footer className="moment-foot">
          <span>24 saat qalır, sonra silinir</span>
          <button type="button" className="moment-go" disabled={!file || busy} onClick={publish}>
            {busy ? "Göndərilir..." : "Yayımla"}
          </button>
        </footer>
      </div>
    </div>
  );
}
