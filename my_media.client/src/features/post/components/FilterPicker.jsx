const FILTERS = ["none", "clarendon", "gingham", "moon", "lark", "reyes", "juno"];

export default function FilterPicker({ value, onChange }) {
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      {FILTERS.map((f) => (
        <button key={f} className={`btn ${value === f ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => onChange(f)}>
          {f}
        </button>
      ))}
    </div>
  );
}
