import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const fallbackPortal = "https://municipiopitangueiraspr-arch.github.io/inteligencia-municipal/";
const portalUrl = Deno.env.get("MUNICIPAL_PORTAL_URL") || fallbackPortal;
const allowedOrigins = new Set<string>([new URL(portalUrl).origin, "http://localhost:5173", "http://127.0.0.1:5173"]);
const profiles = new Set(["ADMIN", "PREFEITO", "SECRETARIO", "ADMINISTRATIVO"]);

type JsonBody = Record<string, unknown>;
type SupabaseClient = ReturnType<typeof createClient>;

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

async function markManagerRequestFailed(
  serviceClient: SupabaseClient | null,
  requestId: string | null,
  authUserId: string | null,
  reason: string,
) {
  if (!serviceClient || !requestId) return;
  await serviceClient.rpc("municipal_module_invite_request_fail", {
    p_request_id: requestId,
    p_auth_user_id: authUserId,
    p_failure_reason: reason,
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return json(request, { error: "Origem não autorizada." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return json(request, { error: "Método não permitido." }, 405);

  let invitedUserId: string | null = null;
  let managerRequestId: string | null = null;
  let managerRequest = false;
  let serviceClient: SupabaseClient | null = null;

  try {
    const token = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json(request, { error: "Sessão autenticada obrigatória." }, 401);
    const parsedBody = await request.json().catch(() => null);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return json(request, { error: "Corpo JSON inválido." }, 400);
    }
    const body = parsedBody as JsonBody;
    if (Object.prototype.hasOwnProperty.call(body, "password")) {
      return json(request, { error: "Senhas não podem ser definidas pelo solicitante; o usuário receberá convite individual." }, 400);
    }

    managerRequest = body.request_type === "health_manager_invite";
    const name = typeof body.nome === "string" ? body.nome.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const roleId = typeof body.role_id === "string" ? body.role_id.trim() : "";
    const orgUnitId = typeof body.org_unit_id === "string" ? body.org_unit_id.trim() : "";
    if (name.length < 2 || name.length > 160) return json(request, { error: "Informe o nome completo do usuário." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json(request, { error: "Informe um e-mail válido." }, 400);
    }

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

    serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    if (managerRequest) {
      if (isAdmin === true) {
        return json(request, { error: "O Admin do Sistema deve usar o fluxo global de convites." }, 403);
      }
      if (!roleId || !orgUnitId) return json(request, { error: "Selecione o papel e a unidade dentro do seu escopo." }, 400);

      const { data: preparedRequestId, error: prepareError } = await userClient.rpc("municipal_module_invite_request_prepare", {
        p_name: name,
        p_email: email,
        p_role_id: roleId,
        p_org_unit_id: orgUnitId,
      });
      if (prepareError) {
        const status = prepareError.code === "42501" ? 403 : prepareError.code === "23505" ? 409 : 400;
        const message = prepareError.code === "23505"
          ? prepareError.message
          : prepareError.code === "42501"
            ? "Você não tem autorização para convidar nesta unidade ou neste módulo."
            : prepareError.message;
        return json(request, { error: message }, status);
      }
      if (typeof preparedRequestId !== "string" || !preparedRequestId) {
        throw new Error("O pedido de convite não foi registrado corretamente.");
      }
      managerRequestId = preparedRequestId;

      const redirectTo = Deno.env.get("MUNICIPAL_PORTAL_URL") || fallbackPortal;
      const { data: invitation, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { nome: name, full_name: name, cadastro_por_convite: true, senha_configurada: false },
      });
      if (inviteError || !invitation.user) {
        await markManagerRequestFailed(serviceClient, managerRequestId, null, "Não foi possível enviar o convite por e-mail.");
        return json(request, { error: inviteError?.message || "Não foi possível enviar o convite por e-mail." }, 400);
      }
      invitedUserId = invitation.user.id;

      const { error: finalizeError } = await serviceClient.rpc("municipal_module_invite_request_finalize", {
        p_request_id: managerRequestId,
        p_auth_user_id: invitedUserId,
      });
      if (finalizeError) throw finalizeError;

      return json(request, {
        ok: true,
        invitation_sent: true,
        approval_required: true,
        request_id: managerRequestId,
      });
    }

    if (isAdmin !== true) return json(request, { error: "Acesso administrativo obrigatório." }, 403);

    const profile = typeof body.perfil_municipal === "string" ? body.perfil_municipal : "";
    const secretariatIds = stringIds(body.secretariat_ids);
    const moduleIds = stringIds(body.module_ids);
    const assignmentModuleIds = stringIds(body.assignment_module_ids) || moduleIds;
    if (!profiles.has(profile)) return json(request, { error: "Perfil municipal inválido." }, 400);
    if (!secretariatIds || !moduleIds) return json(request, { error: "Listas de secretarias e módulos inválidas." }, 400);
    if (!orgUnitId || !roleId || !assignmentModuleIds) {
      return json(request, { error: "A unidade, o papel e os módulos da atribuição são obrigatórios." }, 400);
    }

    const { error: assignmentValidationError } = await userClient.rpc("municipal_governance_validate_assignment", {
      p_role_id: roleId,
      p_module_ids: assignmentModuleIds,
    });
    if (assignmentValidationError) return json(request, { error: assignmentValidationError.message }, 400);

    const { data: existing, error: existingError } = await serviceClient.from("usuarios")
      .select("id,uuid,perfil").ilike("email", email).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return json(request, { error: "Este e-mail já está registrado. Não é possível reutilizar a identidade existente por este fluxo." }, 409);
    }

    if (secretariatIds.length > 0) {
      const { data: knownSecretariats, error: secretariatError } = await serviceClient
        .from("municipal_secretariats").select("id").in("id", secretariatIds);
      if (secretariatError) throw secretariatError;
      if ((knownSecretariats || []).length !== secretariatIds.length) {
        return json(request, { error: "Uma ou mais secretarias selecionadas não existem mais. Atualize a tela e tente novamente." }, 400);
      }
    }
    if (moduleIds.length > 0) {
      const { data: knownModules, error: moduleError } = await serviceClient
        .from("municipal_modules").select("id").in("id", moduleIds);
      if (moduleError) throw moduleError;
      if ((knownModules || []).length !== moduleIds.length) {
        return json(request, { error: "Um ou mais módulos selecionados não existem mais. Atualize a tela e tente novamente." }, 400);
      }
    }

    const { data: knownOrgUnit, error: orgUnitError } = await serviceClient.from("municipal_org_units")
      .select("id").eq("id", orgUnitId).eq("is_active", true).maybeSingle();
    if (orgUnitError) throw orgUnitError;
    if (!knownOrgUnit) return json(request, { error: "A unidade organizacional selecionada não existe mais ou está inativa." }, 400);
    const { data: knownRole, error: roleError } = await serviceClient.from("municipal_roles")
      .select("id").eq("id", roleId).eq("is_active", true).maybeSingle();
    if (roleError) throw roleError;
    if (!knownRole) return json(request, { error: "O papel selecionado não existe mais ou está inativo." }, 400);
    if (assignmentModuleIds.length > 0) {
      const { data: knownAssignmentModules, error: assignmentModuleError } = await serviceClient.from("municipal_modules")
        .select("id").in("id", assignmentModuleIds);
      if (assignmentModuleError) throw assignmentModuleError;
      if ((knownAssignmentModules || []).length !== assignmentModuleIds.length) {
        return json(request, { error: "Um dos módulos da atribuição não existe mais." }, 400);
      }
    }

    const redirectTo = Deno.env.get("MUNICIPAL_PORTAL_URL") || fallbackPortal;
    const { data: invitation, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { nome: name, full_name: name, cadastro_por_convite: true, senha_configurada: false },
    });
    if (inviteError || !invitation.user) {
      return json(request, { error: inviteError?.message || "Não foi possível enviar o convite individual." }, 400);
    }
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
    const { error: assignmentError } = await serviceClient.rpc("municipal_governance_register_invited_assignment", {
      p_auth_user_id: invitation.user.id,
      p_org_unit_id: orgUnitId,
      p_role_id: roleId,
      p_module_ids: assignmentModuleIds,
    });
    if (assignmentError) throw assignmentError;
    return json(request, { ok: true, invitation_sent: true, user_id: registration, perfil_municipal: profile });
  } catch (error) {
    if (managerRequest && managerRequestId) {
      await markManagerRequestFailed(serviceClient, managerRequestId, invitedUserId, "O convite foi enviado, mas não foi possível finalizar seu registro; o acesso permanece bloqueado.");
      if (invitedUserId) {
        return json(request, {
          error: "O convite por e-mail foi enviado, mas houve falha ao vincular o pedido de aprovação. O acesso permanece bloqueado; contate o Admin do Sistema.",
          invitation_sent: true,
          approval_required: true,
          registration_pending: true,
          request_id: managerRequestId,
        }, 202);
      }
      return json(request, { error: error instanceof Error ? error.message : "Falha ao preparar o pedido de convite." }, 500);
    }
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
