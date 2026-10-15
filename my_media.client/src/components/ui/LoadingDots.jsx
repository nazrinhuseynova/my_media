/** Peşəkar yüklənmə — yazı yox, sıçrayan nöqtələr */
export default function LoadingDots({ label = "Yüklənir", className = "" }) {
  return (
    <div className={`loading-dots${className ? ` ${className}` : ""}`} role="status" aria-live="polite" aria-label={label}>
      <span />
      <span />
      <span />
    </div>
  );
}
