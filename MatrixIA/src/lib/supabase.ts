import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://qgkjnzcqjhhqdgxmvtew.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFna2puemNxamhocWRneG12dGV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTI1MjUsImV4cCI6MjA4NjQ4ODUyNX0.Ee1kDJBXVIvR_H27N_dtaBgya4q6qLyJfyCLCZOKnFw";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type MunicipalProfile = "ADMIN" | "PREFEITO" | "SECRETARIO" | "OPERADOR" | "ADMINISTRATIVO";
export type MatrixExperience = "mayor" | "secretary" | "operator";

export type MatrixUser = {
  id: string;
  email: string;
  name: string;
  profile: MunicipalProfile;
  experience: MatrixExperience;
};

export function experienceForProfile(profile?: string | null): MatrixExperience {
  if (profile === "PREFEITO") return "mayor";
  if (profile === "SOLICITANTE" || profile === "ESTAGIARIO" || profile === "OPERADOR") return "operator";
  return "secretary";
}

export async function loadMunicipalUser(userId: string, email?: string | null): Promise<MatrixUser> {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, uuid, nome, email, perfil, perfil_municipal")
    .eq("uuid", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const profile = (data?.perfil_municipal ?? data?.perfil ?? "ADMINISTRATIVO") as MunicipalProfile;
  return {
    id: userId,
    email: data?.email ?? email ?? "",
    name: data?.nome ?? data?.email ?? email ?? "Usuário autenticado",
    profile,
    experience: profile === "ADMIN" ? "mayor" : experienceForProfile(profile),
  };
}
