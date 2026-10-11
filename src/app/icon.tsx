// Brand app icon (2026-07-02): generated from the brand config so each
// per-client deploy gets its own favicon (DP / TJD) with the accent green,
// replacing the default Next favicon. Served by Next at /icon.

import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16a34a",
          borderRadius: 14,
          color: "#ffffff",
          fontSize: BRAND.initials.length > 2 ? 22 : 28,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {BRAND.initials}
      </div>
    ),
    size,
  );
}
