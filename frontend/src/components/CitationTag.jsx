import { motion } from "framer-motion";
import Icon from "./Icon.jsx";

export default function CitationTag({ citation, onClick }) {
  const cls = citation.verified ? "tag tag-accent clickable mono" : "tag tag-danger clickable mono";
  return (
    <motion.span
      className={cls}
      style={{ margin: "0 2px", verticalAlign: 1 }}
      onClick={() => onClick(citation)}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.96 }}
    >
      {citation.type === "order" ? <Icon name="db" size={10} /> : <Icon name="file" size={10} />}
      {citation.label}
    </motion.span>
  );
}
