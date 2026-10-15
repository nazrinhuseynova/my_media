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

function startTone(root) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();
  let started = false;

  function begin() {
    if (started || ctx.state !== "running") return;
    started = true;
    if (root) root.dataset.tone = "on";
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.07, now + 0.45);
    master.gain.setValueAtTime(0.07, now + 9.2);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 12.2);
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(196, now);
    osc.frequency.exponentialRampToValueAtTime(494, now + 10.4);

    const roll = ctx.createOscillator();
    roll.type = "sine";
    roll.frequency.value = 5;
    const rollGain = ctx.createGain();
    rollGain.gain.value = 14;
    roll.connect(rollGain);
    rollGain.connect(osc.frequency);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(1600, now + 10);
    osc.connect(filter);
    filter.connect(master);
    osc.start(now);
    roll.start(now);
    osc.stop(now + 12.4);
    roll.stop(now + 12.4);
  }

  function unlock() {
    ctx.resume().then(begin).catch(() => {});
  }

  ctx._unlock = unlock;
  if (root) root.dataset.tone = ctx.state === "running" ? "on" : "wait";
  if (ctx.state === "running") begin();
  else {
    ctx.resume().then(begin).catch(() => {});
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }
  return ctx;
}

export default function IntroSplash({ onDone }) {
  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const root = rootRef.current;
    let step = 0;
    let timer = 0;
    audioRef.current = startTone(root);

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
      const ctx = audioRef.current;
      if (ctx?._unlock) {
        window.removeEventListener("pointerdown", ctx._unlock);
        window.removeEventListener("keydown", ctx._unlock);
      }
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
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
