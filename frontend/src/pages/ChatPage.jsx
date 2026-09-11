import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../components/Icon.jsx";
import AnswerCard from "../components/AnswerCard.jsx";
import SourceDrawer from "../components/SourceDrawer.jsx";
import { api } from "../api.js";

const EXAMPLE_PROMPTS = [
  { icon: "clock", kicker: "Diagnostic", title: "Why did delivery times spike in Zone 3?", body: "Multi-hop: quantifies the spike, finds what correlates with it, then checks policy." },
  { icon: "file", kicker: "Policy lookup", title: "Which cancelled orders qualify for SLA compensation?", body: "Cites the exact SLA clause behind every eligibility call." },
  { icon: "route", kicker: "Compound", title: "Which of yesterday's cancellations in Zone 3 are compensation-eligible?", body: "Joins order data with policy text in a single answer." },
  { icon: "clock", kicker: "Trend", title: "What was our average delivery time last week?", body: "A pure data question — routed straight to the SQL engine." },
];

export default function ChatPage() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [drawerCitation, setDrawerCitation] = useState(null);
  const [compensation, setCompensation] = useState(null);
  const [compBusy, setCompBusy] = useState(false);
  const [filingClaims, setFilingClaims] = useState(false);
  const threadEndRef = useRef(null);

  useEffect(() => {
    api.listConversations().then(setConversations).catch(() => {});
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openConversation(id) {
    setActiveId(id);
    const msgs = await api.getMessages(id);
    setMessages(msgs);
  }

  async function startNewConversation() {
    const conv = await api.createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setMessages([]);
  }

  async function send(content) {
    if (!content.trim() || sending) return;
    let convId = activeId;
    if (!convId) {
      const conv = await api.createConversation();
      setConversations((prev) => [conv, ...prev]);
      convId = conv.id;
      setActiveId(convId);
    }
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content, citations: [] }]);
    setDraft("");
    setSending(true);
    try {
      const reply = await api.sendMessage(convId, content);
      setMessages((prev) => [...prev, reply]);
    } catch (e) {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: `Something went wrong: ${e.message}`, citations: [] }]);
    } finally {
      setSending(false);
    }
  }

  async function checkCompensation() {
    setCompBusy(true);
    try {
      const result = await api.runCompensationSweep();
      setCompensation(result);
    } catch {
      setCompensation(null);
    } finally {
      setCompBusy(false);
    }
  }

  async function fileAllClaims() {
    if (!compensation?.drafted_claims?.length) return;
    setFilingClaims(true);
    try {
      await Promise.all(compensation.drafted_claims.map((c) => api.submitClaim(c.claim_id)));
      setCompensation((prev) => (prev ? { ...prev, filed: true } : prev));
    } finally {
      setFilingClaims(false);
    }
  }

  const recoverableCount = compensation?.drafted_claims?.length ?? 0;
  const recoverableTotal = compensation?.total_recoverable ?? 0;

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ width: 240, flex: "none", borderRight: "1px solid var(--color-divider)", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4, overflow: "auto" }}>
        <button type="button" className="btn btn-secondary btn-block" style={{ justifyContent: "flex-start", marginBottom: 10 }} onClick={startNewConversation}>
          <Icon name="plus" size={14} />New query
        </button>
        {conversations.map((c) => (
          <a
            key={c.id}
            href="#"
            className="row-hover"
            onClick={(e) => { e.preventDefault(); openConversation(c.id); }}
            style={{
              display: "flex", gap: 8, alignItems: "flex-start", padding: 8, borderRadius: "var(--radius-md)",
              textDecoration: "none", fontSize: 13, lineHeight: 1.35,
              color: c.id === activeId ? "var(--color-accent-100)" : "var(--color-text)",
              background: c.id === activeId ? "var(--color-accent-900)" : "transparent",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", marginTop: 5, background: c.id === activeId ? "var(--color-accent)" : "transparent", border: c.id === activeId ? "none" : "1.3px solid var(--color-neutral-600)" }} />
            {c.title || "Untitled query"}
          </a>
        ))}
        {conversations.length === 0 && <div className="dim" style={{ marginTop: 24, fontSize: 12.5, padding: "0 8px" }}>No queries yet — ask something to get started.</div>}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {activeId && (
          <AnimatePresence>
            {compBusy || compensation ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ flex: "none", overflow: "hidden", background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", borderBottom: "1px solid var(--color-divider)" }}
              >
                <div style={{ padding: "12px 40px", display: "flex", alignItems: "center", gap: 12 }}>
                  <motion.span animate={{ opacity: [1, 0.55, 1], scale: [1, 0.85, 1] }} transition={{ duration: 2, repeat: Infinity }} style={{ color: "var(--color-accent)", display: "inline-flex" }}>
                    <Icon name="bell" size={16} />
                  </motion.span>
                  <span style={{ fontSize: 13, flex: 1 }}>
                    {compBusy ? (
                      "Checking recent cancellations against the SLA…"
                    ) : recoverableCount > 0 ? (
                      <><strong style={{ fontWeight: 600 }}>Compensation Recovery:</strong> {recoverableCount} drafted claims, ~₹{recoverableTotal.toFixed(0)} recoverable.</>
                    ) : (
                      "No new compensation-eligible cancellations found."
                    )}
                  </span>
                  {!compBusy && recoverableCount > 0 && (
                    compensation.filed ? (
                      <span className="tag tag-accent" style={{ gap: 5 }}><Icon name="check" size={10} />Filed</span>
                    ) : (
                      <>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => send("Which of yesterday's cancellations are eligible for compensation, and why?")}>
                          Explain
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ fontSize: 12.5 }} onClick={fileAllClaims} disabled={filingClaims}>
                          {filingClaims ? "Filing…" : `File ${recoverableCount} claims`}
                        </button>
                      </>
                    )
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        )}

        {messages.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: 40, minWidth: 0 }}>
            <div style={{ textAlign: "center", maxWidth: 480, display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ margin: 0 }}>Ask anything about your operations.</h2>
              <p className="dim" style={{ margin: 0, fontSize: 14 }}>Every answer traces back to an order ID or a policy section — verify it yourself, don't just trust it.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(260px, 300px))", gap: 14 }}>
              {EXAMPLE_PROMPTS.map((p) => (
                <div key={p.title} className="card elev-sm" style={{ cursor: "pointer" }} onClick={() => send(p.title)}>
                  <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name={p.icon} size={12} />{p.kicker}</div>
                  <div className="card-title">{p.title}</div>
                  <p className="card-body">{p.body}</p>
                </div>
              ))}
            </div>
            {!activeId && (
              <button type="button" className="btn btn-secondary" onClick={checkCompensation}>
                Check for recoverable compensation
              </button>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, overflow: "auto", padding: "28px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: 640, background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: "12px 16px", fontSize: 14 }}>
                  {m.content}
                </div>
              ) : (
                <AnswerCard key={m.id} message={m} onCiteClick={setDrawerCitation} />
              )
            )}
            {sending && (
              <div className="dim" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>Routing → retrieving → verifying…</motion.span>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
        )}

        <div style={{ flex: "none", borderTop: "1px solid var(--color-divider)", padding: "16px 40px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Ask about orders, cancellations, SLAs…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(draft)}
            />
            <button type="button" className="btn btn-primary btn-icon" aria-label="Send" onClick={() => send(draft)} disabled={sending}>
              <Icon name="send" size={15} />
            </button>
          </div>
          <div className="dim" style={{ fontSize: 11 }}>Press <kbd>⏎</kbd> to send</div>
        </div>
      </div>

      <SourceDrawer citation={drawerCitation} onClose={() => setDrawerCitation(null)} />
    </div>
  );
}
