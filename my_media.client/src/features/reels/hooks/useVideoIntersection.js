import { useEffect, useRef, useState } from "react";

export function useVideoIntersection() {
  const ref = useRef(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const obs = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0.7 });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);
  return { ref, active };
}
