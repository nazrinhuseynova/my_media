import http from "../lib/axios";

export const API_ORIGIN = (process.env.REACT_APP_API_URL || "http://localhost:5017").replace(/\/$/, "");

export function mediaSrc(url) {
  if (!url) return "";
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function uploadFile(file, kind) {
  const form = new FormData();
  form.append("file", file);
  const path = kind === "video" ? "/api/files/video" : kind === "audio" ? "/api/files/audio" : "/api/files/image";
  const { data } = await http.post(path, form, { timeout: 120000 });
  return { url: data.url, extension: data.extension || "" };
}

export function dataUrlToFile(dataUrl, filename) {
  const [meta, b64] = dataUrl.split(",");
  const mime = (meta.match(/:(.*?);/) || [, "image/jpeg"])[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

export function parseMusic(value) {
  if (!value) return { name: "", url: "" };
  const i = String(value).indexOf("||");
  if (i === -1) return { name: value, url: "" };
  return { name: value.slice(0, i), url: value.slice(i + 2) };
}

export const MUSIC_TRACKS = [
  { name: "Sunset Beat", url: "https://res.cloudinary.com/twv3frfo/video/upload/v1791500504/pulse/audio/sunset.wav" },
  { name: "Night Drive", url: "https://res.cloudinary.com/twv3frfo/video/upload/v1791500506/pulse/audio/night.wav" },
  { name: "City Lights", url: "https://res.cloudinary.com/twv3frfo/video/upload/v1791500507/pulse/audio/city.wav" },
];

export function resolveMusic(value) {
  const parsed = parseMusic(value);
  if (parsed.url) return parsed;
  const track = MUSIC_TRACKS.find((t) => t.name === parsed.name);
  return track || parsed;
}
