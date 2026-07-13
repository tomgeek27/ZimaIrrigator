import postgres from 'postgres';

const PG_URI = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/irrigation_db';

// Esportiamo l'istanza sql di tipo pool (ottimizzata per performance)
export const sql = postgres(PG_URI, {
  max: 10, // Numero massimo di connessioni nel pool
  idle_timeout: 20,
  connect_timeout: 10
});