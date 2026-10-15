const KEY = "pulse_tour_v1";
const FRESH_MS = 15 * 60 * 1000;

export const TOUR_SHEET = "pulse-tour-sheet";

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      pending: raw?.pending && typeof raw.pending === "object" ? raw.pending : {},
      done: raw?.done && typeof raw.done === "object" ? raw.done : {},
    };
  } catch {
    return { pending: {}, done: {} };
  }
}

function write(bag) {
  localStorage.setItem(KEY, JSON.stringify(bag));
}

export function armTour(user) {
  const id = user?.id;
  if (!id || user.role === "admin") return;
  const bag = read();
  if (bag.done[id]) return;
  bag.pending[id] = 1;
  write(bag);
}

export function armIfFresh(user) {
  const created = Date.parse(user?.createdAt || "");
  if (!created || Number.isNaN(created)) return;
  if (Date.now() - created > FRESH_MS) return;
  armTour(user);
}

export function tourPending(user) {
  const id = user?.id;
  if (!id || user.role === "admin" || !user.language) return false;
  const bag = read();
  return Boolean(bag.pending[id]) && !bag.done[id];
}

export function finishTour(id) {
  if (!id) return;
  const bag = read();
  delete bag.pending[id];
  bag.done[id] = 1;
  write(bag);
}

export function setTourSheet(open) {
  window.dispatchEvent(new CustomEvent(TOUR_SHEET, { detail: Boolean(open) }));
}
