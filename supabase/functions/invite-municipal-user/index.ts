import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const fallbackPortal = "https://municipiopitangueiraspr-arch.github.io/inteligencia-municipal/";
const portalUrl = Deno.env.get("MUNICIPAL_PORTAL_URL") || fallbackPortal;
const allowedOrigins = new Set<string>([new URL(portalUrl).origin, "http://localhost:5173", "http://127.0.0.1:5173"]);
const profiles = new Set(["ADMIN", "PREFEITO", "SECRETARIO", "ADMINISTRATIVO"]);

function headers(origin: string | null): HeadersInit {
  const value: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) value["Access-Control-Allow-Origin"] = origin;
  return value;
}
function json(request: Request, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: headers(request.headers.get("Origin")) });
}
function stringIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length > 100)) return null;
  return [...new Set(value as string[])];
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return json(request, { error: "Origem não autorizada." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return json(request, { error: "Método não permitido." }, 405);

  let invitedUserId: string | null = null;
  let serviceClient: ReturnType<typeof createClient> | null = null;
  try {
    const token = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json(request, { error: "Sessão autenticada obrigatória." }, 401);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(request, { error: "Corpo JSON inválido." }, 400);
    if (Object.prototype.hasOwnProperty.call(body, "password")) return json(request, { error: "Senhas não podem ser definidas pelo administrador; o usuário receberá convite individual." }, 400);
    const name = typeof body.nome === "string" ? body.nome.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const profile = typeof body.perfil_municipal === "string" ? body.perfil_municipal : "";
    const secretariatIds = stringIds(body.secretariat_ids);
    const moduleIds = stringIds(body.module_ids);
    if (name.length < 2 || name.length > 160) return json(request, { error: "Informe o nome completo do usuário." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(request, { error: "Informe um e-mail válido." }, 400);
    if (!profiles.has(profile)) return json(request, { error: "Perfil municipal inválido." }, 400);
    if (!secretariatIds || !moduleIds) return json(request, { error: "Listas de secretarias e módulos inválidas." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || request.headers.get("apikey");
    if (!supabaseUrl || !serviceKey || !anonKey) throw new Error("Configuração Supabase incompleta na Edge Function.");
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json(request, { error: "Sessão inválida ou expirada." }, 401);
    const { data: isAdmin, error: adminCheckError } = await userClient.rpc("municipal_governance_is_admin");
    if (adminCheckError) throw adminCheckError;
    if (isAdmin !== true) return json(request, { error: "Acesso administrativo obrigatório." }, 403);

    serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: existing, error: existingError } = await serviceClient.from("usuarios")
      .select("id,uuid,perfil").ilike("email", email).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return json(request, { error: "Este e-mail já está registrado. Não é possível reutilizar a identidade existente por este fluxo." }, 409);

    if (secretariatIds.length > 0) {
      const { data: knownSecretariats, error: secretariatError } = await serviceClient
        .from("municipal_secretariats").select("id").in("id", secretariatIds);
      if (secretariatError) throw secretariatError;
      if ((knownSecretariats || []).length !== secretariatIds.length) return json(request, { error: "Uma ou mais secretarias selecionadas não existem mais. Atualize a tela e tente novamente." }, 400);
    }
    if (moduleIds.length > 0) {
      const { data: knownModules, error: moduleError } = await serviceClient
        .from("municipal_modules").select("id").in("id", moduleIds);
      if (moduleError) throw moduleError;
      if ((knownModules || []).length !== moduleIds.length) return json(request, { error: "Um ou mais módulos selecionados não existem mais. Atualize a tela e tente novamente." }, 400);
    }

    const redirectTo = Deno.env.get("MUNICIPAL_PORTAL_URL") || fallbackPortal;
    const { data: invitation, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { nome: name, full_name: name, cadastro_por_convite: true, senha_configurada: false },
    });
    if (inviteError || !invitation.user) return json(request, { error: inviteError?.message || "Não foi possível enviar o convite individual." }, 400);
    invitedUserId = invitation.user.id;

    const { data: registration, error: registrationError } = await serviceClient.rpc("municipal_governance_register_invited_user", {
      p_auth_user_id: invitation.user.id,
      p_name: name,
      p_email: email,
      p_profile: profile,
      p_secretariat_ids: secretariatIds,
      p_module_ids: moduleIds,
    });
    if (registrationError) throw registrationError;
    return json(request, { ok: true, invitation_sent: true, user_id: registration, perfil_municipal: profile });
  } catch (error) {
    if (invitedUserId) {
      return json(request, {
        error: "O convite pode ter sido enviado, mas não foi possível concluir os vínculos cadastrais. A conta foi mantida para não invalidar o link; verifique a lista de usuários antes de tentar novamente.",
        invitation_sent: true,
        registration_pending: true,
        user_id: invitedUserId,
      }, 202);
    }
    return json(request, { error: error instanceof Error ? error.message : "Falha ao criar convite municipal." }, 500);
  }
});
