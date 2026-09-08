import type { SVGProps } from "react";

/**
 * One icon language across the app: 24×24 box, 1.7 stroke, round caps and
 * joins, `currentColor`. Brand marks (WhatsApp, Instagram) are the exception —
 * they keep their own construction so they stay recognisable.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Stroke({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------- navigation */

export function IconSearch(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.8-4.8" />
    </Stroke>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M5 5 19 19" />
      <path d="M19 5 5 19" />
    </Stroke>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
    </Stroke>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m9 6 6 6-6 6" />
    </Stroke>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M20 12H4" />
      <path d="m10 6-6 6 6 6" />
    </Stroke>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19V8.2A1.6 1.6 0 0 1 5.6 6.6H10" />
    </Stroke>
  );
}

/* ------------------------------------------------------------------ theme */

export function IconSun(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2" />
      <path d="M12 19.2v2.2" />
      <path d="M21.4 12h-2.2" />
      <path d="M4.8 12H2.6" />
      <path d="m18.6 5.4-1.6 1.6" />
      <path d="m7 17-1.6 1.6" />
      <path d="m18.6 18.6-1.6-1.6" />
      <path d="M7 7 5.4 5.4" />
    </Stroke>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7Z" />
    </Stroke>
  );
}

/* ---------------------------------------------------------------- product */

export function IconGlasses(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="6.2" cy="14" r="3.3" />
      <circle cx="17.8" cy="14" r="3.3" />
      <path d="M9.5 13.4c1.5-.8 3.5-.8 5 0" />
      <path d="M2.9 13.2 1.4 8.8" />
      <path d="M21.1 13.2 22.6 8.8" />
    </Stroke>
  );
}

export function IconEye(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Stroke>
  );
}

export function IconCamera(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-1.6A1.5 1.5 0 0 1 9.8 4.6h4.4a1.5 1.5 0 0 1 1.3.7L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <circle cx="12" cy="13" r="3.3" />
    </Stroke>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 3.2 13.5 8 18.3 9.5 13.5 11 12 15.8 10.5 11 5.7 9.5 10.5 8Z" />
      <path d="M18.2 15.4 19 17.6l2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
    </Stroke>
  );
}

export function IconStar(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z" />
    </Stroke>
  );
}

export function IconHeart(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 20.2 4.9 13.4a4.6 4.6 0 0 1 0-6.6 4.8 4.8 0 0 1 6.7 0l.4.4.4-.4a4.8 4.8 0 0 1 6.7 0 4.6 4.6 0 0 1 0 6.6Z" />
    </Stroke>
  );
}

export function IconTag(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M11.6 3.4H20v8.4l-8.8 8.8a1.6 1.6 0 0 1-2.3 0l-6.1-6.1a1.6 1.6 0 0 1 0-2.3Z" />
      <circle cx="16.2" cy="7.8" r="1.3" />
    </Stroke>
  );
}

export function IconGem(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M6.4 3.6h11.2L21.4 9 12 20.4 2.6 9Z" />
      <path d="M2.6 9h18.8" />
      <path d="m9.4 3.6-1.6 5.4L12 20.4l4.2-11.4-1.6-5.4" />
    </Stroke>
  );
}

/* ------------------------------------------------------------------ trust */

export function IconTruck(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M1.8 7.4a1.4 1.4 0 0 1 1.4-1.4h8.4a1.4 1.4 0 0 1 1.4 1.4V16H1.8Z" />
      <path d="M13 10h4.2l3 3.2V16H13Z" />
      <circle cx="6.4" cy="18" r="1.9" />
      <circle cx="16.8" cy="18" r="1.9" />
    </Stroke>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 3 4.8 5.8v5.4c0 4.3 3 8.2 7.2 9.6 4.2-1.4 7.2-5.3 7.2-9.6V5.8Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </Stroke>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M13.2 2.6 4.8 13.4h6l-.9 8 8.4-10.8h-6Z" />
    </Stroke>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Stroke strokeWidth="2" {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Stroke>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M19 10.4c0 5-7 11-7 11s-7-6-7-11a7 7 0 0 1 14 0Z" />
      <circle cx="12" cy="10.2" r="2.6" />
    </Stroke>
  );
}

/* -------------------------------------------------------------- interface */

export function IconSliders(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M5 20v-6.4" />
      <path d="M5 9.6V4" />
      <path d="M12 20v-9.4" />
      <path d="M12 6.6V4" />
      <path d="M19 20v-3.4" />
      <path d="M19 12.6V4" />
      <circle cx="5" cy="11.6" r="1.9" />
      <circle cx="12" cy="8.6" r="1.9" />
      <circle cx="19" cy="14.6" r="1.9" />
    </Stroke>
  );
}

export function IconSort(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M7 4v16" />
      <path d="m3.6 16.6 3.4 3.4 3.4-3.4" />
      <path d="M17 20V4" />
      <path d="m13.6 7.4 3.4-3.4 3.4 3.4" />
    </Stroke>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="3.6" y="3.6" width="7" height="7" rx="2" />
      <rect x="13.4" y="3.6" width="7" height="7" rx="2" />
      <rect x="3.6" y="13.4" width="7" height="7" rx="2" />
      <rect x="13.4" y="13.4" width="7" height="7" rx="2" />
    </Stroke>
  );
}

export function IconSwitch(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M4 7.4h13.2l-3-3" />
      <path d="M20 16.6H6.8l3 3" />
    </Stroke>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M20.2 11.4a8.2 8.2 0 1 0-.6 4.4" />
      <path d="M20.4 4.6v5.2h-5.2" />
    </Stroke>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Stroke>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8Z" />
      <path d="m13.6 6.4 4 4" />
    </Stroke>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M4 6.6h16" />
      <path d="M9.4 6.6V4.8A1.4 1.4 0 0 1 10.8 3.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.8" />
      <path d="M6.4 6.6 7.2 19a1.6 1.6 0 0 0 1.6 1.5h6.4a1.6 1.6 0 0 0 1.6-1.5l.8-12.4" />
      <path d="M10.4 10.4v6" />
      <path d="M13.6 10.4v6" />
    </Stroke>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 16V4" />
      <path d="m7.4 8.6 4.6-4.6 4.6 4.6" />
      <path d="M4 16.4V19a1.6 1.6 0 0 0 1.6 1.6h12.8A1.6 1.6 0 0 0 20 19v-2.6" />
    </Stroke>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 4v12" />
      <path d="m7.4 11.4 4.6 4.6 4.6-4.6" />
      <path d="M4 20h16" />
    </Stroke>
  );
}

export function IconShare(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="18" cy="5.2" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="18.8" r="2.6" />
      <path d="m8.3 10.7 7.4-4.2" />
      <path d="m8.3 13.3 7.4 4.2" />
    </Stroke>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11.2v5" />
      <path d="M12 7.8h.01" />
    </Stroke>
  );
}

export function IconPalette(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 3.4a8.6 8.6 0 0 0 0 17.2c1.3 0 1.9-.9 1.9-1.8 0-1.5-1.3-1.8-1.3-3 0-.9.8-1.6 1.8-1.6h1.5a4.7 4.7 0 0 0 4.7-4.7c0-3.4-3.6-6.1-8.6-6.1Z" />
      <circle cx="8" cy="10.4" r="1.1" />
      <circle cx="12" cy="7.8" r="1.1" />
      <circle cx="16" cy="10.4" r="1.1" />
    </Stroke>
  );
}

/* ------------------------------------------------------------ brand marks */

export function IconWhatsApp(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.19 8.19 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07s.89 2.4 1.02 2.57c.12.16 1.75 2.67 4.24 3.75.59.25 1.05.4 1.41.52.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

export function IconInstagram(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </Stroke>
  );
}
