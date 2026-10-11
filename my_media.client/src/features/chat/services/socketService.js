import { connectSocket, emitSocket, onSocket } from "../../../lib/socket";

export const socketService = {
  connect: connectSocket,
  emit: emitSocket,
  on: onSocket,
};
