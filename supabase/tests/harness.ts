// A Supabase-shaped Postgres for tests: PGlite (real Postgres compiled to WASM)
// plus the pieces of Supabase the migrations rely on — the auth schema,
// auth.uid() driven by the request JWT claim, and the anon / authenticated /
// service_role roles with Supabase's default grants. Every migration in
// supabase/migrations is applied in order, so tests exercise the real SQL and
// the real RLS policies.

import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

export type Role = "anon" | "authenticated" | "service_role";

export async function createSupabaseLikeDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(readFileSync(MIGRATIONS_DIR + file, "utf8"));
  }
  return db;
}

/** Runs `fn` inside a transaction as `role`, with auth.uid() returning `userId`. */
export async function as<T>(db: PGlite, role: Role, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    return fn(tx);
  });
}

export async function expectPgError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!pattern.test(message)) throw new Error(`Expected error matching ${pattern}, got: ${message}`);
    return;
  }
  throw new Error(`Expected error matching ${pattern}, but the statement succeeded`);
}
