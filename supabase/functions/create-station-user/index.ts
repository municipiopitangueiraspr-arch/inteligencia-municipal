import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const fallbackPortal = "https://municipiopitangueiraspr-arch.github.io/inteligencia-municipal/?portal=fornecedor";
const portalUrl = Deno.env.get("SUPPLIER_PORTAL_URL") || fallbackPortal;
const allowedOrigins = new Set<string>([new URL(portalUrl).origin, "http://localhost:5173", "http://127.0.0.1:5173"]);

function responseHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request: Request, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders(request.headers.get("Origin")) });
}

function localDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return json(request, { error: "Origem não autorizada." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(origin) });
  if (request.method !== "POST") return json(request, { error: "Método não permitido." }, 405);

  let invitedUserId: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;
  try {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json(request, { error: "Sessão autenticada obrigatória." }, 401);

    const body = await request.json().catch(() => null);
    const stationId = typeof body?.station_id === "string" ? body.station_id : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body?.nome === "string" ? body.nome.trim() : "";
    const phone = typeof body?.telefone === "string" ? body.telefone.trim() : null;
    const role = typeof body?.role === "string" ? body.role : "OPERADOR";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stationId)) {
      return json(request, { error: "Posto inválido." }, 400);
    }
    if (name.length < 2 || name.length > 160) return json(request, { error: "Informe o nome completo do usuário." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(request, { error: "Informe um e-mail válido." }, 400);
    if (phone && phone.length > 40) return json(request, { error: "Telefone muito longo." }, 400);
    if (!["OPERADOR", "FRENTISTA", "CAIXA_CONFERENTE"].includes(role)) {
      return json(request, { error: "O representante legal não pode criar outro representante por este fluxo." }, 400);
    }
    if (body?.password !== undefined) return json(request, { error: "Senhas não podem ser definidas pelo representante; o usuário receberá um convite individual." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || request.headers.get("apikey");
    if (!supabaseUrl || !serviceKey || !anonKey) throw new Error("Configuração Supabase incompleta na Edge Function.");

    const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json(request, { error: "Sessão inválida ou expirada." }, 401);
    admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: creator, error: creatorError } = await admin
      .from("usuarios")
      .select("id,ativo,email")
      .eq("uuid", userData.user.id)
      .maybeSingle();
    if (creatorError) throw creatorError;
    if (!creator || creator.ativo !== true) return json(request, { error: "Perfil ativo do representante não encontrado." }, 403);

    const { data: station, error: stationError } = await admin
      .from("fleet_fuel_stations")
      .select("id,municipio_id,status,credenciamento_started_at,credenciamento_ends_at,secondary_users_authorized")
      .eq("id", stationId)
      .maybeSingle();
    if (stationError) throw stationError;
    if (!station) return json(request, { error: "Posto não encontrado." }, 404);
    if (station.status !== "ATIVO" || station.secondary_users_authorized !== true) {
      return json(request, { error: "O Município ainda não autorizou o representante a administrar usuários secundários neste posto ativo." }, 403);
    }
    const today = localDate();
    if (!station.credenciamento_started_at || station.credenciamento_started_at > today
      || (station.credenciamento_ends_at && station.credenciamento_ends_at < today)) {
      return json(request, { error: "A vigência do credenciamento não permite administrar usuários neste momento." }, 403);
    }

    const { data: representative, error: memberError } = await admin
      .from("fleet_station_members")
      .select("id")
      .eq("municipio_id", station.municipio_id)
      .eq("station_id", stationId)
      .eq("usuario_id", creator.id)
      .eq("role", "REPRESENTANTE_LEGAL")
      .eq("ativo", true)
      .eq("is_primary_contact", true)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!representative) return json(request, { error: "Somente o representante legal principal pode administrar usuários do próprio posto." }, 403);

    // Convites são para novas identidades individuais. Um usuário preexistente deve
    // ser reconciliado pelo Município, nunca reutilizado silenciosamente por e-mail.
    const { data: existingProfile, error: existingProfileError } = await admin
      .from("usuarios")
      .select("id,uuid")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (existingProfileError) throw existingProfileError;
    if (existingProfile) return json(request, { error: "Este e-mail já possui uma conta. Solicite ao Município o vínculo da identidade existente; credenciais não são compartilhadas." }, 409);

    const redirectTo = Deno.env.get("SUPPLIER_PORTAL_URL") || fallbackPortal;
    const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { nome: name, perfil: `POSTO_${role}`, station_id: stationId, telefone: phone, primeiro_acesso: true, perfil_completo: false, cadastro_por_convite: true, senha_configurada: false },
    });
    if (invitationError || !invitation.user) {
      return json(request, { error: invitationError?.message || "Não foi possível enviar o convite individual." }, 400);
    }
    invitedUserId = invitation.user.id;

    const profilePayload = {
      uuid: invitation.user.id,
      nome: name,
      email,
      cargo: `Usuário do posto — ${role}`,
      perfil: `POSTO_${role}`,
      ativo: true,
      primeiro_acesso: true,
      telefone: phone,
      perfil_completo: false,
    };
    const { data: linkedProfile, error: profileLookupError } = await admin
      .from("usuarios")
      .select("id")
      .eq("uuid", invitation.user.id)
      .maybeSingle();
    if (profileLookupError) throw profileLookupError;
    let profileId = linkedProfile?.id as number | undefined;
    if (profileId) {
      const { error: profileUpdateError } = await admin.from("usuarios").update(profilePayload).eq("id", profileId);
      if (profileUpdateError) throw profileUpdateError;
    } else {
      const { data: createdProfile, error: profileInsertError } = await admin.from("usuarios").insert(profilePayload).select("id").single();
      if (profileInsertError) throw profileInsertError;
      profileId = createdProfile.id;
    }

    const { error: stationMemberError } = await admin.from("fleet_station_members").insert({
      municipio_id: station.municipio_id,
      station_id: stationId,
      usuario_id: profileId,
      role,
      ativo: true,
      is_primary_contact: false,
      granted_by: creator.id,
    });
    if (stationMemberError) throw stationMemberError;

    return json(request, { ok: true, invitation_sent: true, role });
  } catch (error) {
    if (invitedUserId && admin) {
      await admin.from("usuarios").delete().eq("uuid", invitedUserId).catch(() => undefined);
      await admin.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
    }
    return json(request, { error: error instanceof Error ? error.message : "Falha ao criar convite para usuário do posto." }, 500);
  }
});
