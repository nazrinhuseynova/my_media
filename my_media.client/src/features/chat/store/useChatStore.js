import { create } from "zustand";
import { api } from "../../../services/api";
import { connectSocket } from "../../../lib/socket";

export const useChatStore = create((set, get) => ({
  conversations: [],
  messages: [],
  activeId: "",
  typing: "",
  hasMoreMessages: false,
  messagePage: 1,
  async loadConversations() {
    const conversations = await api.get("/api/conversations");
    set({ conversations });
  },
  async openChat(id) {
    const raw = await api.get(`/api/conversations/${id}/messages`, { params: { page: 1, pageSize: 40 } });
    const messages = Array.isArray(raw) ? raw : (raw?.items || []);
    const conversations = await api.get("/api/conversations").catch(() => get().conversations);
    set({
      activeId: id,
      messages,
      hasMoreMessages: !!raw?.hasMore,
      messagePage: raw?.page || 1,
      conversations: (Array.isArray(conversations) ? conversations : []).map((c) => (c.id === id ? { ...c, unread: false } : c)),
    });
    connectSocket().joinConversation?.(id);
  },
  async loadOlder() {
    const id = get().activeId;
    if (!id || !get().hasMoreMessages) return;
    const next = (get().messagePage || 1) + 1;
    const raw = await api.get(`/api/conversations/${id}/messages`, { params: { page: next, pageSize: 40 } });
    const older = Array.isArray(raw) ? raw : (raw?.items || []);
    set((s) => ({
      messages: [...older.filter((m) => !s.messages.some((row) => row.id === m.id)), ...s.messages],
      hasMoreMessages: !!raw?.hasMore,
      messagePage: next,
    }));
  },
  async send(body) {
    const id = get().activeId;
    const message = await api.post(`/api/conversations/${id}/messages`, body);
    set((s) => {
      if (s.messages.some((m) => m.id === message.id)) return s;
      return { messages: [...s.messages, message] };
    });
    return message;
  },
  async typing() {
    const id = get().activeId;
    if (!id) return;
    await api.post(`/api/conversations/${id}/typing`);
  },
}));
