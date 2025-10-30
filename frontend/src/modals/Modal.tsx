import React, { useEffect } from "react";

type ModalProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  /**
   * children: render the modal content from the parent.
   * This keeps the modal generic and reusable (history UI, forms, confirmations, etc).
   */
  children?: React.ReactNode;
  /**
   * Optional: small flag to show a footer close button (default true).
   */
  showFooterClose?: boolean;
};

export function Modal({ open, title, onClose, children, showFooterClose = true }: ModalProps) {
  // close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
        data-testid="modal-backdrop"
      />

      {/* panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        className="relative z-10 max-w-xl w-full bg-white rounded-2xl shadow-lg p-6"
      >
        <div className="flex items-start justify-between mb-4">
          <h3 id="modal-title" className="text-lg font-semibold text-slate-900">
            {title ?? "Details"}
          </h3>

          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-teal-300 p-1"
            aria-label="Close modal"
            data-testid="modal-close"
          >
            Close
          </button>
        </div>

        {/* content injected by parent */}
        <div className="max-h-[60vh] overflow-auto">{children}</div>

        {/* optional footer close */}
        {showFooterClose && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded bg-slate-100 hover:bg-slate-200 transition"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
