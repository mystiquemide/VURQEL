import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Vurqel — Temporal supply-chain exposure proof";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0E0E0C",
          color: "#F4F2EC",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 27, letterSpacing: 4, textTransform: "uppercase", color: "#9A9A92" }}>
          Temporal supply-chain exposure proof
        </div>
        <div style={{ fontSize: 240, fontWeight: 800, lineHeight: 1, letterSpacing: -8 }}>Vurqel</div>
        <div style={{ display: "flex", gap: 28, fontSize: 30 }}>
          <span style={{ color: "#C0341D" }}>EXPOSED</span>
          <span style={{ color: "#9A9A92" }}>NOT_EXPOSED</span>
          <span style={{ color: "#9A9A92" }}>UNPROVEN</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
