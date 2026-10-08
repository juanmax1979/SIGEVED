import { FINGERPRINT_PATHS } from "@espejo/shared";

export function Logo({ size = 46 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {FINGERPRINT_PATHS.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      ))}
    </svg>
  );
}
