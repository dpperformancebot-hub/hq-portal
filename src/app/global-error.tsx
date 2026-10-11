"use client";

// Catches errors in the root layout itself. Must render its own html/body
// and cannot rely on theme providers, so styles are inline and minimal.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fbfaf7", color: "#1a1a1f" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ fontSize: 13, color: "#6b6b75", margin: "0 0 16px" }}>{error.message || "The app failed to load."}</p>
            <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e2da", background: "#fff", cursor: "pointer" }}>
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
