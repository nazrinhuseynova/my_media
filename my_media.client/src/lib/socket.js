import * as signalR from "@microsoft/signalr";

const API = (process.env.REACT_APP_API_URL || "http://localhost:5017").replace(/\/$/, "");

const listeners = {};
let chatHub;
let noteHub;
let chatReady = Promise.resolve();
let noteReady = Promise.resolve();
let heartbeatTimer = 0;

export function onSocket(event, handler) {
  listeners[event] = listeners[event] || [];
  listeners[event].push(handler);
  return () => {
    listeners[event] = (listeners[event] || []).filter((h) => h !== handler);
  };
}

function fire(event, payload) {
  (listeners[event] || []).forEach((handler) => handler(payload));
}

export function emitSocket(event, payload) {
  fire(event, payload);
}

export function connectSocket() {
  const token = localStorage.getItem("pulse_token");
  if (!token) {
    return { connected: false, disconnect() {}, joinConversation() {}, typing() {} };
  }

  if (!chatHub || chatHub.state === signalR.HubConnectionState.Disconnected) {
    chatHub = new signalR.HubConnectionBuilder()
      .withUrl(`${API}/hubs/chat`, { accessTokenFactory: () => localStorage.getItem("pulse_token") || "" })
      .withAutomaticReconnect()
      .build();
    chatHub.on("message", (p) => fire("message", p));
    chatHub.on("messageDeleted", (p) => fire("messageDeleted", p));
    chatHub.on("messagesRead", (p) => fire("messagesRead", p));
    chatHub.on("typing", (p) => fire("typing", p));
    chatHub.on("presence", (p) => fire("presence", p));
    chatReady = chatHub.start().then(() => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        if (chatHub?.state === signalR.HubConnectionState.Connected) {
          chatHub.invoke("Heartbeat").catch(() => {});
        }
      }, 25000);
    }).catch(() => {});
  }

  if (!noteHub || noteHub.state === signalR.HubConnectionState.Disconnected) {
    noteHub = new signalR.HubConnectionBuilder()
      .withUrl(`${API}/hubs/notifications`, { accessTokenFactory: () => localStorage.getItem("pulse_token") || "" })
      .withAutomaticReconnect()
      .build();
    noteHub.on("notify", (p) => fire("notify", p));
    noteReady = noteHub.start().catch(() => {});
  }

  return {
    connected: true,
    async joinConversation(id) {
      if (!id) return;
      await chatReady;
      if (chatHub?.state === signalR.HubConnectionState.Connected) {
        await chatHub.invoke("JoinConversation", id);
      }
    },
    async typing(id) {
      if (!id) return;
      await chatReady;
      if (chatHub?.state === signalR.HubConnectionState.Connected) {
        await chatHub.invoke("Typing", id);
      }
    },
    disconnect() {
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = 0;
      }
      chatHub?.stop();
      noteHub?.stop();
      chatHub = null;
      noteHub = null;
    },
  };
}

export function getChatConnection() {
  return chatHub;
}
