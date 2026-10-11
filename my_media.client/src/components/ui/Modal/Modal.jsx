export default function Modal({ title, open, onClose, children, from = "center" }) {
  if (!open) return null;
  const sheet = from === "bottom";
  return (
    <div className={`modal-back${sheet ? " modal-back-sheet" : ""}`} onClick={onClose}>
      <div className={`modal${sheet ? " modal-sheet" : ""}`} onClick={(e) => e.stopPropagation()}>
        {title ? <h3>{title}</h3> : null}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
