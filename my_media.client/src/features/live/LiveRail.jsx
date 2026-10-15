import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as signalR from "@microsoft/signalr";
import { api } from "../../services/api";
import Avatar from "../../components/ui/Avatar";
import { useAuthStore } from "../auth/store/useAuthStore";
import { notify } from "../../stores/useNoticeStore";
import { ExpressionButton, insertAtCursor } from "../expression/ExpressionPicker";

const API = (process.env.REACT_APP_API_URL || "http://localhost:5017").replace(/\/$/, "");
const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

function Tile({ stream, label, muted }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream || null;
  }, [stream]);
  return (
    <div className="live-tile">
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span>{label}</span>
    </div>
  );
}

function LiveStage({ room, onClose, onRefresh }) {
  const me = useAuthStore((s) => s.user);
  const [detail, setDetail] = useState(room);
  const [localStream, setLocalStream] = useState(null);
  const [remotes, setRemotes] = useState([]);
  const [chats, setChats] = useState([]);
  const [chatText, setChatText] = useState("");
  const hubRef = useRef(null);
  const peersRef = useRef(new Map());
  const localRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    let dead = false;
    async function boot() {
      try {
        const data = await api.get(`/api/lives/${room.id}`);
        if (dead) return;
        setDetail(data);
        if (!data.inRoom) {
          await api.post(`/api/lives/${room.id}/join`);
          const next = await api.get(`/api/lives/${room.id}`);
          if (!dead) setDetail(next);
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (dead) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localRef.current = stream;
        setLocalStream(stream);

        const hub = new signalR.HubConnectionBuilder()
          .withUrl(`${API}/hubs/live`, { accessTokenFactory: () => localStorage.getItem("pulse_token") || "" })
          .withAutomaticReconnect()
          .build();
        hubRef.current = hub;

        async function callPeer(connectionId) {
          if (!connectionId || peersRef.current.has(connectionId)) return;
          const pc = new RTCPeerConnection({ iceServers: ICE });
          peersRef.current.set(connectionId, pc);
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          pc.onicecandidate = (ev) => {
            if (ev.candidate) {
              hub.invoke("Signal", room.id, connectionId, "ice", JSON.stringify(ev.candidate)).catch(() => {});
            }
          };
          pc.ontrack = (ev) => {
            const media = ev.streams[0];
            setRemotes((list) => {
              if (list.some((row) => row.id === connectionId)) return list;
              return [...list, { id: connectionId, stream: media }];
            });
          };
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await hub.invoke("Signal", room.id, connectionId, "offer", JSON.stringify(offer));
        }

        hub.on("livePeerJoined", (payload) => {
          if (payload?.connectionId) callPeer(payload.connectionId);
        });

        hub.on("livePeerLeft", (payload) => {
          const id = payload?.connectionId;
          const pc = peersRef.current.get(id);
          if (pc) {
            pc.close();
            peersRef.current.delete(id);
          }
          setRemotes((list) => list.filter((row) => row.id !== id));
        });

        hub.on("liveChat", (payload) => {
          if (!payload?.text) return;
          setChats((list) => [...list.slice(-80), payload]);
        });

        hub.on("liveSignal", async (payload) => {
          const from = payload?.fromConnectionId;
          if (!from || from === hub.connectionId) return;
          let pc = peersRef.current.get(from);
          if (!pc) {
            pc = new RTCPeerConnection({ iceServers: ICE });
            peersRef.current.set(from, pc);
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
            pc.onicecandidate = (ev) => {
              if (ev.candidate) {
                hub.invoke("Signal", room.id, from, "ice", JSON.stringify(ev.candidate)).catch(() => {});
              }
            };
            pc.ontrack = (ev) => {
              const media = ev.streams[0];
              setRemotes((list) => {
                if (list.some((row) => row.id === from)) return list;
                return [...list, { id: from, stream: media }];
              });
            };
          }
          try {
            const data = JSON.parse(payload.payload || "{}");
            if (payload.kind === "offer") {
              await pc.setRemoteDescription(data);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await hub.invoke("Signal", room.id, from, "answer", JSON.stringify(answer));
            } else if (payload.kind === "answer") {
              await pc.setRemoteDescription(data);
            } else if (payload.kind === "ice") {
              await pc.addIceCandidate(data);
            }
          } catch {
            /* ignore bad signal */
          }
        });

        await hub.start();
        await hub.invoke("JoinLive", room.id);
      } catch (err) {
        notify(err?.response?.data?.message || "Canlıya qoşulmaq olmadı", true);
        onClose();
      }
    }
    boot();
    return () => {
      dead = true;
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      localRef.current?.getTracks().forEach((t) => t.stop());
      const hub = hubRef.current;
      if (hub) {
        hub.invoke("LeaveLive", room.id).catch(() => {});
        hub.stop().catch(() => {});
      }
    };
  }, [room.id, onClose]);

  async function leave() {
    try {
      if (detail?.isHost) await api.post(`/api/lives/${room.id}/end`);
      else await api.post(`/api/lives/${room.id}/leave`);
    } catch {
      /* ignore */
    }
    onRefresh?.();
    onClose();
  }

  const people = detail?.people || room.people || [];

  async function sendChat(e) {
    e?.preventDefault?.();
    const body = chatText.trim();
    if (!body || !hubRef.current) return;
    try {
      await hubRef.current.invoke("Chat", room.id, body);
      setChatText("");
    } catch {
      notify("Şərh getmədi", true);
    }
  }

  return (
    <div className="live-stage" role="dialog" aria-label={detail?.title || "Canlı yayım"}>
      <button type="button" className="live-stage-back" onClick={leave}>Bitir</button>
      <div className="live-stage-card live-stage-av">
        <span className="live-pill">Canlı · {1 + remotes.length}/4</span>
        <h3>{detail?.title || room.title || "Canlı yayım"}</h3>
        <div className={`live-grid live-grid-${Math.min(4, 1 + remotes.length)}`}>
          <Tile stream={localStream} label={me?.username || "Sən"} muted />
          {remotes.map((row) => (
            <Tile key={row.id} stream={row.stream} label="Qonaq" />
          ))}
        </div>
        <div className="live-chat">
          <div className="live-chat-list">
            {chats.length === 0 ? <p className="muted">Canlı şərhlər burada görünəcək</p> : null}
            {chats.map((row, i) => (
              <p key={`${row.at}-${i}`}>
                <strong>{String(row.userId) === String(me?.id) ? "Sən" : "İzləyici"}</strong> {row.text}
              </p>
            ))}
          </div>
          <form className="live-chat-form" onSubmit={sendChat}>
            <ExpressionButton
              onPick={(payload) => {
                if (payload.kind === "emoji" || payload.kind === "sticker") {
                  insertAtCursor(chatInputRef, payload.text, chatText, setChatText);
                  return;
                }
                const stamp = payload.kind === "music" ? `♫ ${payload.text}` : `⌖ ${payload.text}`;
                insertAtCursor(chatInputRef, (chatText && !chatText.endsWith(" ") ? " " : "") + stamp, chatText, setChatText);
              }}
            />
            <input
              ref={chatInputRef}
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Şərh yaz..."
              maxLength={280}
            />
            <button type="submit">Göndər</button>
          </form>
        </div>
        <div className="live-stage-people">
          {people.map((person) => (
            <Link key={person.id} to={`/profile/${person.username}`} onClick={leave}>
              <Avatar src={person.avatar} alt={person.username} />
              <span>
                <strong>{person.fullName || person.username}</strong>
                <small>@{person.username}{person.host ? " · host" : ""}</small>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LiveRail() {
  const [rooms, setRooms] = useState([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    return api.get("/api/lives")
      .then((list) => setRooms(Array.isArray(list) ? list : []))
      .catch(() => setRooms([]))
      .finally(() => setReady(true));
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 20000);
    return () => window.clearInterval(timer);
  }, []);

  async function startLive() {
    setBusy(true);
    try {
      const room = await api.post("/api/lives", { title: title.trim() || "Canlı" });
      setTitle("");
      await refresh();
      setOpen({ id: room.id, title: room.title, people: [] });
    } catch (err) {
      notify(err?.response?.data?.message || "Yayım başlamadı", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="live-strip feed-pad">
      <div className="live-strip-head">
        <h2 className="feed-kicker">Canlı</h2>
        <div className="live-start">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Yayım adı"
            maxLength={80}
          />
          <button type="button" disabled={busy} onClick={startLive}>Canlıya çıx</button>
        </div>
      </div>
      {!ready ? null : rooms.length === 0 ? (
        <div className="live-empty">
          <span className="live-orb" aria-hidden="true" />
          <div>
            <strong>İndi heç kim canlıda deyil</strong>
            <p>Yayım başlat — eyni yayımda ən çox 4 nəfər ola bilər (TikTok guest kimi).</p>
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
                <span className="live-pill">Canlı · {people.length}</span>
                <span className="live-names">{people.map((person) => person.fullName || person.username).join("  ·  ")}</span>
              </button>
            );
          })}
        </div>
      )}
      {open ? (
        <LiveStage
          room={open}
          onClose={() => setOpen(null)}
          onRefresh={refresh}
        />
      ) : null}
    </section>
  );
}
