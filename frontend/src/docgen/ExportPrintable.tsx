
/* ------------------------- Export Printable -----------------------------
   Build a simple HTML snapshot and open it in a new window, then call print().
   This approach is dependency-free and produces a printable PDF via browser's print-to-PDF.
*/
export function exportPrintable(options: { title: string; html: string }) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    alert("Unable to open print window — check popup blocker.");
    return;
  }
  w.document.write(`
    <html>
      <head>
        <title>${options.title}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>
          body { font-family: system-ui, -apple-system, Roboto, 'Segoe UI', 'Helvetica Neue', Arial; color: #0f172a; padding: 20px; }
          h1 { color: #06b6a4; }
          .card { border-radius: 12px; border: 1px solid #e6eef0; padding: 12px; margin-bottom: 12px; }
          .row { display:flex; justify-content:space-between; }
        </style>
      </head>
      <body>
        ${options.html}
        <script>
          // Delay print slightly so the window has a moment to render.
          setTimeout(()=>{ window.print(); }, 200);
        </script>
      </body>
    </html>
  `);
  w.document.close();
}
