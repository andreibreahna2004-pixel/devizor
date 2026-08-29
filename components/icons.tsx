/**
 * Iconitele din bara de navigatie si din antet.
 *
 * Sint scrise de mina, nu aduse dintr-o librarie: aplicatia are nevoie de zece
 * simboluri, iar o dependenta in plus ar trage cateva sute de iconite ca sa le
 * livreze pe astea. Toate deseneaza cu `currentColor` si mostenesc marimea din
 * clasa parintelui, ca starea activa sa se coloreze din CSS.
 */

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-5 w-5"}
    >
      {children}
    </svg>
  );
}

export function IconPanou(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.6" />
      <rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </Svg>
  );
}

export function IconDeviz(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 2.75h7.5L19 8.25v13H6z" />
      <path d="M13.25 3v5.5H19" />
      <path d="M9 13h7" />
      <path d="M9 17h4.5" />
    </Svg>
  );
}

export function IconFactura(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 2.75h14v18.5l-2.3-1.6-2.35 1.6-2.35-1.6-2.35 1.6L7.3 19.65 5 21.25z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </Svg>
  );
}

export function IconProiect(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 21h18" />
      <path d="M5.5 21V6.5L13 3v18" />
      <path d="M13 10h5.5v11" />
      <path d="M8.5 8.5v.01M8.5 12v.01M8.5 15.5v.01" />
    </Svg>
  );
}

export function IconClient(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9.5" cy="8" r="3.25" />
      <path d="M3.5 20a6 6 0 0 1 12 0" />
      <path d="M16.5 5.2a3.25 3.25 0 0 1 0 5.6" />
      <path d="M18 14.6a6 6 0 0 1 3 5.4" />
    </Svg>
  );
}

export function IconMaterial(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5h17v12h-17z" />
      <path d="M8 8.5V5.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3" />
      <path d="M9 14.5l2.5-2.5 2 2 2.5-2.5" />
    </Svg>
  );
}

export function IconSetari(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47.97H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.47.97z" />
    </Svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v9" />
      <path d="M6.4 6.4a8 8 0 1 0 11.2 0" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** Deviz emis — document care pleaca spre beneficiar. */
export function IconIesire(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h13" />
      <path d="M13 7l5 5-5 5" />
    </Svg>
  );
}

/** Factura emisa — bani de primit. */
export function IconIntrare(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H6" />
      <path d="M11 7l-5 5 5 5" />
    </Svg>
  );
}

export function IconBifa(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12.5l5 5 10-11" />
    </Svg>
  );
}

/** Storno — documentul se intoarce. */
export function IconStorno(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 10h12a5 5 0 0 1 0 10H9" />
      <path d="M7 6l-4 4 4 4" />
    </Svg>
  );
}

/** Sageata de trend; `jos` o intoarce. */
export function IconTrend({ jos, className }: IconProps & { jos?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
      className={className ?? "h-3 w-3"}
      style={jos ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="M6 2.2 10.6 9.2H1.4z" />
    </svg>
  );
}

export function IconSoare(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function IconLuna(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </Svg>
  );
}
