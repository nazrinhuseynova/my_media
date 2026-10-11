import { create } from "zustand";
import { api } from "../../../services/api";
import { connectSocket } from "../../../lib/socket";

export const useChatStore = create((set, get) => ({
  conversations: [],
  messages: [],
  activeId: "",
  typing: "",
  async loadConversations() {
    const conversations = await api.get("/api/conversations");
    set({ conversations });
  },
  async openChat(id) {
    const messages = await api.get(`/api/conversations/${id}/messages`);
    const conversations = await api.get("/api/conversations").catch(() => get().conversations);
    set({
      activeId: id,
      messages,
      conversations: (Array.isArray(conversations) ? conversations : []).map((c) => (c.id === id ? { ...c, unread: false } : c)),
    });
    connectSocket().joinConversation?.(id);
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
