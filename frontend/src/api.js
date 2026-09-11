const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json();
}

export const api = {
  listConversations: () => request("/conversations"),
  createConversation: () => request("/conversations", { method: "POST" }),
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
  uploadDocument: (file, docType, effectiveDate) => {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    form.append("effective_date", effectiveDate);
    return request("/ingest/documents", { method: "POST", body: form });
  },

  runEval: () => request("/eval/run"),
  compareNaiveVsGrounded: (question) =>
    request("/eval/compare", { method: "POST", body: JSON.stringify({ question }) }),

  runCompensationSweep: () => request("/compensation/sweep", { method: "POST" }),
  listCompensationClaims: (status) => request(`/compensation/claims${status ? `?status=${status}` : ""}`),
  submitClaim: (claimId) => request(`/compensation/claims/${claimId}/submit`, { method: "POST" }),

  listTraces: () => request("/traces"),
  getTrace: (traceId) => request(`/traces/${traceId}`),

  runAnomalyScan: () => request("/diagnostics/scan", { method: "POST" }),
  listDiagnosisCards: (status) => request(`/diagnostics/cards${status ? `?status=${status}` : ""}`),
  markCardReviewed: (cardId) => request(`/diagnostics/cards/${cardId}/mark-reviewed`, { method: "POST" }),
};
