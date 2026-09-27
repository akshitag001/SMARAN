import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  chev: <path d="M9 5l7 7-7 7" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  stop: <rect x="5" y="5" width="14" height="14" rx="2.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  redo: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />,
  pen: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />,
  kb: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </>
  ),
  cloud: (
    <>
      <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />
      <path d="M9.5 13.5l2 2 3.5-3.5" />
    </>
  ),
  cloudOff: (
    <>
      <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />
      <path d="M12 11v3M12 16.5v.01" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5" />
    </>
  ),
  school: <path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5M12 5V2.5h3" />,
  grid: (
    <>
      {[6, 12, 18].flatMap((y) => [6, 12, 18].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({ name, small }: { name: IconName; small?: boolean }) {
  return (
    <svg className={`ic${small ? ' sm' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
