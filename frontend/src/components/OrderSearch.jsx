import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Search from "./Search.jsx";
import Icon from "./Icon.jsx";
import useClickOutside from "../hooks/useClickOutside.js";
import { api } from "../api.js";

/* "Look up an order" — a restaurant owner's actual reason to search
   anything in this app: a customer calls about order #4021, and the
   owner needs its status/eligibility in one motion. Global (nav-level,
   every page) rather than buried in the chat sidebar filtering past
   query titles, which nobody has a real reason to text-search. */
export default function OrderSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(0);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      api.searchOrders(query.trim()).then((rows) => {
        setResults(rows);
        setOpen(true);
      }).catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(debounceRef.current);
  }, [query]);

  useClickOutside(wrapRef, () => setOpen(false), open);

  function goToOrder(order) {
    setOpen(false);
    setQuery("");
    navigate(`/dashboard?order=${encodeURIComponent(order.aggregator_order_id)}`);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <Search value={query} onChange={setQuery} placeholder="Look up an order #" width={220} />
      {open && (
        <div className="card elev-lg" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 300, maxHeight: 320, overflow: "auto", padding: 6, zIndex: 40 }}>
          {results == null && <div className="dim" style={{ padding: 10, fontSize: 12.5 }}>Searching…</div>}
          {results && results.length === 0 && (
            <div className="dim" style={{ padding: 10, fontSize: 12.5 }}>No order matches "{query}".</div>
          )}
          {results && results.map((o) => (
            <button
              key={o.id}
              type="button"
              className="menu-item"
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}
              onClick={() => goToOrder(o)}
            >
              <span style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--color-surface-raised)" }}>
                <Icon name="route" size={12} style={{ color: "var(--color-neutral-400)" }} />
              </span>
              <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>#{o.aggregator_order_id}</div>
                <div className="dim" style={{ fontSize: 11 }}>{o.zone} · {o.platform} · {o.status}</div>
              </span>
              {o.total_amount != null && <span className="mono dim" style={{ fontSize: 12 }}>₹{o.total_amount.toFixed(0)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
