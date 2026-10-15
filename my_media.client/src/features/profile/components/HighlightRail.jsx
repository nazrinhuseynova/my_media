import { useEffect, useState } from "react";
import { api } from "../../../services/api";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";
import { notify } from "../../../stores/useNoticeStore";

function coverOf(h) {
  if (h?.coverUrl) return h.coverUrl;
  const items = h?.items || [];
  return items.length ? items[items.length - 1].mediaUrl : "";
}

function thumb(story) {
  if (story.mediaType === "video") {
    return (
      <video src={story.mediaUrl} muted preload="metadata" playsInline />
    );
  }
  return <img src={story.mediaUrl} alt="" />;
}

export default function HighlightRail({ highlights, isMe, onChanged }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [archive, setArchive] = useState([]);
  const [selected, setSelected] = useState([]);
  const [step, setStep] = useState("pick");
  const [name, setName] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("create");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [coverPickOpen, setCoverPickOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const showRow = isMe || highlights.length > 0;

  useEffect(() => {
    if (!viewer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape") setViewer(null);
      if (e.key === "ArrowRight") setViewerIndex((i) => Math.min(i + 1, (viewer.items?.length || 1) - 1));
      if (e.key === "ArrowLeft") setViewerIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [viewer]);

  async function loadArchive() {
    try {
      const items = await api.get("/api/stories/archive");
      setArchive(Array.isArray(items) ? items : []);
    } catch {
      setArchive([]);
      notify("Hekayələr yüklənmədi", true);
    }
  }

  function openCreate() {
    setMode("create");
    setEditTarget(null);
    setSelected([]);
    setStep("pick");
    setName("");
    setCoverUrl("");
    setCreateOpen(true);
    loadArchive();
  }

  function openAdd(h) {
    setMode("add");
    setEditTarget(h);
    setSelected([]);
    setStep("pick");
    setName(h.name);
    setCoverUrl(coverOf(h));
    setManageOpen(false);
    setCreateOpen(true);
    loadArchive();
  }

  function toggleStory(story) {
    setSelected((prev) => {
      const exists = prev.some((s) => s.mediaUrl === story.mediaUrl);
      if (exists) return prev.filter((s) => s.mediaUrl !== story.mediaUrl);
      return [...prev, story];
    });
  }

  function goDetails() {
    if (!selected.length) {
      notify("Ən azı bir hekayə seç", true);
      return;
    }
    if (mode === "add") {
      saveAdd();
      return;
    }
    setStep("details");
    setCoverUrl((c) => c || selected[selected.length - 1].mediaUrl);
    if (!name) setName("Seçilmiş");
  }

  async function saveCreate() {
    const title = name.trim();
    if (!title) {
      notify("Ad yaz", true);
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/highlights", {
        name: title,
        coverUrl: coverUrl || selected[selected.length - 1]?.mediaUrl,
        items: selected.map((s) => ({
          mediaUrl: s.mediaUrl,
          mediaType: s.mediaType || "image",
          text: s.text || "",
        })),
      });
      notify("Highlight yaradıldı");
      setCreateOpen(false);
      onChanged?.();
    } catch (err) {
      notify(err?.response?.data?.message || "Yaradılmadı", true);
    } finally {
      setBusy(false);
    }
  }

  async function saveAdd() {
    if (!editTarget || !selected.length) return;
    setBusy(true);
    try {
      await api.post(`/api/highlights/${editTarget.id}/items`, {
        items: selected.map((s) => ({
          mediaUrl: s.mediaUrl,
          mediaType: s.mediaType || "image",
          text: s.text || "",
        })),
      });
      notify("Hekayələr əlavə olundu");
      setCreateOpen(false);
      onChanged?.();
    } catch (err) {
      notify(err?.response?.data?.message || "Əlavə olunmadı", true);
    } finally {
      setBusy(false);
    }
  }

  function openViewer(h) {
    setViewer(h);
    setViewerIndex(0);
  }

  function openManage(h) {
    setEditTarget(h);
    setManageOpen(true);
  }

  async function rename() {
    const title = renameValue.trim();
    if (!title || !editTarget) return;
    setBusy(true);
    try {
      await api.patch(`/api/highlights/${editTarget.id}`, { name: title });
      notify("Ad dəyişdi");
      setRenameOpen(false);
      setManageOpen(false);
      onChanged?.();
    } catch (err) {
      notify(err?.response?.data?.message || "Ad dəyişmədi", true);
    } finally {
      setBusy(false);
    }
  }

  async function setCover(url) {
    if (!editTarget) return;
    setBusy(true);
    try {
      await api.patch(`/api/highlights/${editTarget.id}`, { coverUrl: url });
      notify("Qapaq yeniləndi");
      setCoverPickOpen(false);
      setManageOpen(false);
      onChanged?.();
    } catch (err) {
      notify(err?.response?.data?.message || "Qapaq dəyişmədi", true);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(itemId) {
    if (!editTarget) return;
    setBusy(true);
    try {
      const res = await api.delete(`/api/highlights/${editTarget.id}/items/${itemId}`);
      notify("Hekayə silindi");
      if (res?.deleted) {
        setCoverPickOpen(false);
        setManageOpen(false);
        setViewer(null);
      } else {
        setEditTarget(res);
        if (viewer?.id === editTarget.id) setViewer(res);
      }
      onChanged?.();
    } catch (err) {
      notify(err?.response?.data?.message || "Silinmədi", true);
    } finally {
      setBusy(false);
    }
  }

  async function deleteHighlight() {
    if (!editTarget) return;
    setBusy(true);
    try {
      await api.delete(`/api/highlights/${editTarget.id}`);
      notify("Highlight silindi");
      setManageOpen(false);
      setViewer(null);
      setEditTarget(null);
      onChanged?.();
    } catch (err) {
      notify(err?.response?.data?.message || "Silinmədi", true);
    } finally {
      setBusy(false);
    }
  }

  if (!showRow) return null;

  const current = viewer?.items?.[viewerIndex];
  const alreadyUrls = new Set((editTarget?.items || []).map((i) => i.mediaUrl));
  const pickList = mode === "add"
    ? archive.filter((s) => !alreadyUrls.has(s.mediaUrl))
    : archive;

  return (
    <>
      <div className="hl-rail">
        {isMe ? (
          <button type="button" className="hl-item" onClick={openCreate}>
            <span className="hl-ring hl-ring-new">
              <span className="hl-plus">+</span>
            </span>
            <span className="hl-label">Yeni</span>
          </button>
        ) : null}
        {highlights.map((h) => (
          <button
            key={h.id}
            type="button"
            className="hl-item"
            onClick={() => openViewer(h)}
            onContextMenu={(e) => {
              if (!isMe) return;
              e.preventDefault();
              openManage(h);
            }}
          >
            <span className="hl-ring">
              {coverOf(h) ? <img src={coverOf(h)} alt="" /> : <span className="hl-empty" />}
            </span>
            <span className="hl-label">{h.name}</span>
          </button>
        ))}
      </div>

      {viewer && current ? (
        <div className="hl-viewer" role="dialog" aria-modal="true">
          <div className="hl-viewer-stage">
            {current.mediaType === "video" ? (
              <video className="hl-viewer-bg" src={current.mediaUrl} autoPlay playsInline muted={false} />
            ) : (
              <img className="hl-viewer-bg" src={current.mediaUrl} alt="" />
            )}
            <div className="hl-viewer-shade" />
            <div className="hl-viewer-ui">
              <div className="hl-viewer-progress">
                {(viewer.items || []).map((item, i) => (
                  <span key={item.id} className={i < viewerIndex ? "done" : i === viewerIndex ? "on" : ""} />
                ))}
              </div>
              <div className="hl-viewer-head">
                <div className="hl-viewer-who">
                  <span className="hl-viewer-cover">
                    {coverOf(viewer) ? <img src={coverOf(viewer)} alt="" /> : null}
                  </span>
                  <strong>{viewer.name}</strong>
                </div>
                <div className="hl-viewer-actions">
                  {isMe ? (
                    <button
                      type="button"
                      className="hl-icon-btn"
                      aria-label="Daha çox"
                      onClick={() => openManage(viewer)}
                    >
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.6" fill="currentColor" />
                        <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                        <circle cx="12" cy="19" r="1.6" fill="currentColor" />
                      </svg>
                    </button>
                  ) : null}
                  <button type="button" className="hl-icon-btn" aria-label="Bağla" onClick={() => setViewer(null)}>
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
              {current.text ? <p className="hl-viewer-text">{current.text}</p> : null}
            </div>
            <button
              type="button"
              className="hl-hit hl-hit-prev"
              aria-label="Əvvəlki"
              onClick={() => {
                if (viewerIndex > 0) setViewerIndex((i) => i - 1);
                else setViewer(null);
              }}
            />
            <button
              type="button"
              className="hl-hit hl-hit-next"
              aria-label="Növbəti"
              onClick={() => {
                if (viewerIndex < (viewer.items?.length || 1) - 1) setViewerIndex((i) => i + 1);
                else setViewer(null);
              }}
            />
          </div>
        </div>
      ) : null}

      <Modal
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        title={mode === "add" ? "Hekayə əlavə et" : step === "pick" ? "Hekayə seç" : "Highlight yarat"}
        from="bottom"
      >
        {step === "pick" ? (
          <>
            {pickList.length ? (
              <div className="hl-pick-grid">
                {pickList.map((story) => {
                  const on = selected.some((s) => s.mediaUrl === story.mediaUrl);
                  return (
                    <button
                      key={story.id}
                      type="button"
                      className={`hl-pick-tile ${on ? "is-on" : ""}`}
                      onClick={() => toggleStory(story)}
                    >
                      {thumb(story)}
                      {on ? <span className="hl-pick-check">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="muted">Hələ hekayən yoxdur. Əvvəl hekayə paylaş.</p>
            )}
            <div className="hl-form-actions">
              <Button variant="ghost" type="button" disabled={busy} onClick={() => setCreateOpen(false)}>Ləğv</Button>
              <Button type="button" disabled={busy || !selected.length} onClick={goDetails}>
                {mode === "add" ? "Əlavə et" : "İrəli"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <label className="hl-field">
              <span>Ad</span>
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Məs: Səyahət" />
            </label>
            <p className="hl-field-label">Qapaq foto</p>
            <div className="hl-cover-row">
              {selected.map((s) => (
                <button
                  key={s.mediaUrl}
                  type="button"
                  className={`hl-cover-pick ${coverUrl === s.mediaUrl ? "is-on" : ""}`}
                  onClick={() => setCoverUrl(s.mediaUrl)}
                >
                  {thumb(s)}
                </button>
              ))}
            </div>
            <p className="muted hl-hint">Seçməsən, sonuncu hekayə qapaq olur.</p>
            <div className="hl-form-actions">
              <Button variant="ghost" type="button" disabled={busy} onClick={() => setStep("pick")}>Geri</Button>
              <Button type="button" disabled={busy} onClick={saveCreate}>{busy ? "..." : "Yarat"}</Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={manageOpen} onClose={() => !busy && setManageOpen(false)} title={editTarget?.name || "Redaktə"} from="bottom">
        <div className="hl-manage">
          <button type="button" onClick={() => { setRenameValue(editTarget?.name || ""); setRenameOpen(true); }}>Adı dəyiş</button>
          <button type="button" onClick={() => openAdd(editTarget)}>Hekayə əlavə et</button>
          <button type="button" onClick={() => setCoverPickOpen(true)}>Qapaq / hekayə sil</button>
          <button type="button" className="is-danger" onClick={deleteHighlight}>Highlight-ı sil</button>
        </div>
      </Modal>

      <Modal open={renameOpen} onClose={() => !busy && setRenameOpen(false)} title="Adı dəyiş">
        <label className="hl-field">
          <span>Yeni ad</span>
          <input value={renameValue} maxLength={40} onChange={(e) => setRenameValue(e.target.value)} />
        </label>
        <div className="hl-form-actions">
          <Button variant="ghost" type="button" onClick={() => setRenameOpen(false)}>Ləğv</Button>
          <Button type="button" disabled={busy || !renameValue.trim()} onClick={rename}>Saxla</Button>
        </div>
      </Modal>

      <Modal open={coverPickOpen} onClose={() => !busy && setCoverPickOpen(false)} title="Hekayələr" from="bottom">
        <div className="hl-pick-grid">
          {(editTarget?.items || []).map((item) => (
            <div key={item.id} className="hl-pick-tile hl-pick-manage">
              {item.mediaType === "video" ? <video src={item.mediaUrl} muted preload="metadata" /> : <img src={item.mediaUrl} alt="" />}
              <div className="hl-pick-tools">
                <button type="button" disabled={busy} onClick={() => setCover(item.mediaUrl)}>Qapaq</button>
                <button type="button" className="is-danger" disabled={busy} onClick={() => removeItem(item.id)}>Sil</button>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
