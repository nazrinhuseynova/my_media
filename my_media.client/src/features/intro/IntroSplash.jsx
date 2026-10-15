import { useEffect, useRef } from "react";

const PHASES = [
  ["write", 3200],
  ["enter", 4800],
  ["look-left", 1100],
  ["look-right", 1100],
  ["look-center", 550],
  ["leave", 4800],
  ["welcome", 1800],
];

export default function IntroSplash({ onDone }) {
  const rootRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const root = rootRef.current;
    let step = 0;
    let timer = 0;

    function advance() {
      if (!root) return;
      if (step >= PHASES.length) {
        root.dataset.phase = "end";
        timer = window.setTimeout(() => doneRef.current(), 420);
        return;
      }
      root.dataset.phase = PHASES[step][0];
      timer = window.setTimeout(() => {
        step += 1;
        advance();
      }, PHASES[step][1]);
    }

    advance();
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="intro" ref={rootRef} data-phase="write">
      <div className="intro-glow" />
      <div className="intro-lockup">
      <p className="intro-word" aria-label="Pulse" data-keep>
        {"Pulse".split("").map((letter, index) => (
          <span key={letter} className="intro-letter" style={{ animationDelay: `${0.28 + index * 0.48}s` }}>{letter}</span>
        ))}
      </p>
      <p className="intro-welcome" data-keep>Welcome</p>
      </div>
      <div className="intro-mover" aria-hidden="true">
        <span className="intro-shadow" />
        <div className="intro-spin">
          <div className="intro-face">
            <span className="intro-eye"><i className="intro-pupil" /></span>
            <span className="intro-eye"><i className="intro-pupil" /></span>
            <span className="intro-smile" />
          </div>
        </div>
      </div>
    </div>
  );
}
