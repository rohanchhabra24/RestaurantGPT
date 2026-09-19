import { motion } from "framer-motion";
import Icon from "./Icon.jsx";

export default function CitationTag({ citation, onClick }) {
  const cls = citation.verified ? "tag tag-accent clickable mono" : "tag tag-danger clickable mono";
  // The visible label stays the specific order/policy reference (needed to
  // tell citations apart when an answer cites several) — the plain-language
  // framing the reader actually needs ("what happens if I tap this") goes on
  // title/aria-label instead of replacing the label text.
  const action =
    citation.type === "order" ? "Tap to see the order details"
    : citation.type === "weather" ? "Tap to see the verified weather"
    : "Tap to see the policy clause";
  return (
    <motion.span
      className={cls}
      style={{ margin: "0 2px", verticalAlign: 1 }}
      onClick={() => onClick(citation)}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.96 }}
      title={action}
      role="button"
      aria-label={`${action}: ${citation.label}`}
    >
      {citation.type === "order" ? <Icon name="db" size={10} />
        : citation.type === "weather" ? <Icon name="rain" size={10} />
        : <Icon name="file" size={10} />}
      {citation.label}
    </motion.span>
  );
}
