import { z } from "zod";

// Öffentliche Werte: landen im Browser-Bundle. Neue Supabase-Projekte nutzen „publishable keys“,
// ältere den „anon key“ – beides funktioniert.
const publicSchema = z.object({
  url: z.url(),
  key: z.string().min(1),
});

export function publicEnv() {
  return publicSchema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
