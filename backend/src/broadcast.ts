import type { WebSocket } from 'ws';
import type { LogLevel } from './types.ts';
import { getPlantsSnapshot } from './state.ts';

const clients = new Set<WebSocket>();

export function registerClient(socket: WebSocket): void {
  clients.add(socket);
  socket.on('close', () => clients.delete(socket));
}

function broadcast(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(serialized);
    }
  }
}

export function broadcastUpdate(customData?: unknown): void {
  broadcast({ type: 'UPDATE', data: customData ?? getPlantsSnapshot() });
}

export function broadcastLog(message: string, level: LogLevel = 'info'): void {
  broadcast({
    type: 'LOG',
    data: { message, level, timestamp: Date.now() },
  });
}
