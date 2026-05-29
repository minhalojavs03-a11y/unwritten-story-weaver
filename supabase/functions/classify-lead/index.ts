const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um classificador de leads para uma administradora de consórcios brasileira (imóvel, automóvel e serviços) que recebe mensagens via WhatsApp.

Sua tarefa: ler a mensagem do cliente e:
1. Classificar a TEMPERATURA do lead:
   - "hot" (quente): demonstra urgência, pede agendamento, fala em comprar agora, menciona problema imediato (quebrou, perdeu, precisa hoje), pergunta sobre disponibilidade próxima
   - "warm" (morno): pede preço, tira dúvida sobre produtos/planos de saúde, demonstra interesse mas sem urgência
   - "cold" (frio): apenas curiosidade, comentário genérico, "vou pensar", primeiro contato vago

2. Explicar em 1 frase curta o motivo (em português).

3. Sugerir uma resposta curta, cordial e que avance a conversa para um agendamento.

Responda SEMPRE em JSON válido com esta estrutura exata:
{"temperature": "hot|warm|cold", "reasoning": "...", "suggested_reply": "..."}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message, system_prompt } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system_prompt || SYSTEM_PROMPT },
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
