import { useEffect, useState } from "react";

export function useOTPTimer(start) {
  const [seconds, setSeconds] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  return seconds;
}
