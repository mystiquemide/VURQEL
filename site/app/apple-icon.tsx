import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icon: the Vurqel mark on ink, echoing the provenance-path logo.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0E0E0C",
          color: "#F4F2EC",
          fontSize: 118,
          fontWeight: 800,
          fontFamily: "serif",
          letterSpacing: -4,
        }}
      >
        V
      </div>
    ),
    { ...size },
  );
}
