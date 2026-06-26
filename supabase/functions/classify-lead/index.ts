const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um classificador de leads para a Embracon (administradora de consórcios brasileira: imóvel, automóvel e serviços) que recebe mensagens via WhatsApp.

Sua tarefa: ler a mensagem do cliente e:
1. Classificar a TEMPERATURA do lead:
   - "hot" (quente): demonstra urgência, pede agendamento, fala em comprar agora, menciona problema imediato (quebrou, perdeu, precisa hoje), pergunta sobre disponibilidade próxima
   - "warm" (morno): pede preço, tira dúvida sobre produtos/planos de saúde, demonstra interesse mas sem urgência
   - "cold" (frio): apenas curiosidade, comentário genérico, "vou pensar", primeiro contato vago

2. Explicar em 1 frase curta o motivo (em português).

3. Sugerir uma resposta curta, cordial e que avance a conversa para um agendamento. Se o contexto incluir nome e valor/interesse do cliente, a resposta DEVE seguir EXATAMENTE este modelo (substituindo apenas NOME e VALOR):
"Olá, NOME! 👋 Aqui é o atendimento da *Embracon*. Você entrou em contato conosco e queremos te ajudar a realizar o seu sonho🏡🚗

Vi aqui que você tem interesse em *VALOR* — me confirma se está correto? Posso te enviar agora as opções de carta e parcela que mais se encaixam no seu perfil?"
Se não souber o valor, mantenha a linha "Vi aqui que você tem interesse em *VALOR*..." apenas com o valor que conseguir inferir da mensagem, ou omita se não houver nenhuma pista.

Responda SEMPRE em JSON válido com esta estrutura exata:
{"temperature": "hot|warm|cold", "reasoning": "...", "suggested_reply": "..."}`;

function aiHeaders(geminiApiKey: string, lovableApiKey: string) {
  return geminiApiKey
    ? { Authorization: `Bearer ${geminiApiKey}`, "Content-Type": "application/json" }
    : { "Lovable-API-Key": lovableApiKey, "Content-Type": "application/json" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message, system_prompt, name, interest } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
    if (!GEMINI_API_KEY && !LOVABLE_API_KEY) throw new Error("Nenhuma chave de IA configurada");
    const url = GEMINI_API_KEY
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const model = GEMINI_API_KEY ? "gemini-2.5-flash" : "google/gemini-2.5-flash";

    const finalSystemPrompt = system_prompt || SYSTEM_PROMPT;

    const r = await fetch(url, {
      method: "POST",
      headers: aiHeaders(GEMINI_API_KEY, LOVABLE_API_KEY),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: finalSystemPrompt },
          { role: "user", content: message },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("AI gateway error", r.status, t);
      if (r.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso da IA atingido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (r.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos em Lovable Cloud." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI ${r.status}: ${t}`);
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { temperature: string; reasoning: string; suggested_reply: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { temperature: "warm", reasoning: "Não foi possível interpretar a resposta da IA.", suggested_reply: content };
    }
    if (!["hot", "warm", "cold"].includes(parsed.temperature)) parsed.temperature = "warm";

    // Se o chamador informou nome e interesse do lead, força o modelo de saudação exato.
    const leadName = name && typeof name === "string" ? String(name).trim() : "";
    const leadInterest = interest && typeof interest === "string" ? String(interest).trim() : "";
    if (leadName) {
      const firstName = leadName.split(/\s+/)[0] || "tudo bem";
      const interestLine = leadInterest
        ? `Vi aqui que você tem interesse em *${leadInterest}* — me confirma se está correto? `
        : "";
      parsed.suggested_reply =
        `Olá, ${firstName}! 👋 Aqui é o atendimento da *Embracon*. ` +
        `Você entrou em contato conosco e queremos te ajudar a realizar o seu sonho🏡🚗\n\n` +
        interestLine +
        `Posso te enviar agora as opções de carta e parcela que mais se encaixam no seu perfil?`;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (e: any) {
    console.error("classify-lead error", e);
    return new Response(JSON.stringify({ error: e.message ?? "erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
