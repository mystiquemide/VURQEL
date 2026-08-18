export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 26"
      className={className}
      role="img"
      aria-label="Vurqel"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* A provenance path that resolves to a single node: the Vurqel mark. */}
      <path d="M3 3 L20 23 L37 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" />
      <circle cx="3" cy="3" r="2.6" fill="currentColor" />
      <circle cx="37" cy="3" r="2.6" fill="currentColor" />
      <circle cx="20" cy="23" r="3.3" fill="currentColor" />
    </svg>
  );
}
