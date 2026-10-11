const paths = {
  home: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5z",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm10 2-4.35-4.35",
  explore: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-1.2-8.8 5.7-2.3-2.3 5.7-5.7 2.3 2.3-5.7z",
  reels: "M4 5h16v14H4V5zm3 0 4 5h2l4-5M8 13h8",
  messenger: "M12 3C6.5 3 2 7.1 2 12.2 2 15 3.2 17.4 5.2 19l-.7 3.8 4-2.1c1.1.3 2.3.5 3.5.5 5.5 0 10-4.1 10-9.2S17.5 3 12 3z",
  heart: "M12.1 20.3C7 16.2 3.5 13.1 3.5 9.2 3.5 6.5 5.6 4.5 8.2 4.5c1.5 0 2.9.7 3.8 1.8.9-1.1 2.3-1.8 3.8-1.8 2.6 0 4.7 2 4.7 4.7 0 3.9-3.5 7-8.4 11.1z",
  plus: "M12 5v14M5 12h14",
  user: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z",
  bookmark: "M7 4h10a1 1 0 0 1 1 1v16l-6-3-6 3V5a1 1 0 0 1 1-1z",
  comment: "M5 5h14v11H8l-3 3V5z",
  share: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  settings: "M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7zM4 12l2-1.2.4-2.2 2.2-.4L10 6h4l1.4 2.2 2.2.4.4 2.2L20 12l-2 1.2-.4 2.2-2.2.4L14 18h-4l-1.4-2.2-2.2-.4-.4-2.2L4 12z",
  camera: "M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0M12 18v3M8 21h8",
  back: "M15 19 8 12l7-7",
  next: "M9 5l7 7-7 7",
  down: "M12 4v14M6 12l6 6 6-6",
  theme: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
};

export default function Icon({ name, filled, size = 24 }) {
  const d = paths[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled && name === "heart" ? "var(--like)" : filled ? "currentColor" : "none"}
      stroke={filled && name === "heart" ? "var(--like)" : "currentColor"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
