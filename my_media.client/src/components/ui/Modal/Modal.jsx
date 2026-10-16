export default function Modal({ title, open, onClose, children, from = "center", soft = false }) {
  if (!open) return null;
  const sheet = from === "bottom";
  return (
    <div
      className={`modal-back${sheet ? " modal-back-sheet" : ""}${soft ? " modal-back-soft" : ""}`}
      onClick={onClose}
    >
      <div className={`modal${sheet ? " modal-sheet" : ""}`} onClick={(e) => e.stopPropagation()}>
        {title ? <h3>{title}</h3> : null}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
