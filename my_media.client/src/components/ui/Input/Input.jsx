export default function Input({ label, error, ...props }) {
  return (
    <label className="field">
      {label ? <span>{label}</span> : null}
      <input {...props} />
      {error ? <span className="error-text">{error}</span> : null}
    </label>
  );
}
