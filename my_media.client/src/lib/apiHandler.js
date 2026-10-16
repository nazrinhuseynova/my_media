import { extractHashtags, extractMentions, isEmail, isPhone, validateOtp, validatePassword } from "../utils/validators";
import { hashPassword, loadDb, nowIso, publicUser, saveDb, uid } from "./clientDb";

function ok(data, status) {
  return { status: status || 200, data };
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status || 400;
  error.payload = { message };
  throw error;
}

function getTokenUser(config, db) {
  const header = config.headers?.Authorization || config.headers?.authorization || "";
  const token = String(header).replace("Bearer ", "");
  if (!token) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(token))));
    return db.users.find((u) => u.id === parsed.id) || null;
  } catch (e) {
    return null;
  }
}

function requireUser(config, db) {
  const user = getTokenUser(config, db);
  if (!user) fail("Giriş tələb olunur", 401);
  if (!user.isActive) fail("Hesab deaktivdir", 403);
  if (user.isBanned) fail("Hesab dayandırılıb", 403);
  return user;
}

function makeToken(user) {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ id: user.id, t: Date.now() }))));
}

function storyAlive(story) {
  return Date.now() - new Date(story.createdAt).getTime() < 24 * 60 * 60 * 1000;
}

function addNotification(db, userId, type, fromId, entityId, text) {
  if (userId === fromId) return;
  db.notifications.unshift({
    id: uid("n"),
    userId,
    type,
    fromId,
    entityId,
    text,
    read: false,
    createdAt: nowIso(),
  });
}

function findUserByContact(db, contact) {
  const value = (contact || "").trim().toLowerCase();
  return db.users.find(
    (u) =>
      u.username.toLowerCase() === value ||
      (u.email && u.email.toLowerCase() === value) ||
      (u.phone && u.phone.replace(/\s/g, "") === contact.replace(/\s/g, ""))
  );
}

function canSeePosts(db, viewer, owner) {
  if (!owner.isPrivate) return true;
  if (!viewer) return false;
  if (viewer.id === owner.id) return true;
  return db.follows.some((f) => f.followerId === viewer.id && f.followingId === owner.id);
}

function isBlocked(db, a, b) {
  return db.blocks.some(
    (x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a)
  );
}

function postWithMeta(db, post, viewerId) {
  const user = publicUser(db.users.find((u) => u.id === post.userId));
  const comments = db.comments.filter((c) => c.postId === post.id);
  return {
    ...post,
    user,
    likeCount: post.likes.length,
    commentCount: comments.length,
    liked: viewerId ? post.likes.includes(viewerId) : false,
    saved: viewerId ? post.savedBy.includes(viewerId) : false,
  };
}

export async function dispatch(config) {
  const db = loadDb();
  const url = (config.url || "").replace(config.baseURL || "", "");
  const method = (config.method || "get").toLowerCase();
  const body = typeof config.data === "string" ? JSON.parse(config.data || "{}") : config.data || {};
  const query = config.params || {};

  const path = url.split("?")[0];

  if (method === "post" && path === "/api/auth/register") {
    const contact = (body.contact || "").trim();
    if (findUserByContact(db, contact) || db.users.some((u) => u.username.toLowerCase() === body.username.toLowerCase())) {
      fail("Bu istifadəçi artıq mövcuddur");
    }
    const user = {
      id: uid("u"),
      email: isEmail(contact) ? contact : "",
      phone: isPhone(contact) ? contact : "",
      username: body.username,
      fullName: body.fullName,
      bio: "",
      website: "",
      avatar: `https://i.pravatar.cc/300?u=${body.username}`,
      isPrivate: false,
      isActive: true,
      isBanned: false,
      role: "user",
      password: hashPassword(body.password),
      provider: "email",
      createdAt: nowIso(),
    };
    db.users.push(user);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.otps.push({ contact, code, userId: user.id, type: "register", createdAt: Date.now() });
    saveDb(db);
    return ok({ message: "OTP göndərildi", previewCode: code, userId: user.id });
  }

  if (method === "post" && path === "/api/auth/login") {
    const user = findUserByContact(db, body.contact);
    if (!user || user.password !== hashPassword(body.password)) fail("İstifadəçi adı və ya şifrə yanlışdır", 401);
    if (!user.isActive) fail("Hesab deaktivdir", 403);
    if (user.isBanned) fail("Hesab dayandırılıb", 403);
    return ok({ token: makeToken(user), user: publicUser(user) });
  }

  if (method === "post" && (path === "/api/auth/google" || path === "/api/auth/apple")) {
    const provider = path.endsWith("google") ? "google" : "apple";
    const username = provider === "google" ? "google_user" : "apple_user";
    let user = db.users.find((u) => u.provider === provider);
    if (!user) {
      user = {
        id: uid("u"),
        email: `${provider}@pulse.az`,
        phone: "",
        username: `${username}_${Math.floor(Math.random() * 99)}`,
        fullName: provider === "google" ? "Google İstifadəçi" : "Apple İstifadəçi",
        bio: "",
        website: "",
        avatar: "https://i.pravatar.cc/300?img=8",
        isPrivate: false,
        isActive: true,
        isBanned: false,
        role: "user",
        password: hashPassword(uid("pw")),
        provider,
        createdAt: nowIso(),
      };
      db.users.push(user);
      saveDb(db);
    }
    return ok({ token: makeToken(user), user: publicUser(user) });
  }

  if (method === "post" && path === "/api/auth/forgot-password") {
    const user = findUserByContact(db, body.contact);
    if (!user) fail("İstifadəçi tapılmadı", 404);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.otps.push({ contact: body.contact, code, userId: user.id, type: "reset", createdAt: Date.now() });
    saveDb(db);
    return ok({ message: "Kod göndərildi", previewCode: code, userId: user.id });
  }

  if (method === "post" && path === "/api/auth/verify-otp") {
    const otpError = validateOtp(body.code);
    if (otpError) fail(otpError);
    const otp = db.otps.find(
      (o) => o.code === body.code && o.userId === body.userId && Date.now() - o.createdAt < 10 * 60 * 1000
    );
    if (!otp) fail("Kod yanlışdır və ya vaxtı bitib");
    const user = db.users.find((u) => u.id === otp.userId);
    db.otps = db.otps.filter((o) => o !== otp);
    saveDb(db);
    if (otp.type === "register") {
      return ok({ token: makeToken(user), user: publicUser(user) });
    }
    return ok({ resetToken: makeToken(user), message: "Kod təsdiqləndi" });
  }

  if (method === "post" && path === "/api/auth/reset-password") {
    const err = validatePassword(body.password);
    if (err) fail(err);
    let payload;
    try {
      payload = JSON.parse(decodeURIComponent(escape(atob(body.resetToken))));
    } catch (e) {
      fail("Token yanlışdır");
    }
    const user = db.users.find((u) => u.id === payload.id);
    if (!user) fail("İstifadəçi tapılmadı", 404);
    user.password = hashPassword(body.password);
    saveDb(db);
    return ok({ message: "Şifrə yeniləndi" });
  }

  if (method === "get" && path === "/api/auth/me") {
    const me = requireUser(config, db);
    return ok(publicUser(me));
  }

  if (method === "post" && path === "/api/auth/change-password") {
    const me = requireUser(config, db);
    if (me.password !== hashPassword(body.currentPassword)) fail("Cari şifrə yanlışdır");
    const err = validatePassword(body.newPassword);
    if (err) fail(err);
    me.password = hashPassword(body.newPassword);
    saveDb(db);
    return ok({ message: "Şifrə dəyişdirildi" });
  }

  if (method === "post" && path === "/api/auth/deactivate") {
    const me = requireUser(config, db);
    me.isActive = false;
    saveDb(db);
    return ok({ message: "Hesab deaktiv edildi" });
  }

  if (method === "delete" && path === "/api/auth/account") {
    const me = requireUser(config, db);
    db.users = db.users.filter((u) => u.id !== me.id);
    db.posts = db.posts.filter((p) => p.userId !== me.id);
    saveDb(db);
    return ok({ message: "Hesab silindi" });
  }

  if (method === "get" && path === "/api/feed") {
    const me = requireUser(config, db);
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 5);
    const following = db.follows.filter((f) => f.followerId === me.id).map((f) => f.followingId);
    const ids = [...following, me.id];
    const list = db.posts
      .filter((p) => ids.includes(p.userId) && !isBlocked(db, me.id, p.userId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((p) => postWithMeta(db, p, me.id));
    const start = (page - 1) * limit;
    return ok({ items: list.slice(start, start + limit), hasMore: start + limit < list.length });
  }

  if (method === "get" && path === "/api/explore") {
    const me = getTokenUser(config, db);
    const items = db.posts
      .filter((p) => {
        const owner = db.users.find((u) => u.id === p.userId);
        return owner && !owner.isPrivate && !owner.isBanned;
      })
      .sort((a, b) => b.likes.length - a.likes.length)
      .map((p) => postWithMeta(db, p, me?.id));
    const tags = {};
    db.posts.forEach((p) => p.hashtags.forEach((t) => (tags[t] = (tags[t] || 0) + 1)));
    const trending = Object.entries(tags)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
    return ok({ items, trending });
  }

  if (method === "get" && path === "/api/search") {
    const q = (query.q || "").toLowerCase();
    const type = query.type || "all";
    const users = db.users
      .filter((u) => u.username.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q))
      .map(publicUser);
    const hashtags = Array.from(new Set(db.posts.flatMap((p) => p.hashtags))).filter((t) => t.includes(q));
    const locations = Array.from(new Set(db.posts.map((p) => p.location).filter(Boolean))).filter((l) =>
      l.toLowerCase().includes(q)
    );
    if (type === "user") return ok({ users });
    if (type === "hashtag") return ok({ hashtags });
    if (type === "location") return ok({ locations });
    return ok({ users, hashtags, locations });
  }

  if (method === "get" && path.startsWith("/api/hashtags/")) {
    const tag = decodeURIComponent(path.split("/").pop()).toLowerCase();
    const me = getTokenUser(config, db);
    const items = db.posts.filter((p) => p.hashtags.includes(tag)).map((p) => postWithMeta(db, p, me?.id));
    return ok({ tag, items });
  }

  if (method === "get" && path.startsWith("/api/locations/")) {
    const loc = decodeURIComponent(path.split("/").pop());
    const me = getTokenUser(config, db);
    const items = db.posts.filter((p) => p.location === loc).map((p) => postWithMeta(db, p, me?.id));
    return ok({ location: loc, items });
  }

  if (method === "post" && path === "/api/posts") {
    const me = requireUser(config, db);
    const post = {
      id: uid("p"),
      userId: me.id,
      media: body.media || [],
      caption: body.caption || "",
      hashtags: extractHashtags(body.caption || ""),
      location: body.location || "",
      mentions: extractMentions(body.caption || "").concat(body.mentions || []),
      likes: [],
      savedBy: [],
      createdAt: nowIso(),
    };
    db.posts.unshift(post);
    post.mentions.forEach((name) => {
      const u = db.users.find((x) => x.username.toLowerCase() === String(name).toLowerCase());
      if (u) addNotification(db, u.id, "mention", me.id, post.id, `${me.username} səni işarələdi`);
    });
    saveDb(db);
    return ok(postWithMeta(db, post, me.id), 201);
  }

  if (method === "get" && path.startsWith("/api/posts/") && path.split("/").length === 4) {
    const id = path.split("/")[3];
    const post = db.posts.find((p) => p.id === id);
    if (!post) fail("Paylaşım tapılmadı", 404);
    const owner = db.users.find((u) => u.id === post.userId);
    const me = getTokenUser(config, db);
    if (!canSeePosts(db, me, owner)) fail("Bu hesab gizlidir", 403);
    const comments = db.comments
      .filter((c) => c.postId === id)
      .map((c) => ({
        ...c,
        user: publicUser(db.users.find((u) => u.id === c.userId)),
        liked: me ? c.likes.includes(me.id) : false,
      }));
    return ok({ ...postWithMeta(db, post, me?.id), comments });
  }

  if (method === "patch" && path.startsWith("/api/posts/")) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const post = db.posts.find((p) => p.id === id);
    if (!post || post.userId !== me.id) fail("Redaktə icazəsi yoxdur", 403);
    post.caption = body.caption ?? post.caption;
    post.location = body.location ?? post.location;
    post.hashtags = extractHashtags(post.caption);
    saveDb(db);
    return ok(postWithMeta(db, post, me.id));
  }

  if (method === "delete" && path.startsWith("/api/posts/")) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const post = db.posts.find((p) => p.id === id);
    if (!post) fail("Tapılmadı", 404);
    if (post.userId !== me.id && me.role !== "admin") fail("Silmək olmaz", 403);
    db.posts = db.posts.filter((p) => p.id !== id);
    saveDb(db);
    return ok({ message: "Silindi" });
  }

  if (method === "post" && /\/api\/posts\/.+\/like$/.test(path)) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const post = db.posts.find((p) => p.id === id);
    if (!post) fail("Tapılmadı", 404);
    if (post.likes.includes(me.id)) post.likes = post.likes.filter((x) => x !== me.id);
    else {
      post.likes.push(me.id);
      addNotification(db, post.userId, "like", me.id, post.id, `${me.username} sənin paylaşımını bəyəndi`);
    }
    saveDb(db);
    return ok({ liked: post.likes.includes(me.id), likeCount: post.likes.length });
  }

  if (method === "post" && /\/api\/posts\/.+\/save$/.test(path)) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const post = db.posts.find((p) => p.id === id);
    if (!post) fail("Tapılmadı", 404);
    if (post.savedBy.includes(me.id)) post.savedBy = post.savedBy.filter((x) => x !== me.id);
    else post.savedBy.push(me.id);
    saveDb(db);
    return ok({ saved: post.savedBy.includes(me.id) });
  }

  if (method === "post" && /\/api\/posts\/.+\/comments$/.test(path)) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const comment = {
      id: uid("c"),
      postId: id,
      userId: me.id,
      text: body.text,
      likes: [],
      parentId: body.parentId || null,
      createdAt: nowIso(),
    };
    db.comments.push(comment);
    const post = db.posts.find((p) => p.id === id);
    addNotification(db, post.userId, "comment", me.id, id, `${me.username} şərh yazdı`);
    saveDb(db);
    return ok({ ...comment, user: publicUser(me) }, 201);
  }

  if (method === "post" && /\/api\/comments\/.+\/like$/.test(path)) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const comment = db.comments.find((c) => c.id === id);
    if (!comment) fail("Tapılmadı", 404);
    if (comment.likes.includes(me.id)) comment.likes = comment.likes.filter((x) => x !== me.id);
    else {
      comment.likes.push(me.id);
      addNotification(db, comment.userId, "like", me.id, comment.postId, `${me.username} şərhini bəyəndi`);
    }
    saveDb(db);
    return ok({ liked: comment.likes.includes(me.id) });
  }

  if (method === "get" && path.startsWith("/api/users/") && path.endsWith("/followers")) {
    const username = decodeURIComponent(path.split("/")[3]);
    const user = db.users.find((u) => u.username === username);
    const list = db.follows
      .filter((f) => f.followingId === user.id)
      .map((f) => publicUser(db.users.find((u) => u.id === f.followerId)));
    return ok(list);
  }

  if (method === "get" && path.startsWith("/api/users/") && path.endsWith("/following")) {
    const username = decodeURIComponent(path.split("/")[3]);
    const user = db.users.find((u) => u.username === username);
    const list = db.follows
      .filter((f) => f.followerId === user.id)
      .map((f) => publicUser(db.users.find((u) => u.id === f.followingId)));
    return ok(list);
  }

  if (method === "post" && /\/api\/users\/.+\/follow$/.test(path)) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const target = db.users.find((u) => u.id === id);
    if (!target) fail("Tapılmadı", 404);
    const exists = db.follows.find((f) => f.followerId === me.id && f.followingId === id);
    if (exists) {
      db.follows = db.follows.filter((f) => f !== exists);
      saveDb(db);
      return ok({ status: "none" });
    }
    if (target.isPrivate) {
      if (!db.followRequests.some((r) => r.fromId === me.id && r.toId === id && r.status === "pending")) {
        db.followRequests.push({ id: uid("fr"), fromId: me.id, toId: id, status: "pending" });
        addNotification(db, id, "follow", me.id, me.id, `${me.username} izləmə sorğusu göndərdi`);
      }
      saveDb(db);
      return ok({ status: "requested" });
    }
    db.follows.push({ followerId: me.id, followingId: id });
    addNotification(db, id, "follow", me.id, me.id, `${me.username} səni izləməyə başladı`);
    saveDb(db);
    return ok({ status: "following" });
  }

  if (method === "post" && /\/api\/users\/.+\/block$/.test(path)) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const exists = db.blocks.find((b) => b.blockerId === me.id && b.blockedId === id);
    if (exists) db.blocks = db.blocks.filter((b) => b !== exists);
    else {
      db.blocks.push({ blockerId: me.id, blockedId: id });
      db.follows = db.follows.filter(
        (f) => !(f.followerId === me.id && f.followingId === id) && !(f.followerId === id && f.followingId === me.id)
      );
    }
    saveDb(db);
    return ok({ blocked: !exists });
  }

  if (method === "patch" && path === "/api/profile") {
    const me = requireUser(config, db);
    const user = db.users.find((u) => u.id === me.id);
    ["fullName", "username", "bio", "website", "avatar", "isPrivate"].forEach((key) => {
      if (body[key] !== undefined) user[key] = body[key];
    });
    saveDb(db);
    return ok(publicUser(user));
  }

  if (method === "get" && path.startsWith("/api/users/")) {
    const username = decodeURIComponent(path.split("/")[3]);
    const user = db.users.find((u) => u.username === username);
    if (!user) fail("İstifadəçi tapılmadı", 404);
    const me = getTokenUser(config, db);
    const followers = db.follows.filter((f) => f.followingId === user.id).length;
    const following = db.follows.filter((f) => f.followerId === user.id).length;
    const posts = canSeePosts(db, me, user)
      ? db.posts.filter((p) => p.userId === user.id).map((p) => postWithMeta(db, p, me?.id))
      : [];
    const relation = !me
      ? "none"
      : me.id === user.id
        ? "self"
        : db.follows.some((f) => f.followerId === me.id && f.followingId === user.id)
          ? "following"
          : db.followRequests.some((r) => r.fromId === me.id && r.toId === user.id && r.status === "pending")
            ? "requested"
            : "none";
    return ok({
      user: publicUser(user),
      followers,
      following,
      posts,
      relation,
      blocked: me ? db.blocks.some((b) => b.blockerId === me.id && b.blockedId === user.id) : false,
    });
  }

  if (method === "get" && path === "/api/follow-requests") {
    const me = requireUser(config, db);
    const list = db.followRequests
      .filter((r) => r.toId === me.id && r.status === "pending")
      .map((r) => ({ ...r, from: publicUser(db.users.find((u) => u.id === r.fromId)) }));
    return ok(list);
  }

  if (method === "post" && /\/api\/follow-requests\/.+\/(accept|reject)$/.test(path)) {
    const me = requireUser(config, db);
    const parts = path.split("/");
    const id = parts[3];
    const action = parts[4];
    const req = db.followRequests.find((r) => r.id === id && r.toId === me.id);
    if (!req) fail("Sorğu tapılmadı", 404);
    if (action === "accept") {
      req.status = "accepted";
      db.follows.push({ followerId: req.fromId, followingId: me.id });
    } else req.status = "rejected";
    saveDb(db);
    return ok({ status: req.status });
  }

  if (method === "get" && path === "/api/stories") {
    const me = requireUser(config, db);
    const following = db.follows.filter((f) => f.followerId === me.id).map((f) => f.followingId);
    const ids = [...following, me.id];
    const grouped = {};
    db.stories.filter(storyAlive).forEach((s) => {
      if (!ids.includes(s.userId) && s.userId !== me.id) return;
      if (!grouped[s.userId]) grouped[s.userId] = [];
      grouped[s.userId].push(s);
    });
    const items = Object.keys(grouped).map((userId) => ({
      user: publicUser(db.users.find((u) => u.id === userId)),
      stories: grouped[userId],
      seen: grouped[userId].every((s) => s.viewers.includes(me.id)),
    }));
    return ok(items);
  }

  if (method === "post" && path === "/api/stories") {
    const me = requireUser(config, db);
    const story = {
      id: uid("s"),
      userId: me.id,
      mediaUrl: body.mediaUrl,
      mediaType: body.mediaType || "image",
      text: body.text || "",
      sticker: body.sticker || "",
      music: body.music || "",
      viewers: [],
      createdAt: nowIso(),
    };
    db.stories.unshift(story);
    saveDb(db);
    return ok(story, 201);
  }

  if (method === "post" && /\/api\/stories\/.+\/view$/.test(path)) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const story = db.stories.find((s) => s.id === id);
    if (story && !story.viewers.includes(me.id) && story.userId !== me.id) story.viewers.push(me.id);
    saveDb(db);
    return ok({
      viewers: (story?.viewers || []).map((id) => publicUser(db.users.find((u) => u.id === id))),
    });
  }

  if (method === "get" && path === "/api/reels") {
    const me = getTokenUser(config, db);
    const items = db.reels.map((r) => ({
      ...r,
      user: publicUser(db.users.find((u) => u.id === r.userId)),
      liked: me ? r.likes.includes(me.id) : false,
      likeCount: r.likes.length,
      saved: me ? r.savedBy.includes(me.id) : false,
    }));
    return ok(items);
  }

  if (method === "post" && path === "/api/reels") {
    const me = requireUser(config, db);
    const reel = {
      id: uid("r"),
      userId: me.id,
      videoUrl: body.videoUrl,
      caption: body.caption || "",
      music: body.music || "",
      effect: body.effect || "none",
      likes: [],
      savedBy: [],
      createdAt: nowIso(),
    };
    db.reels.unshift(reel);
    saveDb(db);
    return ok(reel, 201);
  }

  if (method === "post" && /\/api\/reels\/.+\/like$/.test(path)) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const reel = db.reels.find((r) => r.id === id);
    if (reel.likes.includes(me.id)) reel.likes = reel.likes.filter((x) => x !== me.id);
    else {
      reel.likes.push(me.id);
      addNotification(db, reel.userId, "like", me.id, reel.id, `${me.username} reelinə bəyənmə verdi`);
    }
    saveDb(db);
    return ok({ liked: reel.likes.includes(me.id), likeCount: reel.likes.length });
  }

  if (method === "get" && path === "/api/saved") {
    const me = requireUser(config, db);
    const posts = db.posts.filter((p) => p.savedBy.includes(me.id)).map((p) => postWithMeta(db, p, me.id));
    const collections = db.collections.filter((c) => c.userId === me.id);
    return ok({ posts, collections });
  }

  if (method === "post" && path === "/api/collections") {
    const me = requireUser(config, db);
    const col = { id: uid("col"), userId: me.id, name: body.name, items: body.items || [] };
    db.collections.push(col);
    saveDb(db);
    return ok(col, 201);
  }

  if (method === "post" && /\/api\/collections\/.+\/add$/.test(path)) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const col = db.collections.find((c) => c.id === id && c.userId === me.id);
    if (!col) fail("Kolleksiya tapılmadı", 404);
    col.items.push({ type: body.type, id: body.id });
    saveDb(db);
    return ok(col);
  }

  if (method === "get" && path === "/api/conversations") {
    const me = requireUser(config, db);
    const list = db.conversations
      .filter((c) => c.memberIds.includes(me.id))
      .map((c) => {
        const last = db.messages.filter((m) => m.conversationId === c.id).slice(-1)[0];
        const other = c.memberIds.filter((id) => id !== me.id).map((id) => publicUser(db.users.find((u) => u.id === id)));
        return { ...c, last, members: other, unread: last && !last.readBy.includes(me.id) };
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return ok(list);
  }

  if (method === "post" && path === "/api/conversations") {
    const me = requireUser(config, db);
    const memberIds = Array.from(new Set([me.id, ...(body.memberIds || [])]));
    const isGroup = memberIds.length > 2 || body.isGroup;
    const existing = !isGroup
      ? db.conversations.find(
          (c) => !c.isGroup && c.memberIds.length === 2 && memberIds.every((id) => c.memberIds.includes(id))
        )
      : null;
    if (existing) return ok(existing);
    const conv = {
      id: uid("cv"),
      isGroup,
      title: body.title || "",
      memberIds,
      updatedAt: nowIso(),
    };
    db.conversations.unshift(conv);
    saveDb(db);
    return ok(conv, 201);
  }

  if (method === "get" && path.startsWith("/api/conversations/") && path.endsWith("/messages")) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const items = db.messages
      .filter((m) => m.conversationId === id)
      .map((m) => ({ ...m, sender: publicUser(db.users.find((u) => u.id === m.senderId)) }));
    items.forEach((m) => {
      if (!m.readBy.includes(me.id)) m.readBy.push(me.id);
    });
    saveDb(db);
    return ok(items);
  }

  if (method === "post" && path.startsWith("/api/conversations/") && path.endsWith("/messages")) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    const conv = db.conversations.find((c) => c.id === id);
    const message = {
      id: uid("m"),
      conversationId: id,
      senderId: me.id,
      type: body.type || "text",
      text: body.text || "",
      mediaUrl: body.mediaUrl || "",
      sharedPostId: body.sharedPostId || "",
      createdAt: nowIso(),
      readBy: [me.id],
    };
    db.messages.push(message);
    conv.updatedAt = nowIso();
    conv.memberIds
      .filter((x) => x !== me.id)
      .forEach((uidTarget) => addNotification(db, uidTarget, "dm", me.id, id, `${me.username} mesaj göndərdi`));
    saveDb(db);
    return ok({ ...message, sender: publicUser(me) }, 201);
  }

  if (method === "post" && /\/api\/conversations\/.+\/typing$/.test(path)) {
    const me = requireUser(config, db);
    const id = path.split("/")[3];
    db.typing[id] = { userId: me.id, at: Date.now() };
    saveDb(db);
    return ok({ ok: true });
  }

  if (method === "get" && path === "/api/notifications") {
    const me = requireUser(config, db);
    return ok(db.notifications.filter((n) => n.userId === me.id).map((n) => ({
      ...n,
      from: publicUser(db.users.find((u) => u.id === n.fromId)),
    })));
  }

  if (method === "post" && path === "/api/notifications/read") {
    const me = requireUser(config, db);
    db.notifications.forEach((n) => {
      if (n.userId === me.id) n.read = true;
    });
    saveDb(db);
    return ok({ message: "Oxundu" });
  }

  if (method === "get" && path === "/api/notifications/settings") {
    const me = requireUser(config, db);
    const defaults = { like: true, comment: true, follow: true, mention: true, dm: true };
    return ok(db.notificationSettings[me.id] || defaults);
  }

  if (method === "put" && path === "/api/notifications/settings") {
    const me = requireUser(config, db);
    db.notificationSettings[me.id] = body;
    saveDb(db);
    return ok(body);
  }

  if (method === "get" && path === "/api/admin/stats") {
    const me = requireUser(config, db);
    if (me.role !== "admin") fail("İcazə yoxdur", 403);
    return ok({
      users: db.users.length,
      posts: db.posts.length,
      reels: db.reels.length,
      reports: db.reports.length,
      activeUsers: db.users.filter((u) => u.isActive && !u.isBanned).length,
    });
  }

  if (method === "get" && path === "/api/admin/users") {
    const me = requireUser(config, db);
    if (me.role !== "admin") fail("İcazə yoxdur", 403);
    return ok(db.users.map(publicUser));
  }

  if (method === "get" && path === "/api/admin/posts") {
    const me = requireUser(config, db);
    if (me.role !== "admin") fail("İcazə yoxdur", 403);
    return ok(db.posts.map((p) => postWithMeta(db, p, me.id)));
  }

  if (method === "post" && /\/api\/admin\/users\/.+\/ban$/.test(path)) {
    const me = requireUser(config, db);
    if (me.role !== "admin") fail("İcazə yoxdur", 403);
    const id = path.split("/")[4];
    const user = db.users.find((u) => u.id === id);
    user.isBanned = !user.isBanned;
    saveDb(db);
    return ok(publicUser(user));
  }

  if (method === "post" && path === "/api/reports") {
    const me = requireUser(config, db);
    db.reports.unshift({
      id: uid("rp"),
      fromId: me.id,
      targetType: body.targetType,
      targetId: body.targetId,
      reason: body.reason,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: "open",
    });
    saveDb(db);
    return ok({ message: "Şikayət göndərildi" });
  }

  if (method === "get" && path === "/api/reports/mine") {
    const me = requireUser(config, db);
    return ok(db.reports.filter((r) => r.fromId === me.id).slice(0, 30));
  }

  if (method === "get" && path === "/api/admin/reports") {
    const me = requireUser(config, db);
    if (me.role !== "admin") fail("İcazə yoxdur", 403);
    const status = String(config.params?.status || "open").toLowerCase();
    let rows = db.reports.slice();
    if (status && status !== "all") rows = rows.filter((r) => r.status === status);
    return ok(rows.map((r) => ({
      ...r,
      from: db.users.find((u) => u.id === r.fromId)?.username || "",
      owner: "",
      label: r.reason,
      gone: false,
    })));
  }

  if (method === "post" && path.startsWith("/api/admin/reports/") && path.endsWith("/resolve")) {
    const me = requireUser(config, db);
    if (me.role !== "admin") fail("İcazə yoxdur", 403);
    const id = path.split("/")[4];
    const report = db.reports.find((r) => r.id === id);
    if (!report) fail("Şikayət tapılmadı", 404);
    if (report.status !== "open") fail("Şikayət artıq bağlanıb", 400);
    const action = String(body.action || "").toLowerCase();
    if (!["dismissed", "remove", "ban"].includes(action)) fail("Əməliyyat tanınmır", 400);
    const stamp = nowIso();
    const touch = (row, status) => {
      row.status = status;
      row.updatedAt = stamp;
    };
    if (action === "dismissed") touch(report, "dismissed");
    else {
      db.reports
        .filter((r) => r.status === "open" && r.targetType === report.targetType && r.targetId === report.targetId)
        .forEach((r) => touch(r, action));
    }
    const pushNote = (userId, type, text) => {
      if (!userId) return;
      db.notifications = db.notifications || [];
      db.notifications.unshift({
        id: uid("nt"),
        userId,
        fromId: null,
        type,
        entityId: report.id,
        text,
        read: false,
        createdAt: stamp,
      });
    };
    const reporterText = action === "dismissed"
      ? "Şikayətinə baxıldı. Qayda pozuntusu tapılmadı."
      : action === "remove"
        ? "Şikayətinə baxıldı. Uyğunsuz kontent götürüldü."
        : "Şikayətinə baxıldı. Hesab məhdudlaşdırıldı.";
    pushNote(report.fromId, "report", reporterText);
    if (action === "remove" || action === "ban") {
      const owner = db.users.find((u) => u.id === report.targetId)
        || db.posts.find((p) => p.id === report.targetId)?.userId
        || db.reels?.find((r) => r.id === report.targetId)?.userId;
      const ownerId = typeof owner === "string" ? owner : owner?.id;
      if (ownerId && ownerId !== report.fromId) {
        pushNote(ownerId, "moderation", action === "remove"
          ? "Paylaşımın qaydalarımıza uyğun olmadığı üçün götürüldü."
          : "Hesabın məhdudlaşdırıldı.");
      }
    }
    saveDb(db);
    return ok({ id: report.id, status: report.status });
  }

  fail("Endpoint tapılmadı", 404);
}
