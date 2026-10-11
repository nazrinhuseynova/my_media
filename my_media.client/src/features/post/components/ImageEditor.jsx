export default function ImageEditor({ src, filter, brightness, contrast }) {
  return (
    <img
      src={src}
      alt=""
      className={`filter-${filter}`}
      style={{ width: "100%", filter: `brightness(${brightness}%) contrast(${contrast}%)` }}
    />
  );
}
