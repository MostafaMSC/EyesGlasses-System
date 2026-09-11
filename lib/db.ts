import { Pool } from "pg";
import type { Product } from "@/data/products";

/**
 * Postgres access for the product catalogue.
 *
 * Products used to live in each visitor's own IndexedDB, which meant a frame
 * added in the admin panel was only ever visible in the browser that added
 * it — fine for a demo, useless for a real shop. They now live here, so the
 * catalogue is the same for everyone and survives clearing browser data.
 */

/**
 * One pool for the whole server process. Next.js hot-reloads modules in
 * development, which would otherwise leak a new pool (and its connections) on
 * every edit until Postgres refused new ones.
 */
const globalForDb = globalThis as unknown as { productPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set — the product catalogue needs Postgres. See .env.example."
    );
  }
  return new Pool({
    connectionString,
    // The admin panel stores photos as data URLs, so a single row can be a
    // few hundred KB; a small pool is plenty and keeps memory predictable.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function pool(): Pool {
  if (!globalForDb.productPool) globalForDb.productPool = createPool();
  return globalForDb.productPool;
}

/**
 * Creates the table if it isn't there yet.
 *
 * Run from the API routes rather than at import time: the web container can
 * start before Postgres is accepting connections, and failing at import would
 * take the whole server down instead of just making the first request retry.
 */
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool()
      .query(
        `CREATE TABLE IF NOT EXISTS products (
           id          text PRIMARY KEY,
           data        jsonb NOT NULL,
           created_at  timestamptz NOT NULL DEFAULT now(),
           updated_at  timestamptz NOT NULL DEFAULT now()
         )`
      )
      .then(() => undefined);
    // Let the next request try again rather than caching the failure forever.
    schemaReady.catch(() => {
      schemaReady = null;
    });
  }
  return schemaReady;
}

/**
 * The whole product record is kept as one `jsonb` column rather than being
 * spread across typed columns. The shape is owned by `data/products.ts` and
 * has changed repeatedly (side photos, then a 3D model); a single document
 * means adding a field needs no migration, and nothing here queries by the
 * inner fields anyway.
 */
export async function listProducts(): Promise<Product[]> {
  await ensureSchema();
  const { rows } = await pool().query<{ data: Product }>(
    "SELECT data FROM products ORDER BY created_at ASC"
  );
  return rows.map((r) => r.data);
}

export async function upsertProduct(product: Product): Promise<void> {
  await ensureSchema();
  await pool().query(
    `INSERT INTO products (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()`,
    [product.id, product]
  );
}

export async function deleteProduct(id: string): Promise<boolean> {
  await ensureSchema();
  const { rowCount } = await pool().query("DELETE FROM products WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}

export async function countProducts(): Promise<number> {
  await ensureSchema();
  const { rows } = await pool().query<{ count: string }>("SELECT count(*) FROM products");
  return Number(rows[0]?.count ?? 0);
}
