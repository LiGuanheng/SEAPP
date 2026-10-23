const paths: Record<string, string> = {
  beacon: '<path d="m8 10-2 12h12l-2-12M7 5h10v5H7zM5 5l7-4 7 4M12 5v5M1 8h3m16 0h3"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  box: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10L3 7m9 5 9-5m-9 5v10M7.5 4.5l9 5"/>',
  energy: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',
  shield: '<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1"/>',
  settings: '<path d="m10 2-.5 3-2 .9L5 5 2 10l2.5 2v2L2 16l3 5 2.5-.9 2 .9.5 3h5l.5-3 2-.9 2.5.9 3-5-2.5-2v-2L23 10l-3-5-2.5.9-2-.9-.5-3Z" transform="translate(1 0) scale(.9)"/><circle cx="12" cy="12" r="3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4m1-17a3 3 0 0 1 0 6m2 3a6 6 0 0 1 3 5v3"/>',
  ruins: '<path d="M3 21V9h5V4h8v8h5v9M7 13h1m4-5h1m-1 5h1m4 3h1M2 21h20M9 21v-4h4v4"/>',
  cross: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  fire: '<path d="M12 2c2 6-4 7-1 11 2-1 4-4 4-6 9 8 5 15-3 15S1 15 6 9c0 5 3 6 4 6-3-7 4-7 2-13Z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  flag: '<path d="M5 22V3c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
};
export function icon(name: string, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.shield}</svg>`;
}
