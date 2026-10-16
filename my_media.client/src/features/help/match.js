import { ENTRIES, chipsOf } from "./knowledge";

function fold(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function answerFor(text) {
  const asked = fold(text);
  if (!asked) return null;
  let best = null;
  let score = 0;
  ENTRIES.forEach((entry) => {
    let points = 0;
    entry.keys.forEach((key) => {
      const folded = fold(key);
      if (!folded) return;
      if (asked === folded) points += 8;
      else if (asked.includes(folded)) points += folded.includes(" ") ? 4 : 2;
      else if (folded.includes(asked) && asked.length > 3) points += 1;
    });
    if (points > score) {
      score = points;
      best = entry;
    }
  });
  if (!best || score < 2) {
    return {
      text: "Bunu dəqiq tuta bilmədim. Şikayət, ayar, paylaşım, mesaj və hesab haqqında soruşa bilərsən.",
      chips: chipsOf(["report", "settings", "post", "direct", "safety", "start"]),
    };
  }
  return {
    text: best.text,
    to: best.to || "",
    linkLabel: best.linkLabel || "",
    chips: chipsOf(best.next || []),
    live: best.live || "",
  };
}

export function reportStatusLine(row) {
  const kind = {
    post: "post",
    reel: "reel",
    comment: "şərh",
    story: "hekayə",
    user: "hesab",
  }[row.targetType] || row.targetType;
  const state = {
    open: "növbədədir",
    dismissed: "rədd edildi — pozuntu tapılmadı",
    remove: "uyğunsuz kontent götürüldü",
    ban: "hesab məhdudlaşdırıldı",
  }[row.status] || row.status;
  return `• ${kind}: ${state}`;
}

export function formatReportStatus(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return "Hələ göndərilmiş şikayətin yoxdur. Kontentin yanındakı «Şikayət» ilə göndərə bilərsən. Qərar gələndə Bildirişlərdə görünəcək.";
  }
  const lines = list.slice(0, 8).map(reportStatusLine);
  const open = list.filter((row) => row.status === "open").length;
  const head = open > 0
    ? `${list.length} şikayətin var, ${open} nəzarət növbəsindədir.`
    : `${list.length} şikayətin var; hamısına baxılıb.`;
  return `${head}\n${lines.join("\n")}\nƏtraflı qərar mətni Bildirişlərdədir.`;
}
