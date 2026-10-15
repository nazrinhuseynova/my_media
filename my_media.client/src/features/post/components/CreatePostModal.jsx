import { useRef, useState } from "react";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { useAppStore } from "../../../stores/useAppStore";
import { cropImage } from "../../../utils/cropImage";
import { dataUrlToFile, uploadFile } from "../../../utils/upload";
import { postApi } from "../services/postApi";
import { notify } from "../../../stores/useNoticeStore";
import { useAuthStore } from "../../auth/store/useAuthStore";
import FilterPicker from "./FilterPicker";
import ImageEditor from "./ImageEditor";
import { ExpressionButton } from "../../expression/ExpressionPicker";

export default function CreatePostModal() {
  const open = useAppStore((s) => s.createOpen);
  const setCreateOpen = useAppStore((s) => s.setCreateOpen);
  const fileRef = useRef(null);
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [filter, setFilter] = useState("none");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [crop, setCrop] = useState({ x: 0, y: 0, size: 100 });
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [mentions, setMentions] = useState("");
  const [schedule, setSchedule] = useState("");
  const [photoTags, setPhotoTags] = useState("");
  const [pollOn, setPollOn] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("Bəli, Xeyr");
  const [busy, setBusy] = useState(false);
  const me = useAuthStore((s) => s.user);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);

  function close() {
    setCreateOpen(false);
    setStep(1);
    setFiles([]);
    setPreviews([]);
    setCaption("");
    setSchedule("");
    setError("");
    setDrag(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function takeFiles(list) {
    const next = Array.from(list || []).filter((f) => f.type.startsWith("image") || f.type.startsWith("video"));
    if (!next.length) {
      setError("Şəkil və ya video seçin");
      return;
    }
    setError("");
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
    setStep(2);
  }

  function onFiles(e) {
    takeFiles(e.target.files);
    e.target.value = "";
  }

  async function publish(asDraft = false) {
    const options = pollOptions.split(",").map((x) => x.trim()).filter(Boolean);
    const poll = pollOn && pollQuestion.trim() && options.length >= 2 ? { question: pollQuestion.trim(), options } : null;
    if (!files.length && !poll && !asDraft) {
      setError("Şəkil və ya video seçin");
      return;
    }
    setBusy(true);
    try {
      const media = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        if (file.type.startsWith("video")) {
          const uploaded = await uploadFile(file, "video");
          media.push({ type: "video", url: uploaded.url, extension: uploaded.extension, filter });
        } else {
          let uploaded;
          try {
            const dataUrl = await cropImage(previews[i], crop, filter, brightness, contrast);
            const cropped = dataUrlToFile(dataUrl, file.name.replace(/\.\w+$/, ".jpg"));
            uploaded = await uploadFile(cropped, "image");
          } catch {
            uploaded = await uploadFile(file, "image");
          }
          media.push({ type: "image", url: uploaded.url, extension: uploaded.extension, filter });
        }
      }
      let scheduledAt = null;
      if (schedule) {
        const when = new Date(schedule);
        if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
          setError("Plan vaxtı keçib");
          setBusy(false);
          return;
        }
        scheduledAt = when.toISOString();
      }
      await postApi.create({
        media,
        caption,
        location,
        mentions: mentions.split(",").map((x) => x.trim()).filter(Boolean),
        tags: photoTags.split(",").map((x) => x.trim()).filter(Boolean),
        poll,
        scheduledAt,
        isDraft: asDraft,
      });
      const username = me?.username;
      close();
      notify(asDraft ? "Qaralama yadda saxlandı" : scheduledAt ? "Paylaşım planlandı" : "Paylaşım getdi");
      window.location.assign(asDraft ? "/drafts" : scheduledAt && username ? `/profile/${username}` : "/");
    } catch (err) {
      setError(err.response?.data?.message || "Paylaşılmadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Yeni paylaşım">
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/*,video/*,image/jpeg,image/png,image/webp,video/mp4"
        multiple
        onChange={onFiles}
      />

      {step === 1 ? (
        <div className="create-step">
          <button
            type="button"
            className={`create-drop${drag ? " is-drag" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              takeFiles(e.dataTransfer.files);
            }}
          >
            <span className="create-drop-icon">＋</span>
            <strong>Qalereyadan seç</strong>
            <span className="muted">Şəkil, video və ya bir neçə fayl. Sahəyə daşıya da bilərsən.</span>
          </button>
          <Button variant="ghost" type="button" onClick={() => { setError(""); setStep(2); }}>Sorğu ilə davam et</Button>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      ) : (
        <div className="create-step">
          <div className="create-preview">
            {previews[0] && !files[0]?.type.startsWith("video") ? (
              <ImageEditor src={previews[0]} filter={filter} brightness={brightness} contrast={contrast} />
            ) : previews[0] ? (
              <video src={previews[0]} controls />
            ) : (
              <p className="muted">Media yoxdur. Sorğu və ya yazı paylaşa bilərsən.</p>
            )}
          </div>
          <p className="muted">{files.length} fayl seçildi</p>
          <Button variant="ghost" type="button" onClick={() => fileRef.current?.click()}>Başqa fayl seç</Button>

          <div className="create-sliders">
            <label>Kəsmə X {crop.x}%<input type="range" min="0" max="40" value={crop.x} onChange={(e) => setCrop({ ...crop, x: Number(e.target.value) })} /></label>
            <label>Kəsmə Y {crop.y}%<input type="range" min="0" max="40" value={crop.y} onChange={(e) => setCrop({ ...crop, y: Number(e.target.value) })} /></label>
            <label>Ölçü {crop.size}%<input type="range" min="60" max="100" value={crop.size} onChange={(e) => setCrop({ ...crop, size: Number(e.target.value) })} /></label>
          </div>
          <p className="muted">Filtr</p>
          <FilterPicker value={filter} onChange={setFilter} />
          <div className="create-sliders">
            <label>Parlaqlıq {brightness}<input type="range" min="60" max="140" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} /></label>
            <label>Kontrast {contrast}<input type="range" min="60" max="140" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /></label>
          </div>
          <div className="create-caption-row">
            <ExpressionButton
              onPick={(payload) => {
                if (payload.kind === "emoji" || payload.kind === "sticker") {
                  setCaption((prev) => `${prev}${payload.text}`);
                } else if (payload.kind === "music") {
                  setCaption((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}♫ ${payload.text}`);
                } else if (payload.kind === "location") {
                  setLocation(payload.text);
                }
              }}
            />
            <Input label="Caption (#hashtag və @mention)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <Input label="Lokasiya" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Input label="Tag (username, vergüllə)" value={mentions} onChange={(e) => setMentions(e.target.value)} />
          <label className="field">
            Planlaşdır
            <input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </label>
          <p className="muted">Boş buraxsan post indi paylaşılır. Vaxt seçsən, həmin vaxta qədər lentdə görünmür.</p>
          <Input label="Şəkildə işarə (username, vergüllə)" value={photoTags} onChange={(e) => setPhotoTags(e.target.value)} />
          <label className="settings-switch">
            <span>Sorğu əlavə et</span>
            <input type="checkbox" checked={pollOn} onChange={(e) => setPollOn(e.target.checked)} />
          </label>
          {pollOn ? (
            <>
              <Input label="Sual" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
              <Input label="Cavablar (vergüllə)" value={pollOptions} onChange={(e) => setPollOptions(e.target.value)} />
            </>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
          <div className="create-actions">
            <Button variant="ghost" type="button" onClick={close}>Bağla</Button>
            <Button variant="ghost" disabled={busy} type="button" onClick={() => publish(true)}>Qaralama</Button>
            <Button disabled={busy} type="button" onClick={() => publish(false)}>{busy ? "Göndərilir..." : "Paylaş"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
