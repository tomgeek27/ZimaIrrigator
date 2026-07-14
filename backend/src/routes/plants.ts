import type { FastifyInstance } from 'fastify';
import { getPlantsSnapshot } from '../state.ts';
import { registerClient } from '../broadcast.ts';

export async function plantsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/plants', async () => getPlantsSnapshot());

  fastify.get('/ws', { websocket: true }, (socket) => {
    registerClient(socket);
    socket.send(JSON.stringify({ type: 'INIT', data: getPlantsSnapshot() }));
  });
}
