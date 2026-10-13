import { useState } from "react";
import Modal from "../../../components/ui/Modal";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { useAppStore } from "../../../stores/useAppStore";
import { api } from "../../../services/api";
import { uploadFile, MUSIC_TRACKS } from "../../../utils/upload";
import { notify } from "../../../stores/useNoticeStore";

const EFFECTS = ["none", "warm", "cool", "moon", "clarendon"];

export default function CreateReelModal() {
  const open = useAppStore((s) => s.reelCreateOpen);
  const setOpen = useAppStore((s) => s.setReelCreateOpen);
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [music, setMusic] = useState(MUSIC_TRACKS[0].name);
  const [effect, setEffect] = useState("none");

  async function submit() {
    if (!videoFile) return;
    try {
      const uploaded = await uploadFile(videoFile, "video");
      const track = MUSIC_TRACKS.find((t) => t.name === music) || MUSIC_TRACKS[0];
      await api.post("/api/reels", {
        videoUrl: uploaded.url,
        videoExtension: uploaded.extension,
        caption,
        music: `${track.name}||${track.url}`,
        effect,
      });
      setOpen(false);
      notify("Reel paylaşıldı");
      window.location.assign("/reels");
    } catch {
    }
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Reel">
      <Input type="file" accept="video/*" label="Qısa dikey video" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) {
          setVideoFile(f);
          setVideoUrl(URL.createObjectURL(f));
        }
      }} />
      {videoUrl ? <video src={videoUrl} className={`filter-${effect}`} controls style={{ width: "100%" }} /> : null}
      <Input label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
      <label className="field">Musiqi
        <select value={music} onChange={(e) => setMusic(e.target.value)}>
          {MUSIC_TRACKS.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
        </select>
      </label>
      <div className="row">{EFFECTS.map((e) => <button key={e} className={`btn ${effect === e ? "btn-primary" : "btn-ghost"}`} onClick={() => setEffect(e)}>{e}</button>)}</div>
      <Button onClick={submit} style={{ marginTop: 12 }}>Paylaş</Button>
    </Modal>
  );
}
