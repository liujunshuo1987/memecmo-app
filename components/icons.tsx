// Original MemeCMO monoline icon set — one consistent line language, currentColor.
// Replaces emoji across the app (cross-platform consistent, on-brand).

import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  // Agents
  full_scan: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 12 L18 7" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /></>),
  profile: (<><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="11" r="2.1" /><path d="M5.8 16c.7-1.7 5-1.7 6.4 0" /><path d="M14.6 10h3.6M14.6 13h2.8" /></>),
  discovery: (<><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z" /></>),
  answers: (<><path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" /><path d="M8 9h8M8 12h5" /></>),
  monitor: (<><path d="M4 14a8 8 0 0 1 16 0" /><path d="M7.5 14a4.5 4.5 0 0 1 9 0" /><circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" /></>),
  report: (<><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M9 16v-3.5M12 16v-6M15 16v-2.5" /></>),
  site: (<><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M3.5 9h17" /><path d="M6.5 7h.01M9 7h.01" /></>),
  optimize: (<><path d="M15 5l4 4L9 19l-4 1 1-4z" /><path d="M13.5 6.5l4 4" /></>),
  distribute: (<><circle cx="6" cy="12" r="2.1" /><circle cx="17" cy="6" r="2.1" /><circle cx="17" cy="18" r="2.1" /><path d="M7.9 11l7.2-3.8M7.9 13l7.2 3.8" /></>),
  encyclopedia: (<><path d="M12 6c-2-1.4-5-1.4-7 0v12c2-1.4 5-1.4 7 0 2-1.4 5-1.4 7 0V6c-2-1.4-5-1.4-7 0z" /><path d="M12 6v12" /></>),
  // UI
  copy: (<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>),
  refresh: (<><path d="M4 12a8 8 0 0 1 13.5-5.8L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-13.5 5.8L4 16" /><path d="M4 20v-4h4" /></>),
  edit: (<><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 7.5l3 3" /></>),
  send: (<><path d="M5 12h13" /><path d="M13 6l6 6-6 6" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" /></>),
  moon: (<><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></>),
};

export function Icon({ name, size = 18, className = '', strokeWidth = 1.75 }: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}
