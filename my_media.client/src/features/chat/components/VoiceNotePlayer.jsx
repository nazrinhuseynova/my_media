import { useEffect, useRef, useState } from "react";

function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** WhatsApp/IG stilində səs mesajı pleyeri */
export default function VoiceNotePlayer({ src, mine }) {
  const audioRef = useRef(null);
  const waveRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    const onTime = () => setCurrent(el.currentTime || 0);
    const onMeta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
      el.currentTime = 0;
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, [src]);

  async function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  function seek(e) {
    const el = audioRef.current;
    const wave = waveRef.current;
    if (!el || !wave || !duration) return;
    const rect = wave.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    setCurrent(el.currentTime);
  }

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className={`voice-note${mine ? " me" : ""}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button type="button" className="voice-note-play" onClick={toggle} aria-label={playing ? "Dayandır" : "Oynat"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="voice-note-body">
        <button type="button" className="voice-note-wave" ref={waveRef} onClick={seek} aria-label="Səs irəliləməsi">
          {Array.from({ length: 26 }).map((_, i) => (
            <i key={i} style={{ height: `${30 + ((i * 37) % 55)}%` }} />
          ))}
          <span className="voice-note-progress" style={{ width: `${pct}%` }} />
        </button>
        <span className="voice-note-time">{fmt(playing || current > 0 ? current : duration)}</span>
      </div>
    </div>
  );
}
