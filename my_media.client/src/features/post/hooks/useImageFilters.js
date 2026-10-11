import { useState } from "react";

export function useImageFilters() {
  const [filter, setFilter] = useState("none");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  return { filter, setFilter, brightness, setBrightness, contrast, setContrast };
}
