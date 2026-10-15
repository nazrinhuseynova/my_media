import { useEffect, useRef } from "react";
import { useUiPrefs } from "../../stores/useUiPrefs";

/** Grid/mosaic-də görünəndə sessiz autoplay (Instagram axtarış axını kimi). */
export default function AutoPlayVideo({ src, className }) {
  const ref = useRef(null);
  const autoplay = useUiPrefs((s) => s.autoplayVideos);
  const dataSaver = useUiPrefs((s) => s.dataSaver);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return undefined;
    if (!autoplay || dataSaver) {
      el.pause();
      return undefined;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
          el.muted = true;
          const play = el.play();
          if (play?.catch) play.catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.45, 0.75] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src, autoplay, dataSaver]);

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      muted
      playsInline
      loop
      preload={dataSaver ? "none" : "metadata"}
    />
  );
}
