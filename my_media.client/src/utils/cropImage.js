export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!src.startsWith("blob:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function cropImage(src, crop, filter, brightness, contrast) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const size = 1080;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  let sx = (crop.x / 100) * image.width;
  let sy = (crop.y / 100) * image.height;
  let sw = (crop.size / 100) * image.width;
  let sh = (crop.size / 100) * image.height;
  sx = Math.max(0, Math.min(sx, image.width - 1));
  sy = Math.max(0, Math.min(sy, image.height - 1));
  sw = Math.max(1, Math.min(sw, image.width - sx));
  sh = Math.max(1, Math.min(sh, image.height - sy));
  ctx.filter = `${cssFilter(filter)} brightness(${brightness}%) contrast(${contrast}%)`;
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function cssFilter(name) {
  const map = {
    none: "none",
    clarendon: "contrast(1.2) saturate(1.35)",
    gingham: "brightness(1.05) hue-rotate(-10deg)",
    moon: "grayscale(1) contrast(1.1) brightness(1.1)",
    lark: "contrast(0.9) saturate(1.2) brightness(1.08)",
    reyes: "sepia(0.22) brightness(1.1)",
    juno: "contrast(1.15) saturate(1.4) hue-rotate(-8deg)",
    warm: "sepia(0.25) saturate(1.2)",
    cool: "hue-rotate(15deg) saturate(1.1)",
  };
  return map[name] || "none";
}
