import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const fallbackPortal = "https://municipiopitangueiraspr-arch.github.io/inteligencia-municipal/?portal=fornecedor";
const portalUrl = Deno.env.get("SUPPLIER_PORTAL_URL") || fallbackPortal;
const allowedOrigins = new Set<string>([new URL(portalUrl).origin, "http://localhost:5173", "http://127.0.0.1:5173"]);

type AccessRequest = {
  id: string;
  auth_user_id: string | null;
  representante_email: string;
  representante_nome: string;
  razao_social: string;
  cnpj: string;
  status: string;
  station_id: string | null;
  review_notes: string | null;
};

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

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return json(request, { error: "Origem não autorizada." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(origin) });
  if (request.method !== "POST") return json(request, { error: "Método não permitido." }, 405);

  let notificationId: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;
  try {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json(request, { error: "Sessão autenticada obrigatória." }, 401);

    const body = await request.json().catch(() => null);
    const requestId = typeof body?.request_id === "string" ? body.request_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return json(request, { error: "request_id inválido." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || request.headers.get("apikey");
    if (!supabaseUrl || !serviceKey || !anonKey) throw new Error("Configuração Supabase incompleta na Edge Function.");

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const user = userData.user;
    if (userError || !user) return json(request, { error: "Sessão inválida ou expirada." }, 401);

    admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: accessRequest, error: requestError } = await admin
      .from("fleet_station_access_requests")
      .select("id,auth_user_id,representante_email,representante_nome,razao_social,cnpj,status,station_id,review_notes")
      .eq("id", requestId)
      .maybeSingle();
    if (requestError) throw requestError;
    const row = accessRequest as AccessRequest | null;
    if (!row) return json(request, { error: "Solicitação não encontrada." }, 404);

    // O cliente não escolhe o tipo de mensagem, o destinatário nem o estado. Estes
    // são derivados do registro persistido e do papel do usuário autenticado.
    let notificationType: "PRIMEIRO_ACESSO_RECEBIDO" | "ACESSO_LIBERADO" | "PRIMEIRO_ACESSO_NEGADO";
    if (row.status === "PENDENTE" && row.auth_user_id === user.id) {
      notificationType = "PRIMEIRO_ACESSO_RECEBIDO";
    } else if (row.status === "APROVADO" || row.status === "NEGADO") {
      const { data: isManager, error: managerError } = await userClient.rpc("fleet_is_manager", {});
      if (managerError) throw managerError;
      if (isManager !== true) return json(request, { error: "Somente o gestor municipal pode enviar o resultado da análise." }, 403);
      notificationType = row.status === "APROVADO" ? "ACESSO_LIBERADO" : "PRIMEIRO_ACESSO_NEGADO";
    } else {
      return json(request, { error: "Ação de notificação não autorizada para este estado." }, 403);
    }

    const { data: notification, error: notificationError } = await admin
      .from("fleet_station_email_notifications")
      .select("id,recipient_email,notification_type")
      .eq("request_id", requestId)
      .eq("notification_type", notificationType)
      .eq("status", "PENDENTE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (notificationError) throw notificationError;
    if (!notification) return json(request, { ok: true, already_processed: true, notification_type: notificationType });
    notificationId = notification.id;

    const gmailUser = Deno.env.get("GMAIL_USER") || "municipiopitangueiras.pr@gmail.com";
    const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailPassword) throw new Error("GMAIL_APP_PASSWORD não configurada no Supabase.");

    let subject = "Prefeitura de Pitangueiras — Pedido de Primeiro Acesso recebido";
    let text = `Olá, ${row.representante_nome}.\n\nA Prefeitura Municipal de Pitangueiras recebeu o Pedido de Primeiro Acesso do estabelecimento ${row.razao_social} (CNPJ ${row.cnpj}).\n\nO pedido será analisado pelo Gestor de Frotas. Você receberá uma nova comunicação quando houver uma decisão.\n\nEsta é uma mensagem automática. Não responda a este e-mail.`;

    if (notificationType === "ACESSO_LIBERADO") {
      const { data: station } = row.station_id
        ? await admin.from("fleet_fuel_stations").select("status,credenciamento_started_at,credenciamento_ends_at").eq("id", row.station_id).maybeSingle()
        : { data: null };
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const activeNow = station?.status === "ATIVO"
        && Boolean(station.credenciamento_started_at)
        && station.credenciamento_started_at <= today
        && (!station.credenciamento_ends_at || station.credenciamento_ends_at >= today);
      subject = "Prefeitura de Pitangueiras — Resultado do Pedido de Primeiro Acesso";
      text = activeNow
        ? `Olá, ${row.representante_nome}.\n\nSeu Pedido de Primeiro Acesso para o estabelecimento ${row.razao_social} foi aprovado. O posto está ativo e dentro da vigência, portanto o acesso ao Portal do Posto está liberado.\n\nAcesse: ${portalUrl}\n\nUse o e-mail desta solicitação e a senha definida ao criar sua conta.\n\nEsta é uma mensagem automática. Não responda a este e-mail.`
        : `Olá, ${row.representante_nome}.\n\nSeu Pedido de Primeiro Acesso para o estabelecimento ${row.razao_social} foi aprovado e seu vínculo foi criado. O portal ficará disponível quando o Município ativar o estabelecimento e a vigência do credenciamento estiver em curso.\n\nAcesse: ${portalUrl}\n\nEsta é uma mensagem automática. Não responda a este e-mail.`;
    } else if (notificationType === "PRIMEIRO_ACESSO_NEGADO") {
      subject = "Prefeitura de Pitangueiras — Resultado do Pedido de Primeiro Acesso";
      text = `Olá, ${row.representante_nome}.\n\nO Pedido de Primeiro Acesso do estabelecimento ${row.razao_social} não foi aprovado neste momento.\n\nObservação do Gestor: ${row.review_notes || "Entre em contato com a Prefeitura para obter orientações."}\n\nEsta é uma mensagem automática. Não responda a este e-mail.`;
    }

    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPassword } });
    await transporter.sendMail({ from: `Prefeitura de Pitangueiras <${gmailUser}>`, to: notification.recipient_email || row.representante_email, subject, text });
    const { error: sentError } = await admin.rpc("fleet_update_email_notification", {
      p_id: notificationId,
      p_status: "ENVIADO",
      p_error: null,
    });
    if (sentError) throw sentError;
    return json(request, { ok: true, notification_type: notificationType });
  } catch (error) {
    if (notificationId && admin) {
      await admin.rpc("fleet_update_email_notification", {
        p_id: notificationId,
        p_status: "ERRO",
        p_error: error instanceof Error ? error.message.slice(0, 500) : "Falha no envio",
      }).catch(() => undefined);
    }
    return json(request, { error: error instanceof Error ? error.message : "Falha ao enviar o e-mail." }, 500);
  }
});
