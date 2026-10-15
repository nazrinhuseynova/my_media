import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuthStore } from "../auth/store/useAuthStore";
import { finishTour, setTourSheet, tourPending } from "./tourFlag";

const STEPS = [
  {
    id: "home",
    title: "Ana səhifə",
    points: [
      ["Nə üçündür", "İzlədiyin insanların yeni postları və təklifləri bu lentdə toplanır."],
      ["Necə işlədilir", "Düyməyə bas, harada olsan da lentin əvvəlinə qayıt."],
      ["Niyə lazımdır", "Günün paylaşımını bir yerdə görmək üçün əsas ekrandır."],
    ],
  },
  {
    id: "stories",
    title: "Hekayələr",
    points: [
      ["Nə üçündür", "24 saatlıq qısa şəkil və videodur. Postlardan ayrı, lentin yuxarısında durur."],
      ["Necə işlədilir", "Öz dairənə basıb hekayə əlavə et. Başqasının dairəsinə basıb bax."],
      ["Niyə lazımdır", "Tam post yazmadan anı tez göstərmək üçündür."],
    ],
  },
  {
    id: "composer",
    title: "Paylaşım sətri",
    points: [
      ["Nə üçündür", "Lentdəki bu sətir yeni postun pəncərəsini açır."],
      ["Necə işlədilir", "Sətirə bas, şəkil və ya video seç, mətni yaz və göndər."],
      ["Niyə lazımdır", "Fikir gələndə paylaşımı bir toxunuşla başlamaq üçündür."],
    ],
  },
  {
    id: "suggestions",
    title: "Təkliflər",
    points: [
      ["Nə üçündür", "Hələ izləmədiyin insanları sənin üçün seçib göstərir."],
      ["Necə işlədilir", "İzlə düyməsinə bas. Hesab gizlidirsə əvvəl sorğu gedir."],
      ["Niyə lazımdır", "Lentin boş qalmaması və yeni insan tapmaq üçündür."],
    ],
  },
  {
    id: "share",
    title: "Paylaş",
    points: [
      ["Nə üçündür", "Yuxarıdakı düymə yeni post pəncərəsini açır."],
      ["Necə işlədilir", "Paylaşa bas, faylı seç, yazını əlavə et və göndər."],
      ["Niyə lazımdır", "Paylaşımı səhifənin istənilən yerindən tez başlamaq üçündür."],
    ],
  },
  {
    id: "search",
    title: "Axtarış",
    points: [
      ["Nə üçündür", "İnsanı, postu və sözü ad ilə tapır."],
      ["Necə işlədilir", "Axtarışa keç, adı və ya sözü yaz, nəticəni aç."],
      ["Niyə lazımdır", "Tanıdığını və ya konkret mövzunu itirməmək üçündür."],
    ],
  },
  {
    id: "reels",
    title: "Reels",
    points: [
      ["Nə üçündür", "Tam ekran qısa videolardır. Biri bitəndə növbətisi açılır."],
      ["Necə işlədilir", "Reels-ə keç, videonu izlə, bəyən və ya şərh yaz. Öz videonu da həmin səhifədən yükləyə bilərsən."],
      ["Niyə lazımdır", "Qısa video ilə diqqət çəkmək üçündür."],
    ],
  },
  {
    id: "create",
    title: "Yarat",
    points: [
      ["Nə üçündür", "Menyudakı yeni post düyməsidir. Paylaş ilə eyni pəncərəni açır."],
      ["Necə işlədilir", "Yarata bas, şəkli və ya videonu seç, mətni yaz və göndər."],
      ["Niyə lazımdır", "Paylaşımı yan menyudan başlamaq üçündür."],
    ],
  },
  {
    id: "profile",
    title: "Profil",
    points: [
      ["Nə üçündür", "Adın, şəkilin, postların və izləyici sayın burada görünür."],
      ["Necə işlədilir", "Profilə bas, bio və şəkli dəyiş, öz postlarını aç."],
      ["Niyə lazımdır", "İnsanların səni tanıdığı səhifədir."],
    ],
  },
  {
    id: "explore",
    title: "Kəşf et",
    points: [
      ["Nə üçündür", "İzləmədiklərin arasından yeni və diqqət çəkən paylaşımları göstərir."],
      ["Necə işlədilir", "Kəşf et düyməsinə bas, bəyəndiyin posta və ya profilə keç."],
      ["Niyə lazımdır", "Lentdən kənar yeni insan və mövzu tapmaq üçündür."],
    ],
  },
  {
    id: "direct",
    title: "Mesajlar",
    points: [
      ["Nə üçündür", "İnsanlarla şəxsi yazışma yeridir. Postun altındakı şərhdən ayrıdır."],
      ["Necə işlədilir", "Mesajlara keç, söhbəti seç və ya yeni yazışma başlat."],
      ["Niyə lazımdır", "Yalnız bir nəfərin görməli olduğu sözü göndərmək üçündür."],
    ],
  },
  {
    id: "notifications",
    title: "Bildirişlər",
    points: [
      ["Nə üçündür", "Bəyənmə, şərh, izləmə və mesaj xəbərlərini toplayır. Oxunmamış olanda nöqtə çıxır."],
      ["Necə işlədilir", "Bildirişlərə keç, sətirə basıb həmin posta və ya profilə get."],
      ["Niyə lazımdır", "Paylaşımına gələn reaksiyanı qaçırmamaq üçündür."],
    ],
  },
  {
    id: "saved",
    title: "Saxlanılanlar",
    points: [
      ["Nə üçündür", "Sonra yenidən baxmaq istədiyin postların yeridir."],
      ["Necə işlədilir", "Postdakı əlfəcinə bas, sonra Saxlanılanlara keç."],
      ["Niyə lazımdır", "Lentdən düşən faydalı paylaşımı itirməmək üçündür."],
    ],
  },
  {
    id: "settings",
    title: "Ayarlar",
    points: [
      ["Nə üçündür", "Hesab, məxfilik, bildiriş və profil seçimlərini dəyişirsən."],
      ["Necə işlədilir", "Ayarlara keç, sətri aç, seçimi saxla."],
      ["Niyə lazımdır", "Hesabın sənin istədiyin kimi işləməsi üçündür."],
    ],
  },
  {
    id: "theme",
    title: "Tema",
    points: [
      ["Nə üçündür", "Ekranı açıq və ya qaranlıq rəngə keçirir."],
      ["Necə işlədilir", "Düyməyə bir dəfə bas, tema dərhal dəyişir."],
      ["Niyə lazımdır", "Gözünə rahat olan işığı seçmək üçündür."],
    ],
  },
  {
    id: "language",
    title: "Dil",
    points: [
      ["Nə üçündür", "Bütün yazıları seçdiyin dilə çevirir. Bu izah da həmin dildə görünür."],
      ["Necə işlədilir", "Dil düyməsinə bas, siyahıdan dili seç."],
      ["Niyə lazımdır", "Tətbiqi öz dilində oxumaq üçündür."],
    ],
  },
  {
    id: "accounts",
    title: "Hesablar",
    points: [
      ["Nə üçündür", "Bu cihazda bir neçə hesabı saxlayır və aralarında keçid edir."],
      ["Necə işlədilir", "Hesablara bas, siyahıdan hesabı seç və ya yenisini əlavə et."],
      ["Niyə lazımdır", "Çıxış etmədən başqa hesaba keçmək üçündür."],
    ],
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function frames(count) {
  return new Promise((resolve) => {
    function step(left) {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    }
    step(count);
  });
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
}

function findTour(id, mode) {
  const visible = [...document.querySelectorAll(`[data-tour="${id}"]`)].filter(isVisible);
  if (mode === "sidebar") return visible.find((el) => el.closest(".sidebar")) || null;
  if (mode === "plain") return visible.find((el) => !el.closest(".more-sheet")) || null;
  return visible.find((el) => el.closest(".sidebar"))
    || visible.find((el) => !el.closest(".more-sheet"))
    || visible[0]
    || null;
}

async function reveal(id) {
  const side = findTour(id, "sidebar");
  if (side) {
    if (document.querySelector(".more-sheet")) setTourSheet(false);
    return side;
  }
  const plain = findTour(id, "plain");
  if (plain) {
    if (document.querySelector(".more-sheet")) {
      setTourSheet(false);
      await frames(2);
      return findTour(id, "plain");
    }
    return plain;
  }
  setTourSheet(true);
  await frames(3);
  return findTour(id, "any");
}

function dwellFromChars(chars) {
  const extra = Math.max(0, chars - 90);
  return Math.min(24000, 5000 + extra * 42);
}

function sourceDwell(step) {
  const text = [step.title, ...step.points.flat()].join(" ");
  return dwellFromChars([...text].length);
}

function boxOf(rect) {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  };
}

function clipToViewport(rect) {
  const left = Math.max(8, rect.left);
  const top = Math.max(8, rect.top);
  const right = Math.min(window.innerWidth - 8, rect.right);
  const bottom = Math.min(window.innerHeight - 8, rect.bottom);
  if (right - left < 8 || bottom - top < 8) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function fitInside(el, selector) {
  const clip = el.getBoundingClientRect();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  el.querySelectorAll(selector).forEach((node) => {
    const r = node.getBoundingClientRect();
    const l = Math.max(r.left, clip.left);
    const t = Math.max(r.top, clip.top);
    const rr = Math.min(r.right, clip.right);
    const b = Math.min(r.bottom, clip.bottom);
    if (rr - l < 4 || b - t < 4) return;
    left = Math.min(left, l);
    top = Math.min(top, t);
    right = Math.max(right, rr);
    bottom = Math.max(bottom, b);
  });
  if (!(right > left) || !(bottom > top)) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function readRect(el) {
  const id = el.getAttribute("data-tour");
  const fitted = id === "stories"
    ? fitInside(el, ".story-item, .story-add")
    : id === "suggestions"
      ? fitInside(el, ".suggest-card")
      : null;
  const rect = clipToViewport(fitted || boxOf(el.getBoundingClientRect()));
  if (!rect) return null;
  const raw = parseFloat(getComputedStyle(el).borderTopLeftRadius);
  rect.radius = fitted ? 18 : (Number.isFinite(raw) ? raw : 16);
  return rect;
}

function inflate(rect, pad) {
  return {
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    right: rect.right + pad,
    bottom: rect.bottom + pad,
  };
}

function borderPoint(rect, tx, ty, outset) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = tx - cx;
  let dy = ty - cy;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) dx = 1;
  const hx = Math.max(rect.width / 2, 1);
  const hy = Math.max(rect.height / 2, 1);
  const scale = Math.max(Math.abs(dx) / hx, Math.abs(dy) / hy);
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: cx + dx / scale + (dx / len) * outset,
    y: cy + dy / scale + (dy / len) * outset,
  };
}

function connector(card, target) {
  const start = borderPoint(card, target.left + target.width / 2, target.top + target.height / 2, 0);
  const end = borderPoint(target, card.left + card.width / 2, card.top + card.height / 2, 12);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(48, len * 0.2);
  const cx = (start.x + end.x) / 2 + (-dy / len) * bend;
  const cy = (start.y + end.y) / 2 + (dx / len) * bend;
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

function overlapArea(box, target, width, height) {
  const a = { left: box.left, top: box.top, right: box.left + width, bottom: box.top + height };
  const b = {
    left: target.left - 10,
    top: target.top - 10,
    right: target.right + 10,
    bottom: target.bottom + 10,
  };
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

function placeCard(target, width, height) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 14;
  const gap = 28;
  const raw = [
    { left: target.right + gap, top: target.top + target.height / 2 - height / 2 },
    { left: target.left - gap - width, top: target.top + target.height / 2 - height / 2 },
    { left: target.left + target.width / 2 - width / 2, top: target.top - gap - height },
    { left: target.left + target.width / 2 - width / 2, top: target.bottom + gap },
  ].map((item) => ({
    left: clamp(item.left, pad, Math.max(pad, vw - width - pad)),
    top: clamp(item.top, pad, Math.max(pad, vh - height - pad)),
  }));
  raw.sort((a, b) => overlapArea(a, target, width, height) - overlapArea(b, target, width, height));
  const box = raw[0];
  const card = { left: box.left, top: box.top, width, height, right: box.left + width, bottom: box.top + height };
  const spot = inflate(target, 8);
  spot.radius = Math.min(999, (target.radius || 16) + 8);
  return { left: box.left, top: box.top, path: connector(card, spot), vw, vh, spot };
}

function TourCard({ step, index, seconds, ms, onNext, onStop, cardRef, style, placed, labelled }) {
  return (
    <article ref={cardRef} className={placed ? "tour-card is-placed" : "tour-card"} style={style}>
      <div className="tour-kicker">
        <span>Addım <span data-keep>{index + 1} / {STEPS.length}</span></span>
        <span data-keep>{seconds}s</span>
      </div>
      <h2 id={labelled ? "tour-title" : undefined}>{step.title}</h2>
      <div data-tour-copy>
        {step.points.map(([label, text]) => (
          <div className="tour-point" key={label}>
            <b>{label}</b>
            <p>{text}</p>
          </div>
        ))}
      </div>
      <div className="tour-meter" aria-hidden="true">
        {ms > 0 ? <i key={`${step.id}-${ms}`} style={{ animationDuration: `${ms}ms` }} /> : null}
      </div>
      <div className="tour-actions">
        <button type="button" className="tour-next" onClick={onNext}>Keç</button>
        <button type="button" className="tour-stop" onClick={onStop}>Turu bitir</button>
      </div>
      <p className="tour-hint">Enter növbəti izaha keçir</p>
    </article>
  );
}

export default function FeatureTour() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const [stopped, setStopped] = useState(false);
  const [live, setLive] = useState(false);
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState(null);
  const [frame, setFrame] = useState(null);
  const [ready, setReady] = useState(false);
  const [ms, setMs] = useState(0);
  const [left, setLeft] = useState(0);
  const bubbleRef = useRef(null);
  const readyRef = useRef(false);
  const idRef = useRef(userId);
  const [kept, setKept] = useState(null);
  const pending = !stopped && tourPending(user);
  const step = STEPS[index];
  const aligned = Boolean(ready && step && anchor?.id === step.id && frame);

  useEffect(() => {
    idRef.current = userId;
    readyRef.current = aligned;
  }, [userId, aligned]);

  useEffect(() => {
    if (!pending) return undefined;
    let stop = false;
    let timer = 0;
    function tick() {
      if (stop) return;
      if (document.querySelector(".intro")) {
        timer = window.setTimeout(tick, 200);
        return;
      }
      timer = window.setTimeout(() => {
        if (!stop) setLive(true);
      }, 480);
    }
    tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [pending, userId]);

  useEffect(() => {
    if (!live) return undefined;
    const nodes = [...document.querySelectorAll(".app-shell > :not(.tour)")];
    nodes.forEach((node) => node.setAttribute("inert", ""));
    function block(event) {
      const target = event.target;
      if (target instanceof Element && target.closest(".tour-card")) return;
      event.preventDefault();
    }
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    return () => {
      nodes.forEach((node) => node.removeAttribute("inert"));
      window.removeEventListener("wheel", block);
      window.removeEventListener("touchmove", block);
      setTourSheet(false);
    };
  }, [live]);

  function finish() {
    finishTour(idRef.current);
    setTourSheet(false);
    setStopped(true);
    setLive(false);
    setReady(false);
  }

  function advance() {
    setReady(false);
    setFrame(null);
    setMs(0);
    setIndex((value) => value + 1);
  }

  useEffect(() => {
    if (!live) return undefined;
    let cancel = false;
    async function locate() {
      setReady(false);
      setFrame(null);
      setMs(0);
      if (index >= STEPS.length) {
        finish();
        return;
      }
      const current = STEPS[index];
      let el = null;
      for (let attempt = 0; attempt < 3 && !el; attempt += 1) {
        if (attempt) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          if (cancel) return;
        }
        el = await reveal(current.id);
        if (cancel) return;
      }
      if (!el) {
        setIndex((value) => value + 1);
        return;
      }
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      await frames(2);
      if (cancel) return;
      const rect = readRect(el);
      if (!rect) {
        setIndex((value) => value + 1);
        return;
      }
      setAnchor({ ...rect, id: current.id });
      setReady(true);
    }
    locate();
    return () => {
      cancel = true;
    };
  }, [live, index]);

  useEffect(() => {
    if (!ready || !anchor?.id) return undefined;
    const id = anchor.id;
    function measure() {
      const el = findTour(id, "any");
      if (!el) return;
      const rect = readRect(el);
      if (!rect) return;
      setAnchor({ ...rect, id });
    }
    const el = findTour(id, "any");
    const watch = new ResizeObserver(measure);
    if (el) watch.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [ready, anchor?.id]);

  useLayoutEffect(() => {
    const node = bubbleRef.current;
    if (!ready || !anchor || !node) return undefined;
    const apply = () => {
      const next = placeCard(anchor, node.offsetWidth, node.offsetHeight);
      const snap = {
        step: STEPS.find((item) => item.id === anchor.id),
        shown: next,
        index: STEPS.findIndex((item) => item.id === anchor.id),
      };
      setFrame((prev) => {
        if (!prev) return next;
        const same = Math.abs(prev.left - next.left) < 1
          && Math.abs(prev.top - next.top) < 1
          && prev.path === next.path
          && prev.vw === next.vw
          && prev.vh === next.vh;
        return same ? prev : next;
      });
      setKept((prev) => {
        if (!snap.step) return prev;
        if (prev && prev.step.id === snap.step.id && prev.shown.path === next.path && Math.abs(prev.shown.left - next.left) < 1 && Math.abs(prev.shown.top - next.top) < 1) return prev;
        return snap;
      });
    };
    apply();
    const watch = new ResizeObserver(apply);
    watch.observe(node);
    return () => watch.disconnect();
  }, [ready, anchor]);

  useEffect(() => {
    if (!aligned || !step) return undefined;
    let timer = 0;
    let clock = 0;
    let current = sourceDwell(step);
    const started = performance.now();
    const ends = { at: started + current };
    function paintLeft() {
      setLeft(Math.max(0, ends.at - performance.now()));
    }
    function schedule(total) {
      window.clearTimeout(timer);
      ends.at = started + total;
      const remain = Math.max(280, ends.at - performance.now());
      timer = window.setTimeout(() => setIndex((value) => value + 1), remain);
      setMs(total);
      paintLeft();
    }
    schedule(current);
    clock = window.setInterval(paintLeft, 200);
    const copy = bubbleRef.current?.querySelector("[data-tour-copy]");
    const watch = new MutationObserver(() => {
      const chars = [...(copy?.innerText || "")].length;
      const next = dwellFromChars(chars);
      if (next > current + 350) {
        current = next;
        schedule(current);
      }
    });
    if (copy) watch.observe(copy, { subtree: true, characterData: true, childList: true });
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(clock);
      watch.disconnect();
    };
  }, [aligned, index, step]);

  useEffect(() => {
    if (!live) return undefined;
    function onKey(event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === " " || event.key === "PageDown" || event.key === "PageUp") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Enter" || event.repeat) return;
      event.preventDefault();
      if (!readyRef.current) return;
      setReady(false);
      setFrame(null);
      setMs(0);
      setIndex((value) => value + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live]);

  if (!live) return null;

  const placed = Boolean(step && ready && anchor?.id === step.id);
  const shown = placed ? frame : null;
  const view = shown && step ? { step, shown, index } : kept;
  const spot = view?.shown.spot;
  const seconds = Math.max(1, Math.ceil(left / 1000));
  const hiddenStyle = { left: 0, top: 0, visibility: "hidden", pointerEvents: "none" };

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className={view ? "tour-dim" : "tour-dim tour-dim-plain"} />
      {spot ? <div className="tour-hole" style={{ left: spot.left, top: spot.top, width: spot.width, height: spot.height, borderRadius: spot.radius }} /> : null}
      {view?.shown.path ? (
        <svg className="tour-ink" width={view.shown.vw} height={view.shown.vh} aria-hidden="true">
          <defs>
            <marker id="pulse-tour-head" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
              <path d="M1.2 1.2 L10.5 6 L1.2 10.8 Z" />
            </marker>
          </defs>
          <path key={view.step.id} d={view.shown.path} pathLength="1" markerEnd="url(#pulse-tour-head)" />
        </svg>
      ) : null}
      {!shown && kept ? (
        <TourCard
          step={kept.step}
          index={kept.index}
          seconds={seconds}
          ms={ms}
          onNext={advance}
          onStop={finish}
          placed
          labelled={false}
          style={{ left: kept.shown.left, top: kept.shown.top }}
        />
      ) : null}
      {step ? (
        <TourCard
          key={step.id}
          cardRef={bubbleRef}
          step={step}
          index={index}
          seconds={seconds}
          ms={shown ? ms : 0}
          onNext={advance}
          onStop={finish}
          placed={Boolean(shown)}
          labelled
          style={shown ? { left: shown.left, top: shown.top } : hiddenStyle}
        />
      ) : null}
    </div>
  );
}
