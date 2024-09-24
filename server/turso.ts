import { createClient } from "https://esm.sh/@libsql/client@0.6.0/web";

const url = Deno.env.get("TURSO_DATABASE_URL")
const authToken = Deno.env.get("TURSO_AUTH_TOKEN")

console.log("TursoDB is", authToken && url)
export const turso = url && authToken && createClient({ url, authToken });