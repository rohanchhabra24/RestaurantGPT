import * as DialogPrimitive from "@radix-ui/react-dialog";

// Shared shell for this app's hand-rolled-CSS modals (UploadDialog,
// UserMenu's Settings dialog) — built on Radix's unstyled dialog
// primitives rather than plain <div>s so focus trapping, Escape-to-close,
// and aria wiring (role="dialog", aria-modal, labelledby/describedby) come
// for free instead of needing to be hand-implemented, while keeping the
// exact same .dialog-backdrop/.dialog/.dialog-title theme.css classes and
// visual result this app already uses everywhere else. (The Tailwind/
// shadcn ui/dialog.jsx wrapper elsewhere in this app does the same job for
// LandingPage's Tailwind-styled surfaces — this is that same idea for the
// theme.css-styled rest of the app.)
//
// Radix's Overlay and Content render as PORTALED SIBLINGS (not
// parent/child the way the old plain <div class="dialog-backdrop"><div
// class="dialog"> nesting was), which is also what fixes the same
// backdrop-filter containing-block bug the manual createPortal calls this
// replaces were added for (see git history) — Radix's Portal already
// renders to document.body. Content centers itself via fixed positioning
// instead of relying on a flex parent to center it, since it no longer
// has one.
export default function Modal({ onClose, title, width = 480, style, children }) {
  return (
    <DialogPrimitive.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-backdrop" />
        <DialogPrimitive.Content
          className="dialog"
          // Neither dialog using this shell has a one-line summary that
          // wouldn't just repeat the title or the body content sitting
          // right below it — explicitly opting out (Radix's documented
          // escape hatch) rather than inventing filler text just to
          // satisfy the "missing Description" dev warning.
          aria-describedby={undefined}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width,
            zIndex: 51,
            ...style,
          }}
        >
          <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
