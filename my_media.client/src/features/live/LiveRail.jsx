import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import Avatar from "../../components/ui/Avatar";

export default function LiveRail() {
  const [rooms, setRooms] = useState([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.get("/api/lives")
      .then((list) => setRooms(Array.isArray(list) ? list : []))
      .catch(() => setRooms([]))
      .finally(() => setReady(true));
  }, []);

  return (
    <section className="live-strip feed-pad">
      <h2 className="feed-kicker">Canlı</h2>
      {!ready ? null : rooms.length === 0 ? (
        <div className="live-empty">
          <span className="live-orb" aria-hidden="true" />
          <div>
            <strong>İndi heç kim canlıda deyil</strong>
            <p>Yayım başlayanda profillər burada görünəcək. Eyni yayımda olanlar yan-yana duracaq.</p>
          </div>
        </div>
      ) : (
        <div className="live-row">
          {rooms.map((room) => {
            const people = room.people || [];
            const duo = people.length > 1;
            return (
              <button key={room.id} type="button" className="live-card" onClick={() => setOpen(room)}>
                <span className={duo ? "live-pair" : "live-ring"}>
                  {people.slice(0, 2).map((person) => (
                    <Avatar key={person.id} src={person.avatar} alt={person.username} />
                  ))}
                </span>
                <span className="live-pill">Canlı</span>
                <span className="live-names">{people.map((person) => person.fullName || person.username).join("  ·  ")}</span>
              </button>
            );
          })}
        </div>
      )}
      {open ? (
        <div className="live-stage" role="dialog" aria-label={open.title || "Canlı yayım"}>
          <button type="button" className="live-stage-back" onClick={() => setOpen(null)}>Bağla</button>
          <div className="live-stage-card">
            <span className="live-pill">Canlı</span>
            <div className={(open.people || []).length > 1 ? "live-pair live-pair-lg" : "live-ring live-ring-lg"}>
              {(open.people || []).slice(0, 2).map((person) => (
                <Avatar key={person.id} src={person.avatar} alt={person.username} />
              ))}
            </div>
            <h3>{open.title || "Canlı yayım"}</h3>
            <div className="live-stage-people">
              {(open.people || []).map((person) => (
                <Link key={person.id} to={`/profile/${person.username}`} onClick={() => setOpen(null)}>
                  <Avatar src={person.avatar} alt={person.username} />
                  <span>
                    <strong>{person.fullName || person.username}</strong>
                    <small>@{person.username}</small>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
