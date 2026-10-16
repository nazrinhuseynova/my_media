import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import * as signalR from "@microsoft/signalr";
import { api } from "../../services/api";
import Avatar from "../../components/ui/Avatar";
import Icon from "../../components/ui/Icon";
import { useAuthStore } from "../auth/store/useAuthStore";
import { notify } from "../../stores/useNoticeStore";
import { ExpressionButton, insertAtCursor } from "../expression/ExpressionPicker";
import { onSocket } from "../../lib/socket";

const API = (process.env.REACT_APP_API_URL || "http://localhost:5017").replace(/\/$/, "");
const ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const AUDIO = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
};

const VIDEO_TRIES = [
  {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    facingMode: { ideal: "user" },
  },
  {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
    facingMode: { ideal: "user" },
  },
  {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  true,
];

const FLOAT_MAX = 7;
const FLOAT_TEXT_MAX = 48;
const CHAT_MAX = 80;

function clipText(text, max = FLOAT_TEXT_MAX) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

async function sharpenTracks(stream) {
  const video = stream.getVideoTracks()[0];
  if (video) {
    try { video.contentHint = "detail"; } catch { /* ignore */ }
    try {
      await video.applyConstraints({
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      });
    } catch { /* ignore */ }
  }
  const audio = stream.getAudioTracks()[0];
  if (audio) {
    try { audio.contentHint = "speech"; } catch { /* ignore */ }
    try {
      await audio.applyConstraints({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: { ideal: 48000 },
      });
    } catch { /* ignore */ }
  }
}

async function openCamera() {
  let lastErr;
  for (const video of VIDEO_TRIES) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: AUDIO });
      await sharpenTracks(stream);
      return stream;
    } catch (err) {
      lastErr = err;
    }
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    await sharpenTracks(stream);
    return stream;
  } catch (err) {
    throw lastErr || err;
  }
}

async function boostSender(pc) {
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      if (sender.track.kind === "video") {
        params.encodings[0].maxBitrate = 3_500_000;
        params.encodings[0].maxFramerate = 30;
        params.encodings[0].scaleResolutionDownBy = 1;
        if ("degradationPreference" in params) params.degradationPreference = "maintain-resolution";
        try { sender.track.contentHint = "detail"; } catch { /* ignore */ }
      } else {
        params.encodings[0].maxBitrate = 192_000;
        try { sender.track.contentHint = "speech"; } catch { /* ignore */ }
      }
      await sender.setParameters(params);
    } catch {
      /* brauzer dəstəkləməyə bilər */
    }
  }
}

function Tile({ stream, label, muted, mirror, showLabel }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream || null;
    if (!stream) return;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.disablePictureInPicture = true;
    const play = () => { el.play?.().catch(() => {}); };
    if (el.readyState >= 1) play();
    else el.addEventListener("loadedmetadata", play, { once: true });
    return () => el.removeEventListener("loadedmetadata", play);
  }, [stream]);
  return (
    <div className="live-tile">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={mirror ? "is-mirror" : ""}
      />
      {showLabel && label ? <span>{label}</span> : null}
    </div>
  );
}

function LiveStage({ room, onClose, onRefresh }) {
  const me = useAuthStore((s) => s.user);
  const [detail, setDetail] = useState(room);
  const [localStream, setLocalStream] = useState(null);
  const [remotes, setRemotes] = useState([]);
  const [floats, setFloats] = useState([]);
  const [hearts, setHearts] = useState([]);
  const [viewers, setViewers] = useState([]);
  const [chatText, setChatText] = useState("");
  const [likes, setLikes] = useState(room.likeCount || 0);
  const [invite, setInvite] = useState(null);
  const [busySeat, setBusySeat] = useState(false);
  const [ready, setReady] = useState(false);
  const [requests, setRequests] = useState([]);
  const [requested, setRequested] = useState(false);
  const [chatMuted, setChatMuted] = useState(false);
  const [modBusy, setModBusy] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [invitePicker, setInvitePicker] = useState(false);
  const [inviteFriends, setInviteFriends] = useState([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const hubRef = useRef(null);
  const peersRef = useRef(new Map());
  const localRef = useRef(null);
  const chatInputRef = useRef(null);
  const namesRef = useRef(new Map());
  const onCloseRef = useRef(onClose);
  const onRefreshRef = useRef(onRefresh);
  const meRef = useRef(me);
  const endedRef = useRef(false);
  const likeBusyRef = useRef(false);
  const holdLikeRef = useRef(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { meRef.current = me; }, [me]);
  useEffect(() => () => {
    if (holdLikeRef.current) window.clearInterval(holdLikeRef.current);
  }, []);

  // Overlay feed scroll-undan ayrı — body-yə portal + scroll kilidi
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.classList.add("live-open");
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
      document.documentElement.classList.remove("live-open");
    };
  }, []);

  const maxSeats = detail?.maxSeats || room.maxSeats || 1;
  const people = detail?.people || room.people || [];
  const hostId = (people.find((p) => p.host) || people[0])?.id;
  // Yalnız aparıcı Bitir görür — room.isHost-a etibar etmə (izləyici səhvən Bitir görməsin)
  const isHost = !!(me?.id && hostId && String(me.id) === String(hostId));

  function pushFloat(row) {
    if (!row?.text && !row?.body) return;
    const key = `${Date.now()}-${Math.random()}`;
    const raw = row.text || row.body || "";
    const item = {
      key,
      kind: row.kind || "chat",
      username: clipText(row.username || "", 14),
      text: clipText(raw, row.kind === "chat" || !row.kind ? FLOAT_TEXT_MAX : 36),
      self: String(row.userId) === String(meRef.current?.id),
    };
    // TikTok: max 7 — yeni gələnlər qədər ən köhnələr düşür
    setFloats((list) => [...list, item].slice(-FLOAT_MAX));
  }

  function burstHeart(username) {
    const key = `${Date.now()}-${Math.random()}`;
    const left = 12 + Math.random() * 28;
    setHearts((list) => [...list.slice(-12), { key, left, username: username || "" }]);
    window.setTimeout(() => {
      setHearts((list) => list.filter((h) => h.key !== key));
    }, 1600);
  }

  function rememberName(userId, username) {
    if (userId && username) namesRef.current.set(String(userId), username);
  }

  function labelFor(connectionId, userId) {
    const self = meRef.current;
    if (userId && String(userId) === String(self?.id)) return self?.username || "Sən";
    return namesRef.current.get(String(userId)) || namesRef.current.get(String(connectionId)) || "İzləyici";
  }

  function dropPeer(id) {
    const pc = peersRef.current.get(id);
    if (pc) {
      pc.close();
      peersRef.current.delete(id);
    }
    setRemotes((list) => list.filter((row) => row.id !== id));
  }

  function closeStage(message) {
    if (endedRef.current) return;
    endedRef.current = true;
    if (message) notify(message);
    onRefreshRef.current?.();
    onCloseRef.current?.();
  }

  async function ensureLocalMedia() {
    if (localRef.current) return localRef.current;
    const stream = await openCamera();
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  }

  function stopLocalMedia() {
    const stream = localRef.current;
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
  }

  async function refreshDetail() {
    try {
      const data = await api.get(`/api/lives/${room.id}`);
      setDetail((prev) => ({
        ...prev,
        ...data,
        isHost: !!data.isHost,
        inSeat: !!data.inSeat,
      }));
      setLikes(data.likeCount || 0);
      setViewers(Array.isArray(data.viewers) ? data.viewers : []);
      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setRequested(!!data.requested);
      setChatMuted(!!data.muted);
      (data.people || []).forEach((p) => rememberName(p.id, p.username));
      return data;
    } catch (err) {
      if (err?.response?.status === 404) closeStage("Yayım bitdi");
      return null;
    }
  }

  function dropPeersByUser(userId) {
    if (!userId) return;
    setRemotes((list) => {
      list.forEach((row) => {
        if (String(row.userId) !== String(userId)) return;
        const pc = peersRef.current.get(row.id);
        if (pc) {
          pc.close();
          peersRef.current.delete(row.id);
        }
      });
      return list.filter((row) => String(row.userId) !== String(userId));
    });
  }

  useEffect(() => {
    let dead = false;
    let ownedStream = null;
    let ownedHub = null;
    const roomId = room.id;

    async function boot() {
      try {
        let data = await api.get(`/api/lives/${roomId}`);
        if (dead) return;

        const self = meRef.current;
        const apiHost = !!data.isHost;
        const onSeat = !!(data.inSeat || apiHost);
        setDetail({
          ...data,
          isHost: apiHost,
          inSeat: onSeat,
          people: (data.people && data.people.length)
            ? data.people
            : (apiHost && self ? [{
              id: self.id,
              username: self.username,
              fullName: self.fullName,
              avatar: self.avatar,
              host: true,
            }] : data.people || []),
        });
        setLikes(data.likeCount || 0);
        setViewers(Array.isArray(data.viewers) ? data.viewers : []);
        setRequests(Array.isArray(data.requests) ? data.requests : []);
        setRequested(!!data.requested);
        setChatMuted(!!data.muted);
        (data.people || []).forEach((p) => rememberName(p.id, p.username));

        if (!onSeat) {
          await api.post(`/api/lives/${roomId}/watch`);
          if (dead) return;
          data = await api.get(`/api/lives/${roomId}`);
          if (dead) return;
          setDetail((prev) => ({ ...prev, ...data, isHost: !!data.isHost, inSeat: !!data.inSeat }));
          setViewers(Array.isArray(data.viewers) ? data.viewers : []);
        }

        if (onSeat || data.isHost) {
          try {
            ownedStream = await openCamera();
            if (dead) {
              ownedStream.getTracks().forEach((t) => t.stop());
              return;
            }
            localRef.current = ownedStream;
            setLocalStream(ownedStream);
          } catch {
            if (!dead) notify("Kamera və mikrofon icazəsi lazımdır", true);
            if (!dead) onCloseRef.current?.();
            return;
          }
        }

        const hub = new signalR.HubConnectionBuilder()
          .withUrl(`${API}/hubs/live`, { accessTokenFactory: () => localStorage.getItem("pulse_token") || "" })
          .withAutomaticReconnect()
          .build();
        ownedHub = hub;
        hubRef.current = hub;

        async function callPeer(connectionId, userId) {
          if (!connectionId || peersRef.current.has(connectionId)) return;
          const media = localRef.current;
          if (!media) return;
          const pc = new RTCPeerConnection({ iceServers: ICE });
          peersRef.current.set(connectionId, pc);
          media.getTracks().forEach((track) => pc.addTrack(track, media));
          pc.onicecandidate = (ev) => {
            if (ev.candidate) {
              hub.invoke("Signal", roomId, connectionId, "ice", JSON.stringify(ev.candidate)).catch(() => {});
            }
          };
          pc.ontrack = (ev) => {
            const remote = ev.streams[0];
            setRemotes((list) => {
              if (list.some((row) => row.id === connectionId)) return list;
              return [...list, { id: connectionId, userId, stream: remote }];
            });
          };
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await pc.setLocalDescription(offer);
          await boostSender(pc);
          await hub.invoke("Signal", roomId, connectionId, "offer", JSON.stringify(offer));
        }

        async function answerPeer(from, kind, raw, fromUserId) {
          let pc = peersRef.current.get(from);
          if (!pc) {
            pc = new RTCPeerConnection({ iceServers: ICE });
            peersRef.current.set(from, pc);
            const media = localRef.current;
            if (media) media.getTracks().forEach((track) => pc.addTrack(track, media));
            pc.onicecandidate = (ev) => {
              if (ev.candidate) {
                hub.invoke("Signal", roomId, from, "ice", JSON.stringify(ev.candidate)).catch(() => {});
              }
            };
            pc.ontrack = (ev) => {
              const remote = ev.streams[0];
              setRemotes((list) => {
                if (list.some((row) => row.id === from)) return list;
                return [...list, { id: from, userId: fromUserId, stream: remote }];
              });
            };
          }
          try {
            const parsed = JSON.parse(raw || "{}");
            if (kind === "offer") {
              await pc.setRemoteDescription(parsed);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await boostSender(pc);
              await hub.invoke("Signal", roomId, from, "answer", JSON.stringify(answer));
            } else if (kind === "answer") {
              await pc.setRemoteDescription(parsed);
              await boostSender(pc);
            } else if (kind === "ice") {
              await pc.addIceCandidate(parsed);
            }
          } catch {
            /* ignore */
          }
        }

        hub.on("livePeerJoined", (payload) => {
          if (payload?.username) rememberName(payload.userId, payload.username);
          if (payload?.connectionId) rememberName(payload.connectionId, payload.username);
          if (localRef.current && payload?.connectionId) callPeer(payload.connectionId, payload.userId);
        });

        hub.on("livePeerPromoted", (payload) => {
          if (payload?.username) rememberName(payload.userId, payload.username);
          if (payload?.connectionId) {
            dropPeer(payload.connectionId);
            if (localRef.current) callPeer(payload.connectionId, payload.userId);
          }
          refreshDetail();
        });

        hub.on("livePeerLeft", (payload) => {
          if (payload?.connectionId) dropPeer(payload.connectionId);
        });

        hub.on("liveChat", (payload) => {
          if (!payload?.text) return;
          if (payload.username) rememberName(payload.userId, payload.username);
          pushFloat({
            kind: "chat",
            userId: payload.userId,
            username: payload.username,
            text: payload.text,
          });
        });

        hub.on("liveActivity", (payload) => {
          if (!payload?.text) return;
          pushFloat({
            kind: payload.kind || "info",
            userId: payload.userId,
            username: payload.username,
            text: payload.text,
          });
        });

        hub.on("liveViewers", (payload) => {
          if (Array.isArray(payload?.viewers)) setViewers(payload.viewers);
        });

        hub.on("liveViewerJoined", (payload) => {
          if (payload?.username) rememberName(payload.userId, payload.username);
        });

        hub.on("liveLiked", (payload) => {
          if (typeof payload?.likeCount === "number") setLikes(payload.likeCount);
          if (!payload?.already && String(payload?.userId) !== String(meRef.current?.id)) {
            burstHeart(payload.username);
          }
        });

        hub.on("liveLikeDenied", (payload) => {
          notify(payload?.message || "Öz yayınını bəyənə bilməzsən", true);
        });

        hub.on("liveInvite", (payload) => {
          if (String(payload?.roomId) !== String(roomId)) return;
          const target = payload?.targetUserId;
          if (target && String(target) !== String(meRef.current?.id)) return;
          setInvite(payload);
        });

        hub.on("liveInviteFailed", (payload) => {
          notify(payload?.message || "Dəvət alınmadı", true);
        });

        hub.on("liveInviteAccepted", (payload) => {
          if (String(payload?.roomId) !== String(roomId)) return;
          refreshDetail();
          if (String(payload?.userId) !== String(meRef.current?.id)) {
            notify(`@${payload?.username || "İstifadəçi"} dəvəti qəbul etdi`);
          }
        });

        hub.on("liveInviteRejected", (payload) => {
          if (String(payload?.roomId) !== String(roomId)) return;
          if (String(payload?.userId) !== String(meRef.current?.id)) {
            notify(`@${payload?.username || "İstifadəçi"} dəvəti rədd etdi`, true);
          }
        });

        hub.on("liveEnded", () => {
          closeStage("Yayım bitdi");
        });

        hub.on("liveKicked", (payload) => {
          if (payload?.roomId && String(payload.roomId) !== String(roomId)) return;
          if (payload?.userId && String(payload.userId) !== String(meRef.current?.id)) return;
          const reason = payload?.reason === "block" ? "Bloklandın — yayımı tərk etdin" : "Yayımdan çıxarıldın";
          closeStage(reason);
        });

        hub.on("liveMuted", (payload) => {
          if (payload?.roomId && String(payload.roomId) !== String(roomId)) return;
          if (payload?.userId && String(payload.userId) !== String(meRef.current?.id)) return;
          setChatMuted(true);
          notify(payload?.minutes > 0 ? `${payload.minutes} dəq şərh bağlıdır` : "Şərh susduruldu", true);
        });

        hub.on("liveUnmuted", (payload) => {
          if (payload?.roomId && String(payload.roomId) !== String(roomId)) return;
          if (payload?.userId && String(payload.userId) !== String(meRef.current?.id)) return;
          setChatMuted(false);
          notify("Şərh yenidən açıqdır");
        });

        hub.on("liveGuestRemoved", (payload) => {
          if (payload?.roomId && String(payload.roomId) !== String(roomId)) return;
          stopLocalMedia();
          setDetail((prev) => ({ ...prev, inSeat: false }));
          notify("Kameradan çıxarıldın");
        });

        hub.on("livePeerForceLeft", (payload) => {
          if (payload?.userId) dropPeersByUser(payload.userId);
          if (String(payload?.userId) === String(meRef.current?.id)) {
            stopLocalMedia();
            setDetail((prev) => ({ ...prev, inSeat: false }));
          }
          api.get(`/api/lives/${roomId}`).then((data) => {
            setDetail((prev) => ({ ...prev, ...data, isHost: !!data.isHost, inSeat: !!data.inSeat }));
            setViewers(Array.isArray(data.viewers) ? data.viewers : []);
            setRequests(Array.isArray(data.requests) ? data.requests : []);
          }).catch(() => {});
        });

        hub.on("liveSeatRequest", (payload) => {
          if (!payload?.userId) return;
          if (payload.roomId && String(payload.roomId) !== String(roomId)) return;
          rememberName(payload.userId, payload.username);
          setRequests((list) => {
            if (list.some((r) => String(r.id) === String(payload.userId))) return list;
            return [...list, {
              id: payload.userId,
              username: payload.username || "",
              fullName: payload.fullName || "",
              avatar: payload.avatar || "",
            }];
          });
        });

        hub.on("liveSeatRejected", (payload) => {
          if (payload?.roomId && String(payload.roomId) !== String(roomId)) return;
          setRequested(false);
          notify("Kamera sorğun rədd edildi", true);
        });

        hub.on("liveSignal", async (payload) => {
          const from = payload?.fromConnectionId;
          if (!from || from === hub.connectionId) return;
          await answerPeer(from, payload.kind, payload.payload, payload.fromUserId);
        });

        try {
          await hub.start();
          if (dead) return;
          await hub.invoke("JoinLive", roomId);
        } catch {
          if (!dead) notify("Canlı bağlantı zəifdir, yenidən cəhd olunur…", true);
          try {
            await hub.start();
            if (!dead) await hub.invoke("JoinLive", roomId);
          } catch {
            if (!dead) notify("Şərh/dəvət hələ qoşulmayıb, yayım davam edir", true);
          }
        }

        if (!dead) {
          setReady(true);
          if (data.invited && !onSeat) {
            setInvite({ roomId, title: data.title, fromUsername: "Aparıcı", targetUserId: meRef.current?.id });
          }
        }
      } catch (err) {
        if (dead) return;
        notify(err?.response?.data?.message || "Canlıya qoşulmaq olmadı", true);
        onCloseRef.current?.();
      }
    }

    boot();

    // Əgər host bitiribsə və hub gəlməyibsə — qısa poll.
    const watch = window.setInterval(async () => {
      if (dead || endedRef.current) return;
      try {
        await api.get(`/api/lives/${roomId}`);
      } catch (err) {
        if (err?.response?.status === 404) closeStage("Yayım bitdi");
      }
    }, 8000);

    return () => {
      dead = true;
      window.clearInterval(watch);
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      if (ownedStream) {
        ownedStream.getTracks().forEach((t) => t.stop());
        if (localRef.current === ownedStream) {
          localRef.current = null;
          setLocalStream(null);
        }
      }
      if (ownedHub) {
        if (hubRef.current === ownedHub) hubRef.current = null;
        ownedHub.invoke("LeaveLive", roomId).catch(() => {});
        ownedHub.stop().catch(() => {});
      }
    };
  }, [room.id]);

  async function endLive() {
    if (!isHost) {
      notify("Yayımı yalnız aparıcı bitirə bilər", true);
      return;
    }
    try {
      await api.post(`/api/lives/${room.id}/end`);
      closeStage("Yayım bitdi");
    } catch (err) {
      notify(err?.response?.data?.message || "Yayımı bitirmək olmadı", true);
    }
  }

  async function exitLive() {
    if (isHost) {
      // Host təsadüfən çıxsa — yayımı bitir, izləyici kimi «çıx» yox
      return endLive();
    }
    try {
      if (detail?.inSeat) await api.post(`/api/lives/${room.id}/leave`);
    } catch {
      /* ignore */
    }
    closeStage(null);
  }

  async function sendChat(e) {
    e?.preventDefault?.();
    let body = chatText.trim().replace(/\s+/g, " ");
    if (!body || !hubRef.current) return;
    if (chatMuted) {
      notify("Şərh susdurulub", true);
      return;
    }
    if (body.length > CHAT_MAX) body = body.slice(0, CHAT_MAX);
    try {
      await hubRef.current.invoke("Chat", room.id, body);
      setChatText("");
    } catch {
      notify("Şərh getmədi", true);
    }
  }

  async function modAction(key, path, body, okMsg) {
    if (modBusy) return;
    setModBusy(key);
    try {
      await api.post(`/api/lives/${room.id}/${path}`, body);
      if (okMsg) notify(okMsg);
      await refreshDetail();
    } catch (err) {
      notify(err?.response?.data?.message || "Əməliyyat alınmadı", true);
    } finally {
      setModBusy(null);
    }
  }

  async function requestSeat() {
    if (requested || busySeat) return;
    setBusySeat(true);
    try {
      await api.post(`/api/lives/${room.id}/request-seat`);
      setRequested(true);
      notify("Kamera sorğusu göndərildi");
    } catch (err) {
      notify(err?.response?.data?.message || "Sorğu getmədi", true);
    } finally {
      setBusySeat(false);
    }
  }

  async function approveRequest(userId) {
    await modAction(`approve-${userId}`, "approve-request", { userId }, "Dəvət göndərildi");
    setRequests((list) => list.filter((r) => String(r.id) !== String(userId)));
  }

  async function rejectRequest(userId) {
    await modAction(`reject-${userId}`, "reject-request", { userId }, "Sorğu rədd edildi");
    setRequests((list) => list.filter((r) => String(r.id) !== String(userId)));
  }

  function sendLike() {
    if (isHost) return;
    if (likeBusyRef.current) return;
    likeBusyRef.current = true;
    window.setTimeout(() => { likeBusyRef.current = false; }, 45);
    burstHeart(me?.username);
    setLikes((n) => n + 1);
    try {
      if (hubRef.current?.state === "Connected") {
        hubRef.current.invoke("Like", room.id).catch(() => {});
      } else {
        api.post(`/api/lives/${room.id}/like`)
          .then((data) => {
            if (typeof data?.likeCount === "number") setLikes(data.likeCount);
          })
          .catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  async function reportLive() {
    if (isHost) return;
    const reason = window.prompt("Şikayət səbəbi", "Uyğunsuz canlı yayım");
    if (reason == null) return;
    try {
      await api.post(`/api/lives/${room.id}/report`, { reason: reason.trim() || "Uyğunsuz canlı yayım" });
      notify("Şikayət göndərildi");
    } catch (err) {
      notify(err?.response?.data?.message || "Şikayət getmədi", true);
    }
  }

  async function shareLive() {
    const url = `${window.location.origin}/?live=${room.id}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("Yayım linki kopyalandı");
    } catch {
      notify(url);
    }
    try {
      await hubRef.current?.invoke("Share", room.id);
    } catch {
      /* ignore */
    }
  }

  async function inviteUser(userId) {
    if (!userId) return;
    setInviteBusy(true);
    try {
      await api.post(`/api/lives/${room.id}/invite`, { userId });
      notify("Dəvət göndərildi");
      setInviteFriends((list) => list.map((u) => (
        String(u.id) === String(userId) ? { ...u, invited: true } : u
      )));
    } catch (err) {
      notify(err?.response?.data?.message || "Dəvət getmədi", true);
    } finally {
      setInviteBusy(false);
    }
  }

  async function openInvitePicker() {
    if (!isHost || maxSeats <= 1) return;
    setInvitePicker(true);
    try {
      const list = await api.get(`/api/lives/${room.id}/invite-friends`);
      setInviteFriends(Array.isArray(list) ? list : []);
    } catch {
      setInviteFriends([]);
      notify("Dost siyahısı alınmadı", true);
    }
  }

  async function acceptInvite() {
    setBusySeat(true);
    try {
      await api.post(`/api/lives/${room.id}/accept-invite`);
      const next = await api.get(`/api/lives/${room.id}`);
      setDetail(next);
      setInvite(null);
      await ensureLocalMedia();
      await hubRef.current?.invoke("PromoteLive", room.id);
      notify("Kameraya qoşuldun");
    } catch (err) {
      notify(err?.response?.data?.message || "Qoşulmaq olmadı", true);
    } finally {
      setBusySeat(false);
    }
  }

  async function rejectInvite() {
    setBusySeat(true);
    try {
      await api.post(`/api/lives/${room.id}/reject-invite`);
    } catch {
      /* ignore */
    } finally {
      setInvite(null);
      setBusySeat(false);
      notify("Dəvət rədd edildi");
    }
  }

  const inSeat = !!(detail?.inSeat || room.inSeat || localStream);
  const seatPeople = people.length
    ? people
    : (localStream && me ? [{
      id: me.id,
      username: me.username,
      fullName: me.fullName,
      avatar: me.avatar,
      host: true,
    }] : []);
  const onCamCount = Math.max(seatPeople.length, localStream ? 1 : 0);
  const slotCount = maxSeats === 4 ? 4 : maxSeats === 2 ? 2 : 1;
  const gridCount = slotCount;
  const hostPerson = seatPeople.find((p) => p.host) || seatPeople[0] || null;
  // Host öz izləyici sayına / siyahısına düşməsin
  const pureViewers = viewers.filter((v) =>
    String(v.id) !== String(hostId) && !seatPeople.some((p) => String(p.id) === String(v.id)));
  const viewerOnly = pureViewers;
  const viewerCount = pureViewers.length;
  const canInvite = isHost && maxSeats > 1 && seatPeople.length < maxSeats;
  const canRequest = !isHost && !inSeat && maxSeats > 1 && seatPeople.length < maxSeats;

  function mediaForPerson(person) {
    if (!person) return null;
    if (me && String(person.id) === String(me.id) && localStream) {
      return { stream: localStream, muted: true, mirror: true, key: `self-${person.id}` };
    }
    const remote = remotes.find((r) => String(r.userId) === String(person.id));
    if (remote) return { stream: remote.stream, muted: false, mirror: false, key: remote.id };
    return null;
  }

  const usedRemoteKeys = new Set();
  const seatSlots = Array.from({ length: slotCount }, (_, index) => {
    const person = seatPeople[index] || null;
    const media = mediaForPerson(person);
    if (media?.key) usedRemoteKeys.add(media.key);
    return { index, person, media };
  });
  for (const slot of seatSlots) {
    if (slot.media || slot.person) continue;
    const leftover = remotes.find((r) => !usedRemoteKeys.has(r.id));
    if (!leftover) break;
    usedRemoteKeys.add(leftover.id);
    slot.media = { stream: leftover.stream, muted: false, mirror: false, key: leftover.id };
    slot.person = leftover.userId
      ? { id: leftover.userId, username: labelFor(leftover.id, leftover.userId) }
      : { id: leftover.id, username: labelFor(leftover.id) };
  }

  function stopHoldLike() {
    if (holdLikeRef.current) {
      window.clearInterval(holdLikeRef.current);
      holdLikeRef.current = null;
    }
  }

  function startHoldLike(e) {
    if (isHost) return;
    if (e?.target?.closest?.("button, a, input, form, .live-hud-bottom, .live-hud-top")) return;
    sendLike();
    stopHoldLike();
    holdLikeRef.current = window.setInterval(() => { sendLike(); }, 55);
  }

  return createPortal(
    <div className="live-stage" role="dialog" aria-modal="true" aria-label={detail?.title || "Canlı yayım"}>
      <div className={`live-stage-phone${gridCount > 1 ? " is-multi" : ""}`}>
        <div
          className={`live-stage-screen live-grid live-grid-${Math.max(1, gridCount)}`}
          onPointerDown={startHoldLike}
          onPointerUp={stopHoldLike}
          onPointerLeave={stopHoldLike}
          onPointerCancel={stopHoldLike}
        >
          {seatSlots.map((slot) => {
            if (slot.media) {
              return (
                <Tile
                  key={slot.media.key}
                  stream={slot.media.stream}
                  label={slot.person?.username || labelFor(slot.media.key, slot.person?.id)}
                  muted={slot.media.muted}
                  mirror={slot.media.mirror}
                  showLabel={gridCount > 1}
                />
              );
            }
            if (slot.person) {
              return (
                <div key={`wait-${slot.person.id}`} className="live-tile live-tile-empty">
                  <span>@{slot.person.username}</span>
                </div>
              );
            }
            if (!ready && slot.index === 0) {
              return (
                <div key="boot" className="live-tile live-tile-empty">
                  <span>Kamera açılır…</span>
                </div>
              );
            }
            if (canInvite) {
              return (
                <button
                  key={`slot-${slot.index}`}
                  type="button"
                  className="live-tile live-tile-slot"
                  onClick={(e) => { e.stopPropagation(); openInvitePicker(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span className="live-slot-plus" aria-hidden="true">+</span>
                  <span>Dəvət</span>
                </button>
              );
            }
            return (
              <div key={`empty-${slot.index}`} className="live-tile live-tile-empty">
                <span>{slot.index === 0 && !ready ? "Yayım gözlənilir…" : "Boş yer"}</span>
              </div>
            );
          })}

          <div className="live-scrim live-scrim-top" aria-hidden="true" />
          <div className="live-scrim live-scrim-bottom" aria-hidden="true" />

          <header className="live-hud-top" onPointerDown={(e) => e.stopPropagation()}>
            <div className="live-host-pill">
              <Avatar src={hostPerson?.avatar} alt={hostPerson?.username || "host"} />
              <div>
                <strong>@{hostPerson?.username || "live"}</strong>
                <small>
                  <span className="live-live-dot">LIVE</span>
                  {" · "}
                  {onCamCount}/{maxSeats}
                </small>
              </div>
            </div>
            <div className="live-hud-top-right">
              <span className="live-hud-chip" title="İzləyicilər">{viewerCount}</span>
              {isHost ? (
                <button type="button" className="live-icon-btn" onClick={() => setToolsOpen((v) => !v)} aria-label="Alətlər">⋯</button>
              ) : (
                <button type="button" className="live-icon-btn" onClick={reportLive} aria-label="Rapor">⚑</button>
              )}
              <button
                type="button"
                className="live-icon-btn is-close"
                onClick={isHost ? endLive : exitLive}
                aria-label={isHost ? "Yayımı bitir" : "Canlıdan çıx"}
              >
                ✕
              </button>
            </div>
          </header>

          <div className="live-float-layer" aria-live="polite">
            {floats.map((row) => (
              <div key={row.key} className={`live-float is-${row.kind}${row.self ? " is-self" : ""}`}>
                {row.kind === "chat" ? (
                  <>
                    <strong>{row.self ? "Sən" : (row.username ? `@${row.username}` : "İzləyici")}</strong>
                    <span>{row.text}</span>
                  </>
                ) : (
                  <span>{row.text}</span>
                )}
              </div>
            ))}
          </div>

          <div className="live-heart-layer" aria-hidden="true">
            {hearts.map((h) => (
              <span key={h.key} className="live-heart" style={{ left: `${h.left}%` }}>♥</span>
            ))}
          </div>

          <div className="live-hud-bottom" onPointerDown={(e) => e.stopPropagation()}>
            {canRequest ? (
              <button type="button" className="live-icon-btn" disabled={busySeat || requested} onClick={requestSeat} title="Kameraya sorğu">
                {requested ? "✓" : "🎙"}
              </button>
            ) : null}
            <form className="live-chat-form" onSubmit={sendChat}>
              <input
                ref={chatInputRef}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder={chatMuted ? "Şərh susdurulub…" : "Respond"}
                maxLength={CHAT_MAX}
                disabled={chatMuted}
              />
              <ExpressionButton
                onPick={(payload) => {
                  if (chatMuted) return;
                  if (payload.kind === "emoji" || payload.kind === "sticker") {
                    insertAtCursor(chatInputRef, payload.text, chatText, setChatText);
                    return;
                  }
                  const stamp = payload.kind === "music" ? `♫ ${payload.text}` : `⌖ ${payload.text}`;
                  insertAtCursor(chatInputRef, (chatText && !chatText.endsWith(" ") ? " " : "") + stamp, chatText, setChatText);
                }}
              />
            </form>
            <div className="live-hud-actions">
              <span className="live-like-total" title="Bəyənmələr">♥ {likes}</span>
              <button type="button" className="live-icon-btn live-share-btn" onClick={shareLive} aria-label="Paylaş" title="Paylaş">
                <Icon name="share" size={22} />
              </button>
              {isHost ? (
                <button type="button" className="live-btn end-host" onClick={endLive}>Bitir</button>
              ) : (
                <button type="button" className="live-btn leave-viewer" onClick={exitLive}>Çıx</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {toolsOpen && isHost ? (
        <aside className="live-side live-side-drawer">
          <div className="live-side-drawer-head">
            <h4>İdarəetmə</h4>
            <button type="button" className="live-icon-btn" onClick={() => setToolsOpen(false)}>✕</button>
          </div>
          {canInvite ? (
            <button type="button" className="live-btn" style={{ width: "100%", marginBottom: 10 }} onClick={openInvitePicker}>
              Dost dəvət et
            </button>
          ) : null}

          <h4>Kamerada</h4>
          <div className="live-side-list">
            {seatPeople.map((person) => {
              const isSelf = String(person.id) === String(me?.id);
              const guest = !person.host && !isSelf;
              return (
                <div key={person.id} className="live-side-row live-side-stack">
                  <div className="live-side-who">
                    <Avatar src={person.avatar} alt={person.username} />
                    <span>
                      <strong>{person.fullName || person.username}</strong>
                      <small>@{person.username}{person.host ? " · host" : ""}</small>
                    </span>
                  </div>
                  {guest ? (
                    <div className="live-mod">
                      <button type="button" className="live-btn tiny ghost" disabled={!!modBusy} onClick={() => modAction(`rm-${person.id}`, "remove-guest", { userId: person.id }, "Qonaq çıxarıldı")}>Kameradan</button>
                      <button type="button" className="live-btn tiny danger" disabled={!!modBusy} onClick={() => modAction(`kick-${person.id}`, "kick", { userId: person.id }, "Çıxarıldı")}>Kick</button>
                      <button type="button" className="live-btn tiny danger" disabled={!!modBusy} onClick={() => modAction(`block-${person.id}`, "block-user", { userId: person.id }, "Bloklandı")}>Blok</button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {requests.length > 0 ? (
            <>
              <h4>Sorğular · {requests.length}</h4>
              <div className="live-side-list">
                {requests.map((person) => (
                  <div key={person.id} className="live-side-row live-side-stack">
                    <div className="live-side-who">
                      <Avatar src={person.avatar} alt={person.username} />
                      <span>
                        <strong>{person.fullName || person.username}</strong>
                        <small>@{person.username}</small>
                      </span>
                    </div>
                    <div className="live-mod">
                      <button type="button" className="live-btn tiny" disabled={!!modBusy} onClick={() => approveRequest(person.id)}>Təsdiq</button>
                      <button type="button" className="live-btn tiny ghost" disabled={!!modBusy} onClick={() => rejectRequest(person.id)}>Rədd</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <h4>İzləyənlər · {viewerOnly.length}</h4>
          <div className="live-side-list">
            {viewerOnly.length === 0 ? <p className="muted">Hələ izləyici yoxdur</p> : null}
            {viewerOnly.map((person) => (
              <div key={person.id} className="live-side-row live-side-stack">
                <div className="live-side-who">
                  <Avatar src={person.avatar} alt={person.username} />
                  <span>
                    <strong>{person.fullName || person.username}</strong>
                    <small>@{person.username}{person.muted ? " · mute" : ""}</small>
                  </span>
                </div>
                <div className="live-mod">
                  {canInvite ? (
                    <button type="button" className="live-btn tiny" disabled={!!modBusy} onClick={() => inviteUser(person.id)}>Dəvət</button>
                  ) : null}
                  {person.muted ? (
                    <button type="button" className="live-btn tiny ghost" disabled={!!modBusy} onClick={() => modAction(`unm-${person.id}`, "unmute", { userId: person.id }, "Səs açıldı")}>Səs aç</button>
                  ) : (
                    <button type="button" className="live-btn tiny ghost" disabled={!!modBusy} onClick={() => modAction(`mute-${person.id}`, "mute", { userId: person.id, minutes: 0 }, "Susduruldu")}>Mute</button>
                  )}
                  <button type="button" className="live-btn tiny danger" disabled={!!modBusy} onClick={() => modAction(`kick-${person.id}`, "kick", { userId: person.id }, "Çıxarıldı")}>Kick</button>
                  <button type="button" className="live-btn tiny danger" disabled={!!modBusy} onClick={() => modAction(`block-${person.id}`, "block-user", { userId: person.id }, "Bloklandı")}>Blok</button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {invite ? (
        <div className="live-invite-banner">
          <p>
            <strong>@{invite.fromUsername || "Aparıcı"}</strong> səni kameraya dəvət etdi
          </p>
          <div>
            <button type="button" className="live-btn" disabled={busySeat} onClick={acceptInvite}>Qəbul</button>
            <button type="button" className="live-btn ghost" disabled={busySeat} onClick={rejectInvite}>Rədd</button>
          </div>
        </div>
      ) : null}

      {invitePicker && isHost ? (
        <div className="live-invite-picker" onPointerDown={(e) => e.stopPropagation()}>
          <div className="live-invite-picker-card">
            <header>
              <h4>Qarşılıqlı izlədiyin</h4>
              <button type="button" className="live-icon-btn" onClick={() => setInvitePicker(false)} aria-label="Bağla">✕</button>
            </header>
            <div className="live-invite-picker-list">
              {inviteFriends.length === 0 ? (
                <p className="muted">Dəvət ediləcək qarşılıqlı izləyici yoxdur</p>
              ) : (
                inviteFriends.map((person) => (
                  <div key={person.id} className="live-side-row">
                    <div className="live-side-who">
                      <Avatar src={person.avatar} alt={person.username} />
                      <span>
                        <strong>{person.fullName || person.username}</strong>
                        <small>@{person.username}</small>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="live-btn tiny"
                      disabled={inviteBusy || person.invited || !canInvite}
                      onClick={() => inviteUser(person.id)}
                    >
                      {person.invited ? "Göndərildi" : "Dəvət"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}

export default function LiveRail() {
  const me = useAuthStore((s) => s.user);
  const [rooms, setRooms] = useState([]);
  const [listReady, setListReady] = useState(false);
  const [open, setOpen] = useState(null);
  const [title, setTitle] = useState("");
  const [maxSeats, setMaxSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [globalInvite, setGlobalInvite] = useState(null);
  const [params, setParams] = useSearchParams();
  const deepLive = params.get("live");
  const openRef = useRef(open);

  useEffect(() => { openRef.current = open; }, [open]);

  const refresh = useCallback(() => {
    return api.get("/api/lives")
      .then((list) => setRooms(Array.isArray(list) ? list : []))
      .catch(() => setRooms([]))
      .finally(() => setListReady(true));
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 20000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => onSocket("notify", (payload) => {
    if (payload?.type !== "live_invite" || !payload.entityId) return;
    const text = String(payload.text || "");
    const inThatRoom = openRef.current && String(openRef.current.id) === String(payload.entityId);
    if (text.includes("qəbul") || text.includes("rədd")) {
      if (!inThatRoom) notify(text);
      return;
    }
    if (!text.includes("dəvət")) return;
    if (inThatRoom) return;
    const fromUsername = text.split(/\s+/)[0]?.replace(/^@/, "") || "Aparıcı";
    setGlobalInvite({
      roomId: payload.entityId,
      fromUsername,
      text,
    });
  }), []);

  useEffect(() => {
    if (!deepLive || open) return undefined;
    let alive = true;
    api.get(`/api/lives/${deepLive}`)
      .then((room) => {
        if (!alive || !room?.id) return;
        setOpen(room);
        const next = new URLSearchParams(params);
        next.delete("live");
        setParams(next, { replace: true });
      })
      .catch(() => {
        const next = new URLSearchParams(params);
        next.delete("live");
        setParams(next, { replace: true });
      });
    return () => { alive = false; };
  }, [deepLive, open, params, setParams]);

  async function acceptGlobalInvite() {
    if (!globalInvite?.roomId) return;
    setBusy(true);
    try {
      await api.post(`/api/lives/${globalInvite.roomId}/accept-invite`);
      const room = await api.get(`/api/lives/${globalInvite.roomId}`);
      setGlobalInvite(null);
      setOpen({ ...room, inSeat: true });
      notify("Kameraya qoşuldun");
    } catch (err) {
      notify(err?.response?.data?.message || "Qoşulmaq olmadı", true);
    } finally {
      setBusy(false);
    }
  }

  async function rejectGlobalInvite() {
    if (!globalInvite?.roomId) return;
    setBusy(true);
    try {
      await api.post(`/api/lives/${globalInvite.roomId}/reject-invite`);
    } catch {
      /* ignore */
    } finally {
      setGlobalInvite(null);
      setBusy(false);
      notify("Dəvət rədd edildi");
    }
  }

  async function startLive() {
    setBusy(true);
    try {
      const room = await api.post("/api/lives", { title: title.trim() || "Canlı", maxSeats });
      setTitle("");
      const hostPerson = me ? [{
        id: me.id,
        username: me.username,
        fullName: me.fullName,
        avatar: me.avatar,
        host: true,
      }] : [];
      setOpen({
        id: room.id,
        title: room.title,
        maxSeats: room.maxSeats || maxSeats,
        people: hostPerson,
        isHost: true,
        inSeat: true,
        likeCount: 0,
      });
      refresh();
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
          <select value={maxSeats} onChange={(e) => setMaxSeats(Number(e.target.value))} aria-label="Kamera limiti">
            <option value={1}>Tək (özüm)</option>
            <option value={2}>Max 2 (qonaq)</option>
            <option value={4}>Max 4 (qonaq)</option>
          </select>
          <button type="button" disabled={busy} onClick={startLive}>Canlıya çıx</button>
        </div>
      </div>
      {!listReady ? null : rooms.length === 0 ? (
        <div className="live-empty">
          <span className="live-orb" aria-hidden="true" />
          <div>
            <strong>İndi heç kim canlıda deyil</strong>
            <p>TikTok kimi tək çıxa bilərsən; istəsən sonra 2 və ya 4 yerə qonaq dəvət edərsən.</p>
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
                <span className="live-pill">Canlı · {people.length}/{room.maxSeats || 1}</span>
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

      {globalInvite && !open ? createPortal(
        <div className="live-invite-banner live-invite-global">
          <p>
            <strong>@{globalInvite.fromUsername}</strong> səni canlı yayına dəvət etdi
          </p>
          <div>
            <button type="button" className="live-btn" disabled={busy} onClick={acceptGlobalInvite}>Qəbul</button>
            <button type="button" className="live-btn ghost" disabled={busy} onClick={rejectGlobalInvite}>Rədd</button>
          </div>
        </div>,
        document.body
      ) : null}
    </section>
  );
}
