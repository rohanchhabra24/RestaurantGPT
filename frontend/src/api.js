const BASE = "/api";

// Set by authContext.jsx whenever the Supabase session changes. Kept as a
// module-level value rather than threaded through every api.js call site —
// there's exactly one active session per tab, and every request needs it.
let currentAccessToken = null;

// Registered by authContext.jsx — a 401 means the token this module is
// holding is no longer valid (expired, revoked, or the backend's JWT
// secret rotated). Supabase's own client normally refreshes tokens
// proactively in the background, so this is specifically for the cases
// it can't catch (the refresh token itself invalid, a signature/secret
// mismatch). Until this existed, nothing reacted to a 401 at all: pages
// just kept whatever stale data they'd last rendered — indistinguishable
// from a real empty account — with no path back to a working session
// short of a manual reload, which would just resubmit the same expired
// token again.
let unauthorizedHandler = null;
let handlingUnauthorized = false;

export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

export function setAccessToken(token) {
  currentAccessToken = token;
  // A fresh token (a new sign-in, or Supabase's own background refresh
  // succeeding) means whatever unauthorized episode this was guarding
  // against is over — clear the guard so a *future* 401 can trigger the
  // handler again instead of being silently ignored for the rest of the
  // tab's lifetime.
  handlingUnauthorized = false;
}

// Dedupes identical concurrent GETs (e.g. Sidebar and DashboardPage both
// independently fetching /insights/summary on the same page load) into
// one network request instead of firing it twice — safe because GET has
// no side effects, and this only merges requests that are genuinely
// in-flight at the same time; it's not a time-based cache, so it never
// serves data staler than a fresh call would anyway. POST/PATCH/DELETE
// are never deduped.
const inFlightGets = new Map();

async function request(path, options = {}) {
  const isGet = !options.method || options.method.toUpperCase() === "GET";
  if (isGet && inFlightGets.has(path)) return inFlightGets.get(path);

  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (currentAccessToken) headers["Authorization"] = `Bearer ${currentAccessToken}`;

  const promise = (async () => {
    const res = await fetch(`${BASE}${path}`, { headers, ...options });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      // eslint-disable-next-line no-console
      console.error(`[API Error] ${res.status} ${path}:`, text);

      if (res.status === 401 && currentAccessToken && !handlingUnauthorized) {
        // Guarded so a burst of concurrent requests failing on the same
        // expired token (common — several components fetch on the same
        // page load) triggers this once, not once per request. Checking
        // currentAccessToken also skips this for a 401 that happens
        // simply because no one's signed in yet (nothing to sign out of).
        handlingUnauthorized = true;
        unauthorizedHandler?.();
      }

      let userMessage = "Something went wrong on our end. Please try again.";
      if (res.status < 500) {
        try {
          const parsed = JSON.parse(text);
          if (typeof parsed.detail === "string") userMessage = parsed.detail;
          else userMessage = "Please check your inputs and try again.";
        } catch (e) {
          userMessage = "Please check your inputs and try again.";
        }
      }
      throw new Error(userMessage);
    }
    return res.json();
  })();

  if (isGet) {
    inFlightGets.set(path, promise);
    promise.finally(() => inFlightGets.delete(path));
  }
  return promise;
}

export const onboardingApi = {
  me: () => request("/onboarding/me"),
  createRestaurant: (name) =>
    request("/onboarding/restaurant", { method: "POST", body: JSON.stringify({ name }) }),
};

export const settingsApi = {
  get: () => request("/settings"),
  // Accepts a partial — { response_language } and/or { city } — matching
  // the backend's independently-applied fields (one's a per-member
  // preference, the other per-restaurant; see settings.py).
  update: (partial) => request("/settings", { method: "PATCH", body: JSON.stringify(partial) }),
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
  syncLiveFeed: () => request("/ingest/live-feed/sync", { method: "POST" }),
  backfillLiveFeed: (days = 30) => request(`/ingest/live-feed/backfill?days=${days}`, { method: "POST" }),
  configureLiveFeed: (url) =>
    request("/ingest/live-feed/config", { method: "POST", body: JSON.stringify({ live_feed_url: url || null }) }),
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

  getCompensationDigest: () => request("/compensation/digest"),
  markDigestViewed: (digestId) => request(`/compensation/digest/${digestId}/viewed`, { method: "POST" }),
  dismissDigest: (digestId) => request(`/compensation/digest/${digestId}/dismiss`, { method: "POST" }),

  getInsightsSummary: () => request("/insights/summary"),
  getOperationsSummary: () => request("/insights/operations"),
  getKnowledgeGaps: () => request("/insights/knowledge-gaps"),
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

  setFeedback: (traceId, rating) => request(`/traces/${traceId}/feedback`, { method: "PUT", body: JSON.stringify({ rating }) }),
  clearFeedback: (traceId) => request(`/traces/${traceId}/feedback`, { method: "DELETE" }),

  runAnomalyScan: () => request("/diagnostics/scan", { method: "POST" }),
  listDiagnosisCards: (status) => request(`/diagnostics/cards${status ? `?status=${status}` : ""}`),
  markCardReviewed: (cardId) => request(`/diagnostics/cards/${cardId}/mark-reviewed`, { method: "POST" }),

  // Fire-and-forget — instrumentation must never surface an error to the
  // user or block whatever real action triggered it (see events.py's
  // record_event, which has the same never-throw contract server-side).
  track: (eventType, properties = {}) =>
    request("/events", { method: "POST", body: JSON.stringify({ event_type: eventType, properties }) }).catch(() => {}),
};
