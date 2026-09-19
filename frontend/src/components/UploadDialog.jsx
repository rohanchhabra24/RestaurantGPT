import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Check } from "lucide-react";
import Icon from "./Icon.jsx";
import MappingReview from "./MappingReview.jsx";
import Modal from "./Modal.jsx";
import MorphButton from "./MorphButton.jsx";
import { api } from "../api.js";

const STAGES = ["Uploaded", "Generating embeddings…", "Indexed"];

export default function UploadDialog({ onClose, onIndexed }) {
  const [files, setFiles] = useState([]);
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [docType, setDocType] = useState("sla");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [impactReport, setImpactReport] = useState(null);
  const [pendingMapping, setPendingMapping] = useState(null);
  const inputRef = useRef(null);

  function pickFiles(list) {
    setFiles(Array.from(list));
    setStage(0);
    setError(null);
  }

  async function handleIndex() {
    if (files.length === 0) return;
    setBusy(true);
    setStage(1);
    setError(null);
    try {
      for (const file of files) {
        if (file.name.toLowerCase().endsWith(".csv")) {
          const result = await api.uploadOrders(file);
          if (result.status === "mapping_required") {
            // New export format for this restaurant — nothing was inserted.
            // Pause here and let the operator review before importing;
            // handleIndex isn't re-entered until confirmMapping finishes.
            setPendingMapping({ file, ...result });
            setBusy(false);
            return;
          }
        } else {
          const result = await api.uploadDocument(file, docType, effectiveDate);
          if (result.impact_report) setImpactReport(result.impact_report);
        }
      }
      setStage(2);
      onIndexed?.();
    } catch (e) {
      setError(String(e.message || e));
      setStage(0);
    } finally {
      setBusy(false);
    }
  }

  async function confirmMapping(finalMapping) {
    if (!pendingMapping) return;
    setBusy(true);
    setError(null);
    try {
      await api.confirmOrdersMapping(pendingMapping.file, pendingMapping.profile_id, finalMapping);
      setPendingMapping(null);
      setStage(2);
      onIndexed?.();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (pendingMapping) {
    return (
      <Modal onClose={onClose} title={`Review column mapping — ${pendingMapping.file.name}`} width={640}>
        <div className="dialog-body" style={{ gap: 0 }}>
          {error && <div className="tag tag-danger" style={{ marginBottom: 14 }}>{error}</div>}
          <MappingReview
            headers={pendingMapping.headers}
            sampleRows={pendingMapping.sample_rows}
            proposedMapping={pendingMapping.proposed_mapping}
            busy={busy}
            onConfirm={confirmMapping}
            onCancel={() => setPendingMapping(null)}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Upload operational data" width={560}>
        <div className="dialog-body" style={{ gap: 0 }}>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFiles(e.dataTransfer.files);
            }}
            style={{
              border: "1.5px dashed var(--color-divider)",
              borderRadius: "var(--radius-md)",
              padding: "40px 26px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              textAlign: "center",
              background: "color-mix(in srgb, var(--color-accent) 6%, transparent)",
              cursor: "pointer",
            }}
          >
            <Icon name="upload" size={28} style={{ color: "var(--color-accent)", marginBottom: 4 }} />
            <div style={{ fontSize: 15, fontWeight: 500 }}>Drag CSV, PDF or text files here, or click to browse</div>
            <div className="dim" style={{ fontSize: 12 }}>Order logs (.csv), SLA policies (.pdf/.md/.txt)</div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".csv,.pdf,.md,.txt"
              hidden
              onChange={(e) => pickFiles(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
              {files.map((f) => (
                <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--color-bg)", borderRadius: "var(--radius-sm)" }}>
                  <Icon name="file" size={15} />
                  <span className="mono" style={{ flex: 1, fontSize: 13 }}>{f.name}</span>
                  <span className="tag tag-neutral">{f.name.split(".").pop().toUpperCase()}</span>
                  <span className="dim" style={{ fontSize: 12 }}>{(f.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
          )}

          {files.some((f) => !f.name.toLowerCase().endsWith(".csv")) && (
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)} style={{ flex: 1 }}>
                <option value="sla">SLA policy</option>
                <option value="compensation">Compensation schedule</option>
                <option value="other">Other</option>
              </select>
              <input
                type="date"
                className="input"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          )}

          {error && (
            <div className="tag tag-danger" style={{ marginTop: 14 }}>{error}</div>
          )}

          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <AnimatePresence mode="popLayout">
              {STAGES.map((label, i) => (
                <motion.span key={label} layout style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {i > 0 && <span className="dim" style={{ fontSize: 12 }} aria-hidden="true">→</span>}
                  <motion.span
                    initial={{ opacity: 0.3 }}
                    animate={{ opacity: i <= stage ? 1 : 0.35 }}
                    className={i < stage ? "tag tag-accent" : i === stage && busy ? "tag tag-outline" : "tag tag-neutral"}
                    style={{ gap: 5 }}
                  >
                    {i < stage && <Icon name="check" size={10} />}
                    {label}
                  </motion.span>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>

          {impactReport && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
              style={{ marginTop: 16, borderColor: impactReport.financial_delta < 0 ? "var(--color-danger)" : "var(--color-accent)" }}
            >
              <div className="card-kicker">Policy Change Impact — last {impactReport.window_days} days replayed</div>
              <p style={{ fontSize: 13.5, margin: "6px 0 0", lineHeight: 1.6 }}>
                Under the new version, <strong>{impactReport.orders_eligible_new}</strong> of {impactReport.orders_evaluated} cancelled
                orders would be compensation-eligible (was {impactReport.orders_eligible_old}) — total recoverable moves from
                ₹{impactReport.total_amount_old.toFixed(0)} to ₹{impactReport.total_amount_new.toFixed(0)}.
              </p>
              <div style={{ marginTop: 8 }}>
                <span className={`tag ${impactReport.financial_delta < 0 ? "tag-danger" : "tag-accent"}`}>
                  {impactReport.financial_delta >= 0 ? "+" : ""}₹{impactReport.financial_delta.toFixed(0)} / {impactReport.window_days}d
                </span>
              </div>
            </motion.div>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <MorphButton
            iconA={Upload}
            iconB={Check}
            active={stage === 2}
            label={busy ? "Indexing…" : stage === 2 ? "Indexed" : "Index files"}
            disabled={files.length === 0 || busy}
            onClick={handleIndex}
            primary
          />
        </div>
    </Modal>
  );
}
