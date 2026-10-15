import { MUSIC_TRACKS as STORY_TRACKS } from "../../utils/upload";

export const NOTE_TRACKS = [
  ...STORY_TRACKS.map((t, i) => ({
    id: `pulse-${i}`,
    title: t.name,
    artist: "Pulse Audio",
    mood: "pulse",
    url: t.url,
  })),
  { id: "t1", title: "Blinding Lights", artist: "The Weeknd", mood: "energetic" },
  { id: "t2", title: "As It Was", artist: "Harry Styles", mood: "chill" },
  { id: "t3", title: "Levitating", artist: "Dua Lipa", mood: "dance" },
  { id: "t4", title: "Save Your Tears", artist: "The Weeknd", mood: "sad" },
  { id: "t5", title: "good 4 u", artist: "Olivia Rodrigo", mood: "pop" },
  { id: "t6", title: "Stay", artist: "The Kid LAROI & Justin Bieber", mood: "pop" },
  { id: "t7", title: "Heat Waves", artist: "Glass Animals", mood: "chill" },
  { id: "t8", title: "Industry Baby", artist: "Lil Nas X", mood: "hype" },
  { id: "t9", title: "Peaches", artist: "Justin Bieber", mood: "soft" },
  { id: "t10", title: "Anti-Hero", artist: "Taylor Swift", mood: "pop" },
  { id: "t11", title: "Flowers", artist: "Miley Cyrus", mood: "empower" },
  { id: "t12", title: "Espresso", artist: "Sabrina Carpenter", mood: "fun" },
  { id: "t13", title: "Calm Down", artist: "Rema & Selena Gomez", mood: "afrobeats" },
  { id: "t14", title: "Apt.", artist: "ROSÉ & Bruno Mars", mood: "party" },
  { id: "t15", title: "Die With A Smile", artist: "Lady Gaga & Bruno Mars", mood: "ballad" },
  { id: "t16", title: "Yaxşıyam", artist: "Azerbaijani vibe", mood: "local" },
  { id: "t17", title: "Bakı gecələri", artist: "Pulse Mix", mood: "local" },
];

export const NOTE_PLACES = [
  "Bakı, Azərbaycan",
  "İçərişəhər",
  "Flame Towers",
  "Heydər Əliyev Mərkəzi",
  "Boulevard / Dənizkənarı",
  "28 Mall",
  "Port Baku",
  "Gəncə",
  "Sumqayıt",
  "Şəki",
  "Qəbələ",
  "İstanbul",
  "Dubai Mall",
  "Times Square, New York",
  "Shibuya, Tokyo",
  "Café / Coffee",
  "Ev",
  "İş / Ofis",
  "Universitet",
  "Gym",
];

export const NOTE_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇",
  "🙂", "😉", "😍", "🥰", "😘", "😗", "😋", "😜", "🤪", "😎",
  "🤩", "🥳", "😏", "😢", "😭", "😤", "😠", "🤯", "😳", "🥺",
  "😴", "🤗", "🤔", "🫡", "🤫", "🤭", "🙄", "😬", "🫠", "💀",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
  "💕", "💞", "🔥", "✨", "⭐", "🌟", "💫", "🎉", "🎊", "🎈",
  "👍", "👎", "👏", "🙌", "🤝", "💪", "✌️", "🤞", "🤙", "👌",
  "🎵", "🎶", "🎧", "🎤", "🎸", "☕", "🍕", "🎂", "🏠", "✈️",
  "🌍", "🌙", "☀️", "🌈", "🌸", "🍀", "🐱", "🐶", "🦄", "👻",
];

export const NOTE_STICKERS = [
  { id: "s1", label: "Love", face: "🥰", pack: "mood" },
  { id: "s2", label: "Fire", face: "🔥", pack: "mood" },
  { id: "s3", label: "Cry", face: "😭", pack: "mood" },
  { id: "s4", label: "Lol", face: "🤣", pack: "mood" },
  { id: "s5", label: "Cool", face: "😎", pack: "mood" },
  { id: "s6", label: "Shock", face: "🤯", pack: "mood" },
  { id: "s7", label: "Sleep", face: "😴", pack: "mood" },
  { id: "s8", label: "Party", face: "🥳", pack: "mood" },
  { id: "s9", label: "Heart", face: "❤️", pack: "react" },
  { id: "s10", label: "100", face: "💯", pack: "react" },
  { id: "s11", label: "OK", face: "👌", pack: "react" },
  { id: "s12", label: "Clap", face: "👏", pack: "react" },
  { id: "s13", label: "Strong", face: "💪", pack: "react" },
  { id: "s14", label: "Pray", face: "🙏", pack: "react" },
  { id: "s15", label: "Wave", face: "👋", pack: "react" },
  { id: "s16", label: "Kiss", face: "😘", pack: "react" },
  { id: "s17", label: "Music", face: "🎧", pack: "life" },
  { id: "s18", label: "Coffee", face: "☕", pack: "life" },
  { id: "s19", label: "Food", face: "🍕", pack: "life" },
  { id: "s20", label: "Travel", face: "✈️", pack: "life" },
  { id: "s21", label: "Home", face: "🏠", pack: "life" },
  { id: "s22", label: "Work", face: "💼", pack: "life" },
  { id: "s23", label: "Gym", face: "🏋️", pack: "life" },
  { id: "s24", label: "Night", face: "🌙", pack: "life" },
];

export function formatTrack(track) {
  return `${track.title} — ${track.artist}`;
}
