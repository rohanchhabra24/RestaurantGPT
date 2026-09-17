import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon.jsx";
import AnswerCard from "../components/AnswerCard.jsx";
import SourceDrawer from "../components/SourceDrawer.jsx";
import InlineConfirm from "../components/InlineConfirm.jsx";
import { api } from "../api.js";

const EXAMPLE_PROMPTS = [
  { icon: "clock", kicker: "Figure out why", title: "Why did delivery times spike in Zone 3?", body: "Finds the spike, what's causing it, and what your policy says to do about it." },
  { icon: "file", kicker: "Check a policy", title: "Which cancelled orders qualify for SLA compensation?", body: "Points to the exact line in your policy behind every answer." },
  { icon: "route", kicker: "Money owed", title: "Which of yesterday's cancellations in Zone 3 are compensation-eligible?", body: "Combines your orders and your policy in one answer." },
  { icon: "clock", kicker: "Quick number", title: "What was our average delivery time last week?", body: "A straight lookup — no guesswork, no cross-referencing spreadsheets." },
];

// ChatPage is unmounted every time you switch to another nav tab (Dashboard,
// Data Sources, Issues — React Router swaps the route component out), so
// anything kept only in local useState — which open conversation, an
// unsent draft — was getting wiped and remounting back to the empty
// history-list view. sessionStorage survives the unmount/remount (and a
// reload, until the tab closes) without needing to lift this state up
// into a provider above <Routes> just to keep it alive across a tab switch.
const DRAFT_KEY = "rgpt-chat-draft";
const ACTIVE_ID_KEY = "rgpt-chat-active-id";

function readStorage(key) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return ""; // private browsing / blocked storage — falls back to today's behavior
  }
}

function writeStorage(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // ignore — same fallback as above
  }
}

export default function ChatPage() {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveIdState] = useState(() => readStorage(ACTIVE_ID_KEY) || null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraftState] = useState(() => readStorage(DRAFT_KEY));
  const [sending, setSending] = useState(false);

  function setActiveId(id) {
    setActiveIdState(id);
    writeStorage(ACTIVE_ID_KEY, id || "");
  }

  function setDraft(value) {
    setDraftState(value);
    writeStorage(DRAFT_KEY, value);
  }
  const [drawerCitation, setDrawerCitation] = useState(null);
  const [compensation, setCompensation] = useState(null);
  const [compBusy, setCompBusy] = useState(false);
  const [filingClaims, setFilingClaims] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [compError, setCompError] = useState(null);
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return localStorage.getItem("rgpt-chat-intro-seen") !== "1";
    } catch {
      return true;
    }
  });
  const threadEndRef = useRef(null);

  function dismissIntro() {
    setShowIntro(false);
    try {
      localStorage.setItem("rgpt-chat-intro-seen", "1");
    } catch {
      // Private browsing / blocked storage — it'll just show again next visit.
    }
  }

  useEffect(() => {
    api.listConversations().then(setConversations).catch(() => {});
  }, []);

  // Reload the previously-open conversation's messages on mount — they
  // don't persist in storage themselves (just refetched), only which
  // conversation was open does.
  useEffect(() => {
    if (!activeId) return;
    api.getMessages(activeId).then(setMessages).catch(() => setActiveId(null));
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openConversation(id) {
    setActiveId(id);
    setSidebarOpen(false);
    const msgs = await api.getMessages(id);
    setMessages(msgs);
  }

  async function startNewConversation() {
    const conv = await api.createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setMessages([]);
  }

  async function commitDeleteConversation(id) {
    try {
      await api.deleteConversation(id);
    } catch {
      setDeletingId(null); // failed — undo the optimistic dimming, leave the row in place
      return;
    }
    setDeletingId(null);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) {
      setActiveId(null);
      setMessages([]);
    }
  }

  async function send(content, source = "typed") {
    if (!content.trim() || sending) return;
    if (showIntro) dismissIntro();
    const isFirstMessage = !activeId;
    let convId = activeId;
    if (!convId) {
      const conv = await api.createConversation();
      setConversations((prev) => [conv, ...prev]);
      convId = conv.id;
      setActiveId(convId);
    }
    if (isFirstMessage) api.track("chat_message_sent", { source, is_first_message: true });
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

  // Tapping the same thumb again clears it (a "changed my mind, no
  // opinion" state, not just up<->down) — optimistic update so the tap
  // feels instant, reverted if the request actually fails.
  async function handleFeedback(message, rating) {
    const next = message.feedback === rating ? null : rating;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, feedback: next } : m)));
    try {
      if (next) await api.setFeedback(message.trace_id, next);
      else await api.clearFeedback(message.trace_id);
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, feedback: message.feedback } : m)));
    }
  }

  async function checkCompensation() {
    setCompBusy(true);
    setCompError(null);
    try {
      const result = await api.runCompensationSweep();
      setCompensation(result);
    } catch (e) {
      setCompensation(null);
      setCompError(`Couldn't check compensation: ${e.message || e}`);
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

  const todayKey = new Date().toDateString();
  const todaysConversations = conversations.filter((c) => new Date(c.created_at).toDateString() === todayKey);
  const earlierConversations = conversations.filter((c) => new Date(c.created_at).toDateString() !== todayKey);

  function renderConvRow(c) {
    const isDeleting = deletingId === c.id;
    return (
      <div key={c.id} className="conv-row" style={{ display: "flex", alignItems: "center", gap: 2, opacity: isDeleting ? 0.5 : 1 }}>
        <a
          href="#"
          className="row-hover"
          onClick={(e) => { e.preventDefault(); if (!isDeleting) openConversation(c.id); }}
          style={{
            flex: 1, minWidth: 0,
            display: "flex", gap: 8, alignItems: "flex-start", padding: 8, borderRadius: "var(--radius-md)",
            textDecoration: "none", fontSize: 13, lineHeight: 1.35,
            color: c.id === activeId ? "var(--color-accent-100)" : "var(--color-text)",
            background: c.id === activeId ? "var(--color-accent-900)" : "transparent",
            cursor: isDeleting ? "default" : "pointer",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", marginTop: 5, background: c.id === activeId ? "var(--color-accent)" : "transparent", border: c.id === activeId ? "none" : "1.3px solid var(--color-neutral-600)" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isDeleting ? "line-through" : "none" }}>{c.title || t("chat.untitledQuery")}</span>
        </a>
        <div className={isDeleting ? undefined : "conv-delete"}>
          <InlineConfirm
            label={t("chat.deleteQuery")}
            onConfirm={() => setDeletingId(c.id)}
            onCommit={() => commitDeleteConversation(c.id)}
            onUndo={() => setDeletingId(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
      <button
        type="button"
        className="btn btn-secondary btn-icon chat-sidebar-toggle"
        style={{ display: "none", position: "absolute", left: 12, top: 12, zIndex: 46 }}
        aria-label={t("nav.toggleHistory")}
        onClick={() => setSidebarOpen((v) => !v)}
      >
        <Icon name={sidebarOpen ? "x" : "menu"} size={15} />
      </button>
      {sidebarOpen && <div className="chat-sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <div className="chat-sidebar" data-open={sidebarOpen} style={{ width: 240, flex: "none", borderRight: "1px solid var(--color-divider)", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4, overflow: "auto" }}>
        <button type="button" className="btn btn-secondary btn-block" style={{ justifyContent: "flex-start", marginBottom: 10 }} onClick={startNewConversation}>
          <Icon name="plus" size={14} />{t("chat.newQuestion")}
        </button>
        {todaysConversations.length > 0 && (
          <>
            <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", padding: "10px 8px 4px" }}>{t("chat.today")}</div>
            {todaysConversations.map(renderConvRow)}
          </>
        )}
        {earlierConversations.length > 0 && (
          <>
            <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", padding: "10px 8px 4px" }}>{t("chat.earlier")}</div>
            {earlierConversations.map(renderConvRow)}
          </>
        )}
        {conversations.length === 0 && <div className="dim" style={{ marginTop: 24, fontSize: 12.5, padding: "0 8px" }}>{t("chat.emptyHistory")}</div>}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {activeId && (
          <AnimatePresence>
            {compBusy || compensation || compError ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ flex: "none", overflow: "hidden", background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", borderBottom: "1px solid var(--color-divider)" }}
              >
                <div style={{ padding: "12px clamp(16px, 6vw, 40px)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <motion.span animate={{ opacity: [1, 0.55, 1], scale: [1, 0.85, 1] }} transition={{ duration: 2, repeat: Infinity }} style={{ color: "var(--color-accent)", display: "inline-flex" }}>
                    <Icon name="bell" size={16} />
                  </motion.span>
                  <span style={{ fontSize: 13, flex: 1 }}>
                    {compBusy ? (
                      t("chat.compChecking")
                    ) : compError ? (
                      compError
                    ) : recoverableCount > 0 ? (
                      <><strong style={{ fontWeight: 600 }}>{t("chat.compOwedPrefix")}</strong> {t("chat.compOwed", { count: recoverableCount, amount: recoverableTotal.toFixed(0) })}</>
                    ) : (
                      t("chat.compNoneOwed")
                    )}
                  </span>
                  {!compBusy && recoverableCount > 0 && (
                    compensation.filed ? (
                      <span className="tag tag-accent" style={{ gap: 5 }}><Icon name="check" size={10} />{t("chat.compFiled")}</span>
                    ) : (
                      <>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => send("Which of yesterday's cancellations are eligible for compensation, and why?")}>
                          {t("chat.compExplain")}
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ fontSize: 12.5 }} onClick={fileAllClaims} disabled={filingClaims}>
                          {filingClaims ? t("chat.compFiling") : t("chat.compFileClaims", { count: recoverableCount })}
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
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "40px clamp(16px, 6vw, 40px)", minWidth: 0 }}>
            {showIntro && !activeId && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="card elev-sm"
                style={{ maxWidth: 560, flexDirection: "row", alignItems: "center", gap: 10, padding: "10px 14px", background: "color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))" }}
              >
                <Icon name="check" size={14} style={{ color: "var(--color-accent)", flex: "none" }} />
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, flex: 1 }}>
                  {t("chat.introText")}
                </p>
                <button type="button" className="btn btn-ghost btn-icon" aria-label={t("chat.dismissIntro")} onClick={dismissIntro} style={{ width: 26, height: 26, flex: "none" }}>
                  <Icon name="x" size={12} />
                </button>
              </motion.div>
            )}
            <div style={{ textAlign: "center", maxWidth: 480, display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ margin: 0 }}>{t("chat.heroTitle")}</h2>
              <p className="dim" style={{ margin: 0, fontSize: 14 }}>{t("chat.heroSubtitle")}</p>
            </div>
            <div className="example-prompts-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(260px, 300px))", gap: 14 }}>
              {EXAMPLE_PROMPTS.map((p) => (
                <div key={p.title} className="card elev-sm" style={{ cursor: "pointer" }} onClick={() => send(p.title, "starter_prompt")}>
                  <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name={p.icon} size={12} />{p.kicker}</div>
                  <div className="card-title">{p.title}</div>
                  <p className="card-body">{p.body}</p>
                </div>
              ))}
            </div>
            {!activeId && (
              <button type="button" className="btn btn-secondary" onClick={checkCompensation}>
                {t("chat.checkCompensation")}
              </button>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, overflow: "auto", padding: "28px clamp(16px, 6vw, 40px)", display: "flex", flexDirection: "column", gap: 20 }}>
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: 640, background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: "12px 16px", fontSize: 14 }}>
                  {m.content}
                </div>
              ) : (
                <AnswerCard key={m.id} message={m} onCiteClick={setDrawerCitation} onFeedback={(rating) => handleFeedback(m, rating)} />
              )
            )}
            {sending && (
              <div className="dim" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>{t("chat.sendingIndicator")}</motion.span>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
        )}

        <div style={{ flex: "none", borderTop: "1px solid var(--color-divider)", padding: "16px clamp(16px, 6vw, 40px) 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder={t("chat.inputPlaceholder")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(draft)}
            />
            <button type="button" className="btn btn-primary btn-icon" aria-label={t("chat.sendAria")} onClick={() => send(draft)} disabled={sending}>
              <Icon name="send" size={15} />
            </button>
          </div>
          <div className="dim" style={{ fontSize: 11 }}>{t("chat.pressEnter", { key: "⏎" })}</div>
        </div>
      </div>

      <SourceDrawer citation={drawerCitation} onClose={() => setDrawerCitation(null)} />
    </div>
  );
}
