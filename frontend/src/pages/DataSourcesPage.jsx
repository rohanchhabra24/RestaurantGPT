import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Icon from "../components/Icon.jsx";
import UploadDialog from "../components/UploadDialog.jsx";
import { api } from "../api.js";

// Replaces the mockup's standalone "data pipeline" screen — that screen was
// a decorative animated diagram with no click target. The same idea (data
// flowing into the two stores) survives here as a compact status widget;
// everything else on this page is a real, actionable source list instead.
function FlowWidget({ orderCount, chunkCount }) {
  return (
    <div className="card" style={{ flexDirection: "row", alignItems: "center", gap: 24, padding: "18px 24px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
        <span className="dim">Your orders</span>
        <strong>{orderCount} on file</strong>
      </div>
      <svg width="90" height="24" style={{ flex: "none" }}>
        <path d="M2,12 H88" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="6 6" style={{ animation: "rgpt-flow 1s linear infinite", opacity: 0.8 }} />
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
        <Icon name="check" size={14} style={{ color: "var(--color-accent)" }} /> Ready to answer questions
      </div>
      <div style={{ width: 1, height: 28, background: "var(--color-divider)" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
        <span className="dim">Your policies</span>
        <strong>{chunkCount} sections</strong>
      </div>
      <svg width="90" height="24" style={{ flex: "none" }}>
        <path d="M2,12 H88" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="6 6" style={{ animation: "rgpt-flow 1.3s linear infinite", opacity: 0.6 }} />
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
        <Icon name="check" size={14} style={{ color: "var(--color-accent)" }} /> Ready to answer questions
      </div>
    </div>
  );
}

// Stage: Live Feed data source — a daily pull instead of a one-off upload.
// Defaults to this backend's own built-in synthetic demo feed (see
// docs/live-feed-data-source.md) so it works with zero configuration;
// "Change source" lets an operator point it at a real external feed URL
// instead, without touching any other part of the sync mechanism.
function LiveFeedCard({ liveFeed, onSync, syncing, syncResult, syncError, onSaveUrl, savingUrl }) {
  const [editing, setEditing] = useState(false);
  const [urlDraft, setUrlDraft] = useState(liveFeed?.configured_url || "");

  if (!liveFeed) return null;

  async function save() {
    await onSaveUrl(urlDraft.trim() || null);
    setEditing(false);
  }

  return (
    <div className="card elev-sm" style={{ marginTop: 8, gap: 10 }}>
      <div className="wrap-header-row">
        <div className="wrap-header-row-main">
          <Icon name="bolt" size={22} style={{ color: "var(--color-accent)", flex: "none" }} />
          <div style={{ minWidth: 0 }}>
            <div className="card-title">Live Feed</div>
            <div className="dim" style={{ fontSize: 12 }}>
              {liveFeed.using_default_feed ? "Using the built-in demo feed" : `Connected to ${liveFeed.configured_url}`}
              {liveFeed.last_synced_date ? ` · last synced ${liveFeed.last_synced_date}` : " · not synced yet"}
              {` · ${liveFeed.orders_from_feed} orders imported from it so far`}
            </div>
          </div>
        </div>
        <div className="wrap-header-row-actions">
          <button type="button" className="btn btn-secondary" style={{ fontSize: 12.5 }} onClick={onSync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Change source"}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="https://your-feed.example.com/orders (leave blank to use the built-in demo feed)"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
          />
          <button type="button" className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={save} disabled={savingUrl}>
            {savingUrl ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {syncError && <div className="tag tag-danger" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px" }}>{syncError}</div>}
      {syncResult && !syncError && (
        <div className="tag tag-accent" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px", gap: 5 }}>
          <Icon name="check" size={10} />
          {syncResult.synced
            ? `Imported ${syncResult.new_orders} new order${syncResult.new_orders === 1 ? "" : "s"} for ${syncResult.date}`
            : syncResult.reason === "already synced"
              ? `Already up to date for ${syncResult.date}`
              : syncResult.reason}
        </div>
      )}

      <p className="dim" style={{ fontSize: 11, margin: 0 }}>
        Pulls the previous day's orders automatically the first time anyone opens this page
        each day — "Sync now" runs it on demand. Point it at your own aggregator export API
        any time by changing the source above.
      </p>
    </div>
  );
}

export default function DataSourcesPage() {
  const [sources, setSources] = useState(null);
  const [flagged, setFlagged] = useState([]);
  const [impactReports, setImpactReports] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [savingUrl, setSavingUrl] = useState(false);
  const [autoSyncedToday, setAutoSyncedToday] = useState(false);

  function refresh() {
    api.listSources().then(setSources).catch(() => {});
    api.listFlaggedChunks().then(setFlagged).catch(() => {});
    api.listPolicyImpactReports().then(setImpactReports).catch(() => {});
  }

  // "Every morning" from the operator's point of view: the first time
  // anyone opens this page in a given day, quietly try a sync in the
  // background (it's a no-op if today's already been done — see
  // live_feed_sync.py) rather than requiring a manual click every day.
  useEffect(() => {
    if (autoSyncedToday) return;
    setAutoSyncedToday(true);
    api.syncLiveFeed().then((result) => {
      if (result.synced) refresh();
    }).catch(() => {});
  }, [autoSyncedToday]);

  async function runSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await api.syncLiveFeed();
      setSyncResult(result);
      if (result.synced) refresh();
    } catch (e) {
      setSyncResult(null);
      setSyncError(`Couldn't sync: ${e.message || e}`);
    } finally {
      setSyncing(false);
    }
  }

  async function saveLiveFeedUrl(url) {
    setSavingUrl(true);
    try {
      await api.configureLiveFeed(url);
      refresh();
    } finally {
      setSavingUrl(false);
    }
  }

  async function approve(chunkId) {
    await api.approveFlaggedChunk(chunkId);
    refresh();
  }

  async function remove(chunkId) {
    await api.removeFlaggedChunk(chunkId);
    refresh();
  }

  useEffect(refresh, []);

  const chunkCount = sources?.documents?.reduce((sum, d) => sum + Number(d.chunk_count || 0), 0) ?? 0;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "32px clamp(16px, 6vw, 40px)", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Data Sources</h2>
          <p className="dim" style={{ margin: "4px 0 0", fontSize: 13 }}>What RestaurantGPT is reading from, and when it was last updated.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setUploadOpen(true)}>
          <Icon name="upload" size={14} />Upload data
        </button>
      </div>

      {sources && <FlowWidget orderCount={sources.orders.count} chunkCount={chunkCount} />}

      <div>
        <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }} className="dim">Order data</div>
        <div className="card elev-sm" style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Icon name="file" size={22} style={{ color: "var(--color-accent)" }} />
          <div style={{ flex: 1 }}>
            <div className="card-title">Uploaded order history</div>
            <div className="dim" style={{ fontSize: 12 }}>
              {sources ? `${sources.orders.count} orders` : "…"}
              {sources?.orders.last_synced && ` · last updated ${new Date(sources.orders.last_synced).toLocaleString()}`}
            </div>
          </div>
          <span className="tag tag-accent">Up to date</span>
        </div>
        <LiveFeedCard
          liveFeed={sources?.live_feed}
          onSync={runSync}
          syncing={syncing}
          syncResult={syncResult}
          syncError={syncError}
          onSaveUrl={saveLiveFeedUrl}
          savingUrl={savingUrl}
        />
      </div>

      <div>
        <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }} className="dim">Policy documents</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {sources?.documents?.length ? sources.documents.map((d) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card elev-sm" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Icon name="file" size={20} style={{ color: "var(--color-accent)" }} />
              <div style={{ flex: 1 }}>
                <div className="card-title">{d.source_name}</div>
                <div className="dim" style={{ fontSize: 12 }}>{d.doc_type} · version {d.version} · effective {d.effective_date} · {d.chunk_count} sections indexed</div>
              </div>
              {Number(d.flagged_count) > 0 && (
                <span className="tag tag-danger">{d.flagged_count} need review</span>
              )}
            </motion.div>
          )) : (
            <div className="dim" style={{ fontSize: 13 }}>No policy documents uploaded yet.</div>
          )}
        </div>
      </div>

      {impactReports.length > 0 && (
        <div>
          <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }} className="dim">Policy change impact history</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {impactReports.map((r) => (
              <div key={r.id} className="card elev-sm" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Icon name="route" size={18} style={{ color: "var(--color-accent)" }} />
                <div style={{ flex: 1 }}>
                  <div className="card-title">
                    {r.old_source_name ? `v${r.old_version} → v${r.new_version}` : `${r.new_source_name} (first version)`}
                  </div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    {r.orders_eligible_old} → {r.orders_eligible_new} eligible orders over {r.orders_evaluated} scanned
                  </div>
                </div>
                <span className={`tag ${Number(r.financial_delta) < 0 ? "tag-danger" : "tag-accent"} mono`}>
                  {Number(r.financial_delta) >= 0 ? "+" : ""}₹{Number(r.financial_delta).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {flagged.length > 0 && (
        <div>
          <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-danger)" }}>
            Needs your review — flagged as suspicious
          </div>
          <p className="dim" style={{ margin: "4px 0 8px", fontSize: 12.5, maxWidth: 620 }}>
            This text was automatically held back when it was uploaded and won't be used to
            answer questions until you review it — it's never used as-is.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {flagged.map((f) => (
              <div key={f.id} className="card elev-sm" style={{ borderColor: "var(--color-danger)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div className="dim mono" style={{ fontSize: 11 }}>{f.source_name} · {f.section_label}</div>
                  <span className="tag tag-danger">{f.flag_reason}</span>
                </div>
                <p style={{ fontSize: 12.5, margin: "8px 0", color: "var(--color-text-dim)", whiteSpace: "pre-wrap" }}>{f.chunk_text.slice(0, 240)}{f.chunk_text.length > 240 ? "…" : ""}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => approve(f.id)}>Approve — this is fine</button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12, color: "var(--color-danger)" }} onClick={() => remove(f.id)}>Remove this text</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} onIndexed={refresh} />}
    </div>
  );
}
