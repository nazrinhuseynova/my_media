export function asUtc(iso) {
  if (!iso) return null;
  const text = String(iso);
  const hasZone = /Z|[+-]\d\d:?\d\d$/.test(text);
  return new Date(hasZone ? text : `${text}Z`);
}

export function isFuture(iso) {
  const date = asUtc(iso);
  return !!date && !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

export function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "indi";
  if (min < 60) return `${min} dəq`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} saat`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} gün`;
  return date.toLocaleDateString("az-AZ");
}

export function formatCount(n) {
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(1)} min`;
  return `${(n / 1000000).toFixed(1)} mln`;
}
