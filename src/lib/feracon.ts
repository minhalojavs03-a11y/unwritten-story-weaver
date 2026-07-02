// Sistema single-tenant Feracon.
// Todos os funcionários compartilham este tenant. Isolamento é por ROLE, não por tenant.
export const FERACON_TENANT_ID = "9ecb99e2-50ee-404f-920b-81cd94cc685e";

// Superadmin invisível: Arley não deve aparecer em listas, relatórios, rankings,
// distribuição, coaching ou seletores operacionais da Feracon.
export const HIDDEN_FERACON_USER_IDS = new Set([
  "6216d5c1-5b32-4660-acc5-66f844f77f11",
  // Kauana Lorensetti — desligada da equipe
  "d04f1f89-23f4-425b-9a17-64fc858ce4ae",
]);

export const HIDDEN_FERACON_MEMBER_IDS = new Set([
  "f966c55d-ba6f-4d01-9bb0-532cc903667a",
  // Kauana Lorensetti — desligada da equipe
  "5d5ea7ab-b080-4e4f-8a09-88f419d47cc0",
]);

export function normalizeHiddenFeraconText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isHiddenFeraconIdentity(value: unknown) {
  const text = normalizeHiddenFeraconText(value);
  return text.includes("arley") || text.includes("sparckonmeta") || text.includes("kauana");
}

export function isHiddenFeraconUserId(id: unknown) {
  return typeof id === "string" && HIDDEN_FERACON_USER_IDS.has(id);
}

export function isHiddenFeraconMemberId(id: unknown) {
  return typeof id === "string" && HIDDEN_FERACON_MEMBER_IDS.has(id);
}

export function isHiddenFeraconPerson(person: Record<string, unknown> | null | undefined) {
  if (!person) return false;
  if (isHiddenFeraconUserId(person.id) || isHiddenFeraconUserId(person.user_id)) return true;
  if (isHiddenFeraconMemberId(person.id) || isHiddenFeraconMemberId(person.member_id)) return true;
  return [
    person.display_name,
    person.full_name,
    person.username,
    person.email,
    person.name,
  ].some(isHiddenFeraconIdentity);
}
