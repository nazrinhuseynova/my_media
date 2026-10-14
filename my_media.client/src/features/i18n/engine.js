import { LANGUAGE_CODES } from "./languages";

const KEY = "pulse_lang";
const CACHE_KEY = "pulse_tr";
const SOURCE = "az";
const ATTRS = ["placeholder", "aria-label", "title"];
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE"]);

const memory = loadCache();
const textSource = new WeakMap();
const attrSource = new WeakMap();
let target = readCode();
let generation = 0;
let observer = null;
let pending = new Set();
let chain = Promise.resolve();
let blocked = false;
const failed = new Set();

function readCode() {
  try {
    const saved = localStorage.getItem(KEY);
    return LANGUAGE_CODES.includes(saved) ? saved : SOURCE;
  } catch {
    return SOURCE;
  }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memory));
  } catch {
    return;
  }
}

function pairKey(lang, text) {
  return lang + "\n" + text;
}

function knownTranslation(source, value) {
  return LANGUAGE_CODES.some((lang) => memory[pairKey(lang, source)] === value);
}

function meaningful(text) {
  if (!text || text.length < 2) return false;
  if (!/\p{L}/u.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(text)) return false;
  if (/^@[\w.]+$/.test(text)) return false;
  if (/^#[\p{L}\p{N}_]+$/u.test(text)) return false;
  return true;
}

function bytes(text) {
  return new TextEncoder().encode(text).length;
}

function kept(node) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  return Boolean(el?.closest?.("[data-keep]"));
}

function rememberText(node, core) {
  const prev = textSource.get(node);
  if (!prev || prev === core) {
    textSource.set(node, prev || core);
    return prev || core;
  }
  if (knownTranslation(prev, core)) return prev;
  textSource.set(node, core);
  return core;
}

function rememberAttr(el, attr, value) {
  let bag = attrSource.get(el);
  if (!bag) {
    bag = {};
    attrSource.set(el, bag);
  }
  const prev = bag[attr];
  if (!prev || prev === value) {
    bag[attr] = prev || value;
    return prev || value;
  }
  if (knownTranslation(prev, value)) return prev;
  bag[attr] = value;
  return value;
}

function paint(source) {
  if (target === SOURCE) return source;
  return memory[pairKey(target, source)] || "";
}

function visitText(node) {
  if (!node || node.nodeType !== 3 || target === SOURCE) return;
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName) || kept(node)) return;
  const editable = parent.closest("[contenteditable='true']");
  if (editable && document.activeElement && editable.contains(document.activeElement)) return;
  const raw = node.nodeValue || "";
  const lead = (raw.match(/^\s*/) || [""])[0];
  const tail = (raw.match(/\s*$/) || [""])[0];
  const core = raw.slice(lead.length, raw.length - tail.length).replace(/\s+/g, " ").trim();
  if (!meaningful(core)) return;
  const source = rememberText(node, core);
  const translated = paint(source);
  if (translated) {
    const next = lead + translated + tail;
    if (node.nodeValue !== next) node.nodeValue = next;
    return;
  }
  if (failed.has(target + "\n" + source)) return;
  pending.add(source);
}

function visitAttr(el, attr) {
  if (!el || el.nodeType !== 1 || target === SOURCE || !ATTRS.includes(attr)) return;
  if (SKIP.has(el.tagName) || kept(el)) return;
  const current = el.getAttribute(attr) || "";
  const core = current.replace(/\s+/g, " ").trim();
  if (!meaningful(core)) return;
  const source = rememberAttr(el, attr, core);
  const translated = paint(source);
  if (translated) {
    if (el.getAttribute(attr) !== translated) el.setAttribute(attr, translated);
    return;
  }
  if (failed.has(target + "\n" + source)) return;
  pending.add(source);
}

function visitNode(node) {
  if (!node || target === SOURCE) return;
  if (node.nodeType === 3) {
    visitText(node);
    return;
  }
  if (node.nodeType !== 1 || kept(node)) return;
  ATTRS.forEach((attr) => {
    if (node.hasAttribute(attr)) visitAttr(node, attr);
  });
  node.childNodes.forEach(visitNode);
}

function applyTree(root) {
  if (!root || target === SOURCE) return;
  visitNode(root);
}

function takeBatch() {
  const items = [...pending].sort((a, b) => a.length - b.length);
  const batch = [];
  let size = 0;
  for (const item of items) {
    const extra = bytes(item) + (batch.length ? 1 : 0);
    if (!batch.length && bytes(item) > 420) {
      batch.push(item);
      break;
    }
    if (batch.length >= 10 || (batch.length && size + extra > 420)) break;
    batch.push(item);
    size += extra;
  }
  batch.forEach((item) => pending.delete(item));
  return batch;
}

async function request(parts, lang) {
  if (!parts.length) return [];
  if (parts.length === 1 && bytes(parts[0]) > 420) {
    const pieces = splitLong(parts[0]);
    const translated = [];
    for (const piece of pieces) {
      const row = await request([piece], lang);
      if (!row) return null;
      translated.push(row[0]);
    }
    return [translated.join(" ")];
  }
  const payload = parts.join("\n");
  if (parts.length > 1 && bytes(payload) > 420) {
    const mid = Math.ceil(parts.length / 2);
    const left = await request(parts.slice(0, mid), lang);
    const right = await request(parts.slice(mid), lang);
    if (!left || !right) return null;
    return left.concat(right);
  }
  try {
    const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(payload) + "&langpair=" + encodeURIComponent(SOURCE + "|" + lang);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.responseData?.translatedText || "";
    if (data?.quotaFinished || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(text)) {
      blocked = true;
      pending.clear();
      return null;
    }
    if (/INVALID LANGUAGE PAIR/i.test(text) || data?.responseStatus === 400) return parts.map(() => "");
    const lines = String(text).split("\n");
    if (lines.length !== parts.length) {
      if (parts.length === 1) return null;
      const mid = Math.ceil(parts.length / 2);
      const left = await request(parts.slice(0, mid), lang);
      const right = await request(parts.slice(mid), lang);
      if (!left || !right) return null;
      return left.concat(right);
    }
    return lines;
  } catch {
    return null;
  }
}

function splitLong(text) {
  const parts = [];
  let buf = "";
  text.split(" ").forEach((word) => {
    const next = buf ? buf + " " + word : word;
    if (buf && bytes(next) > 400) {
      parts.push(buf);
      buf = word;
      return;
    }
    buf = next;
  });
  if (buf) parts.push(buf);
  return parts.length ? parts : [text.slice(0, 400)];
}

async function drain(max) {
  let count = 0;
  while (pending.size && !blocked && count < max) {
    const gen = generation;
    const lang = target;
    const batch = takeBatch();
    if (!batch.length) return;
    const lines = await request(batch, lang);
    if (gen !== generation) return;
    if (lines) {
      batch.forEach((part, index) => {
        const line = String(lines[index] || "").trim();
        if (line && !/MYMEMORY WARNING/i.test(line)) memory[pairKey(lang, part)] = line;
        else failed.add(lang + "\n" + part);
      });
      persist();
      applyTree(document.body);
    } else {
      batch.forEach((part) => failed.add(lang + "\n" + part));
    }
    count += 1;
  }
  if (pending.size && !blocked) chain = chain.then(() => drain(8));
}

function pump() {
  chain = chain.then(() => drain(4)).catch(() => {});
  return chain;
}

function watch() {
  if (observer || !document.body) return;
  observer = new MutationObserver((records) => {
    if (target === SOURCE) return;
    records.forEach((rec) => {
      if (rec.type === "characterData") visitText(rec.target);
      else if (rec.type === "attributes") visitAttr(rec.target, rec.attributeName);
      else rec.addedNodes.forEach(visitNode);
    });
    if (pending.size) pump();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

export function currentLanguage() {
  return target;
}

export function boot() {
  document.documentElement.lang = target;
  if (target === SOURCE || !document.body) return;
  watch();
  applyTree(document.body);
  pump();
}

export function chooseLanguage(code) {
  const next = LANGUAGE_CODES.includes(code) ? code : SOURCE;
  if (next === target) return Promise.resolve();
  generation += 1;
  target = next;
  blocked = false;
  failed.clear();
  pending = new Set();
  try {
    localStorage.setItem(KEY, next);
  } catch {
    return Promise.resolve();
  }
  document.documentElement.lang = next;
  if (next === SOURCE) {
    window.location.reload();
    return new Promise(() => {});
  }
  watch();
  applyTree(document.body);
  return pump();
}
