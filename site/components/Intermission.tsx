import { Reveal } from "./Reveal";

export function Intermission() {
  return (
    <section id="intermission" className="relative flex min-h-[92svh] items-center overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: "url(/img/intermission.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(1) contrast(1.06) brightness(0.5)",
        }}
      />
      <div aria-hidden="true" className="absolute inset-0" style={{ background: "rgba(14,14,12,0.62)" }} />

      <Reveal className="gutter relative w-full text-paper">
        <span className="label" style={{ color: "rgba(244,242,236,0.72)" }}>
          07 / Intermission
        </span>
        <h2 className="display mt-6 text-[clamp(3rem,14vw,13rem)] text-accent">EXPOSED</h2>
        <p className="mt-6 max-w-[44ch] text-lg" style={{ color: "rgba(244,242,236,0.86)" }}>
          One compromised package. One build. One provable path, held together by a single commit SHA.
        </p>
      </Reveal>
    </section>
  );
}
