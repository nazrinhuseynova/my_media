import { useEffect, useState } from "react";
import { useAppStore } from "../../../stores/useAppStore";
import { useStoryStore } from "../store/useStoryStore";
import { useAuthStore } from "../../auth/store/useAuthStore";
import StoryViewer from "./StoryViewer";

export default function StoryBar() {
  const groups = useStoryStore((s) => s.groups);
  const load = useStoryStore((s) => s.load);
  const me = useAuthStore((s) => s.user);
  const setStoryOpen = useAppStore((s) => s.setStoryOpen);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    load();
  }, [load]);

  const mine = groups.find((g) => g.user?.id && g.user.id === me?.id) || null;
  const others = groups.filter((g) => g.user?.id && g.user.id !== me?.id);
  const viewerGroups = mine ? [mine, ...others] : others;

  return (
    <>
      <div className="story-row" data-tour="stories">
        <div className="story-own">
          <button className="story-item" onClick={() => (mine ? setActiveIndex(0) : setStoryOpen(true))}>
            <div className={`story-ring ${mine?.seen ? "seen" : ""}`}>
              <img className="avatar" src={me?.avatar || ""} alt="" style={{ width: 62, height: 62 }} />
            </div>
            Sənin hekayən
          </button>
          <button type="button" className="story-add" onClick={() => setStoryOpen(true)} aria-label="Hekayə əlavə et">+</button>
        </div>
        {others.map((g, i) => (
          <button key={g.user.id} className="story-item" onClick={() => setActiveIndex(mine ? i + 1 : i)}>
            <div className={`story-ring ${g.seen ? "seen" : ""}`}>
              <img className="avatar" src={g.user.avatar} alt="" style={{ width: 62, height: 62 }} />
            </div>
            {g.user.username}
          </button>
        ))}
      </div>
      {activeIndex >= 0 ? (
        <StoryViewer
          groups={viewerGroups}
          startIndex={activeIndex}
          onClose={() => {
            setActiveIndex(-1);
            load();
          }}
        />
      ) : null}
    </>
  );
}
