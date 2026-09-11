import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "./Icon.jsx";
import { api } from "../api.js";

const STAGES = ["Uploaded", "Processing", "Indexed"];

export default function UploadDialog({ onClose, onIndexed }) {
  const [files, setFiles] = useState([]);
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [docType, setDocType] = useState("sla");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
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
    try {
      for (const file of files) {
        if (file.name.toLowerCase().endsWith(".csv")) {
          await api.uploadOrders(file);
        } else {
          await api.uploadDocument(file, docType, effectiveDate);
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

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width: 560 }}>
        <div className="dialog-title">Upload operational data</div>
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
              padding: 26,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              textAlign: "center",
              background: "color-mix(in srgb, var(--color-accent) 6%, transparent)",
              cursor: "pointer",
            }}
          >
            <Icon name="upload" size={26} style={{ color: "var(--color-accent)" }} />
            <div style={{ fontSize: 14 }}>Drag CSV, PDF or text files here, or click to browse</div>
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

          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <AnimatePresence mode="popLayout">
              {STAGES.map((label, i) => (
                <motion.span
                  key={label}
                  layout
                  initial={{ opacity: 0.3 }}
                  animate={{ opacity: i <= stage ? 1 : 0.35 }}
                  className={i < stage ? "tag tag-accent" : i === stage && busy ? "tag tag-outline" : "tag tag-neutral"}
                  style={{ gap: 5 }}
                >
                  {i < stage && <Icon name="check" size={10} />}
                  {label}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={files.length === 0 || busy} onClick={handleIndex}>
            {busy ? "Indexing…" : "Index files"}
          </button>
        </div>
      </div>
    </div>
  );
}
