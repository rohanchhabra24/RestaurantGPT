const BASE = "/api";

// Set by authContext.jsx whenever the Supabase session changes. Kept as a
// module-level value rather than threaded through every api.js call site —
// there's exactly one active session per tab, and every request needs it.
let currentAccessToken = null;

export function setAccessToken(token) {
  currentAccessToken = token;
}

async function request(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (currentAccessToken) headers["Authorization"] = `Bearer ${currentAccessToken}`;

  const res = await fetch(`${BASE}${path}`, { headers, ...options });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json();
}

export const onboardingApi = {
  me: () => request("/onboarding/me"),
  createRestaurant: (name) =>
    request("/onboarding/restaurant", { method: "POST", body: JSON.stringify({ name }) }),
};

export const api = {
  listConversations: () => request("/conversations"),
  createConversation: () => request("/conversations", { method: "POST" }),
  deleteConversation: (conversationId) => request(`/conversations/${conversationId}`, { method: "DELETE" }),
  getMessages: (conversationId) => request(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId, content) =>
    request(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  listSources: () => request("/ingest/sources"),
  listFlaggedChunks: () => request("/ingest/flagged"),
  approveFlaggedChunk: (chunkId) => request(`/ingest/flagged/${chunkId}/approve`, { method: "POST" }),
  removeFlaggedChunk: (chunkId) => request(`/ingest/flagged/${chunkId}`, { method: "DELETE" }),
  listPolicyImpactReports: () => request("/ingest/policy-impact-reports"),
  uploadOrders: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/ingest/orders", { method: "POST", body: form });
  },
  confirmOrdersMapping: (file, profileId, mapping) => {
    const form = new FormData();
    form.append("file", file);
    form.append("profile_id", profileId);
    form.append("mapping_json", JSON.stringify({ mappings: mapping }));
    return request("/ingest/orders/confirm", { method: "POST", body: form });
  },
  uploadDocument: (file, docType, effectiveDate) => {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    form.append("effective_date", effectiveDate);
    return request("/ingest/documents", { method: "POST", body: form });
  },

  runCompensationSweep: () => request("/compensation/sweep", { method: "POST" }),
  listCompensationClaims: (status) => request(`/compensation/claims${status ? `?status=${status}` : ""}`),
  submitClaim: (claimId) => request(`/compensation/claims/${claimId}/submit`, { method: "POST" }),

  getInsightsSummary: () => request("/insights/summary"),
  getOperationsSummary: () => request("/insights/operations"),
  getOrderTrends: (range, from, to) => {
    const params = new URLSearchParams({ range });
    if (range === "custom" && from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    return request(`/insights/order-trends?${params.toString()}`);
  },

  listOrders: (filter = "all", limit = 100) => request(`/orders?filter=${filter}&limit=${limit}`),
  searchOrders: (q, limit = 8) => request(`/orders?filter=all&limit=${limit}&q=${encodeURIComponent(q)}`),

  runAnomalyScan: () => request("/diagnostics/scan", { method: "POST" }),
  listDiagnosisCards: (status) => request(`/diagnostics/cards${status ? `?status=${status}` : ""}`),
  markCardReviewed: (cardId) => request(`/diagnostics/cards/${cardId}/mark-reviewed`, { method: "POST" }),
};
