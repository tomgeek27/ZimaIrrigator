import type { FastifyInstance } from 'fastify';
import { plantsCache } from '../state.ts';
import { registerClient } from '../broadcast.ts';

export async function plantsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/plants', async () => plantsCache);

  fastify.get('/ws', { websocket: true }, (socket) => {
    registerClient(socket);
    socket.send(JSON.stringify({ type: 'INIT', data: plantsCache }));
  });
}
