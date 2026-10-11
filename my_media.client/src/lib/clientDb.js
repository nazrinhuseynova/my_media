export function uid(prefix) {
  return `${prefix || "id"}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function hashPassword(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `p${hash}`;
}

export function nowIso() {
  return new Date().toISOString();
}

const KEY = "pulse_db_v1";

function seed() {
  const password = hashPassword("Admin123!");
  const users = [
    {
      id: "u_admin",
      email: "admin@pulse.az",
      phone: "+994501112233",
      username: "admin",
      fullName: "Admin",
      bio: "Platforma administratoru",
      website: "https://pulse.az",
      avatar: "https://i.pravatar.cc/300?img=12",
      isPrivate: false,
      isActive: true,
      isBanned: false,
      role: "admin",
      password,
      provider: "email",
      createdAt: nowIso(),
    },
    {
      id: "u_leyla",
      email: "leyla@mail.az",
      phone: "+994557778899",
      username: "leyla",
      fullName: "Leyla Məmmədova",
      bio: "Bakı | foto",
      website: "https://leyla.az",
      avatar: "https://i.pravatar.cc/300?img=5",
      isPrivate: false,
      isActive: true,
      isBanned: false,
      role: "user",
      password,
      provider: "email",
      createdAt: nowIso(),
    },
    {
      id: "u_elvin",
      email: "elvin@mail.az",
      phone: "+994503334455",
      username: "elvin",
      fullName: "Elvin Quliyev",
      bio: "Reels və səyahət",
      website: "",
      avatar: "https://i.pravatar.cc/300?img=11",
      isPrivate: false,
      isActive: true,
      isBanned: false,
      role: "user",
      password,
      provider: "email",
      createdAt: nowIso(),
    },
    {
      id: "u_aysel",
      email: "aysel@mail.az",
      phone: "+994702223344",
      username: "aysel",
      fullName: "Aysel Həsənova",
      bio: "Private hesab",
      website: "",
      avatar: "https://i.pravatar.cc/300?img=32",
      isPrivate: true,
      isActive: true,
      isBanned: false,
      role: "user",
      password,
      provider: "email",
      createdAt: nowIso(),
    },
    {
      id: "u_kamran",
      email: "kamran@mail.az",
      phone: "+994555551212",
      username: "kamran",
      fullName: "Kamran Əliyev",
      bio: "Şəhər kadrları",
      website: "",
      avatar: "https://i.pravatar.cc/300?img=15",
      isPrivate: false,
      isActive: true,
      isBanned: false,
      role: "user",
      password,
      provider: "email",
      createdAt: nowIso(),
    },
  ];

  const posts = [
    {
      id: "p1",
      userId: "u_leyla",
      media: [
        { type: "image", url: "https://picsum.photos/id/1015/1080/1080", filter: "clarendon" },
        { type: "image", url: "https://picsum.photos/id/1016/1080/1080", filter: "none" },
      ],
      caption: "İçərişəhər axşamı #baku #oldcity",
      hashtags: ["baku", "oldcity"],
      location: "İçərişəhər, Bakı",
      mentions: ["elvin"],
      likes: ["u_elvin", "u_kamran"],
      savedBy: ["u_elvin"],
      createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    },
    {
      id: "p2",
      userId: "u_elvin",
      media: [{ type: "image", url: "https://picsum.photos/id/1025/1080/1350", filter: "moon" }],
      caption: "Yeni kadr @leyla",
      hashtags: ["photo"],
      location: "Bakı Bulvarı",
      mentions: ["leyla"],
      likes: ["u_leyla"],
      savedBy: [],
      createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    },
    {
      id: "p3",
      userId: "u_kamran",
      media: [{ type: "image", url: "https://picsum.photos/id/1043/1080/1080", filter: "gingham" }],
      caption: "Səhər #sunrise",
      hashtags: ["sunrise"],
      location: "Xəzər",
      mentions: [],
      likes: ["u_leyla", "u_elvin", "u_admin"],
      savedBy: ["u_leyla"],
      createdAt: new Date(Date.now() - 1000 * 60 * 400).toISOString(),
    },
  ];

  const reels = [
    {
      id: "r1",
      userId: "u_elvin",
      videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      caption: "Qısa kadr #reels",
      music: "Night Drive — Pulse Sounds",
      effect: "warm",
      likes: ["u_leyla"],
      savedBy: [],
      createdAt: nowIso(),
    },
    {
      id: "r2",
      userId: "u_leyla",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      caption: "Şəhər ritmi",
      music: "City Lights",
      effect: "none",
      likes: ["u_kamran"],
      savedBy: ["u_elvin"],
      createdAt: nowIso(),
    },
  ];

  const stories = [
    {
      id: "s1",
      userId: "u_leyla",
      mediaUrl: "https://picsum.photos/id/1011/720/1280",
      mediaType: "image",
      text: "Bugün",
      sticker: "🔥",
      music: "Sunset Beat",
      viewers: ["u_elvin"],
      createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
    {
      id: "s_elvin",
      userId: "u_elvin",
      mediaUrl: "https://picsum.photos/id/1015/720/1280",
      mediaType: "image",
      text: "Bulvar",
      sticker: "🌅",
      music: "Night Drive",
      viewers: [],
      createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    },
    {
      id: "s2",
      userId: "u_kamran",
      mediaUrl: "https://picsum.photos/id/1036/720/1280",
      mediaType: "image",
      text: "",
      sticker: "📍",
      music: "",
      viewers: [],
      createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    },
  ];

  return {
    users,
    posts,
    reels,
    stories,
    comments: [
      {
        id: "c1",
        postId: "p1",
        userId: "u_elvin",
        text: "Əla kadr!",
        likes: ["u_leyla"],
        parentId: null,
        createdAt: nowIso(),
      },
    ],
    follows: [
      { followerId: "u_elvin", followingId: "u_leyla" },
      { followerId: "u_elvin", followingId: "u_kamran" },
      { followerId: "u_leyla", followingId: "u_elvin" },
      { followerId: "u_leyla", followingId: "u_kamran" },
      { followerId: "u_kamran", followingId: "u_leyla" },
      { followerId: "u_kamran", followingId: "u_elvin" },
      { followerId: "u_admin", followingId: "u_leyla" },
      { followerId: "u_admin", followingId: "u_elvin" },
      { followerId: "u_admin", followingId: "u_kamran" },
    ],
    followRequests: [{ id: "fr1", fromId: "u_kamran", toId: "u_aysel", status: "pending" }],
    blocks: [],
    collections: [
      { id: "col1", userId: "u_elvin", name: "Səyahət", items: [{ type: "post", id: "p1" }] },
    ],
    conversations: [
      {
        id: "cv1",
        isGroup: false,
        title: "",
        memberIds: ["u_leyla", "u_elvin"],
        updatedAt: nowIso(),
      },
      {
        id: "cv2",
        isGroup: true,
        title: "Dostlar",
        memberIds: ["u_leyla", "u_elvin", "u_kamran"],
        updatedAt: nowIso(),
      },
    ],
    messages: [
      {
        id: "m1",
        conversationId: "cv1",
        senderId: "u_leyla",
        type: "text",
        text: "Salam, necəsən?",
        mediaUrl: "",
        sharedPostId: "",
        createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        readBy: ["u_leyla", "u_elvin"],
      },
      {
        id: "m2",
        conversationId: "cv1",
        senderId: "u_elvin",
        type: "text",
        text: "Yaxşı, sən?",
        mediaUrl: "",
        sharedPostId: "",
        createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        readBy: ["u_elvin"],
      },
    ],
    notifications: [
      {
        id: "n1",
        userId: "u_leyla",
        type: "like",
        fromId: "u_elvin",
        entityId: "p1",
        text: "elvin sənin paylaşımını bəyəndi",
        read: false,
        createdAt: nowIso(),
      },
      {
        id: "n2",
        userId: "u_leyla",
        type: "follow",
        fromId: "u_kamran",
        entityId: "u_kamran",
        text: "kamran səni izləməyə başladı",
        read: false,
        createdAt: nowIso(),
      },
    ],
    reports: [],
    otps: [],
    notificationSettings: {},
    typing: {},
  };
}

export function loadDb() {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    const data = seed();
    localStorage.setItem(KEY, JSON.stringify(data));
    return data;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    const data = seed();
    localStorage.setItem(KEY, JSON.stringify(data));
    return data;
  }
}

export function saveDb(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}
