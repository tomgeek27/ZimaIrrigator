import type { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/api/health', async (_request, reply) => {
    return reply.status(200).send({
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime())}s`,
      services: { server: 'up' },
    });
  });
}
