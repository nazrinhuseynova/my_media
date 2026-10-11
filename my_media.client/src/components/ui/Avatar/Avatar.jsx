import { useEffect, useState } from "react";
import { mediaSrc } from "../../../utils/upload";

export default function Avatar({ src, alt, size }) {
  const [broken, setBroken] = useState(false);
  const url = mediaSrc(src);
  const cls = size === "xl" ? "avatar avatar-xl" : size === "lg" ? "avatar avatar-lg" : "avatar";
  const letter = String(alt || "?").trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setBroken(false);
  }, [url]);

  if (!url || broken) {
    return (
      <span className={`${cls} avatar-fallback`} aria-hidden="true">
        {letter}
      </span>
    );
  }

  return (
    <img
      className={cls}
      src={url}
      alt={alt || ""}
      onError={() => setBroken(true)}
    />
  );
}
