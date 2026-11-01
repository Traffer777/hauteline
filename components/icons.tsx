// Собственные иконки витрины: линия 1.75, скруглённые концы, геометрия под фирменные иконки из Figma.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
function Base({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}
export const IconChevronLeft = (p: P) => (
  <Base {...p}>
    <path d="M14.5 5.5 8.2 12l6.3 6.5" />
  </Base>
);
export const IconChevronRight = (p: P) => (
  <Base {...p}>
    <path d="M9.5 5.5 15.8 12l-6.3 6.5" />
  </Base>
);
export const IconChevronDown = (p: P) => (
  <Base {...p}>
    <path d="M6 9.4 12 15l6-5.6" />
  </Base>
);
export const IconChevronUp = (p: P) => (
  <Base {...p}>
    <path d="M6 14.6 12 9l6 5.6" />
  </Base>
);
export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="10.6" cy="10.6" r="6.4" />
    <path d="m15.4 15.4 4.6 4.6" />
  </Base>
);
export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
  </Base>
);
export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="M5 12.6 9.6 17 19 7.4" />
  </Base>
);
export const IconExpand = (p: P) => (
  <Base {...p}>
    <path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5 13.6 10.4M4.5 19.5l5.9-5.9" />
  </Base>
);
export const IconTruck = (p: P) => (
  <Base {...p}>
    <path d="M3 6.5h10.5v9.5H3zM13.5 9.5h4l3.5 3.6V16h-7.5" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </Base>
);
export const IconBox = (p: P) => (
  <Base {...p}>
    <path d="M4 7.8 12 4l8 3.8v8.6L12 20l-8-3.6z" />
    <path d="M4 7.8 12 11.6l8-3.8M12 11.6V20" />
  </Base>
);
