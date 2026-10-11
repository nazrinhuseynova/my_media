import { useEffect, useRef, useState } from "react";

export function useDebounce(value, delay) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function useIntersection(onHit) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) onHit();
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, [onHit]);
  return ref;
}

export function useMediaQuery(query) {
  const [match, setMatch] = useState(window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setMatch(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, [query]);
  return match;
}
