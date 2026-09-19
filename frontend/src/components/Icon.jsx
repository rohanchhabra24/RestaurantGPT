// Icon set recreated from the mockup's inline SVG symbol defs — same path
// data, rendered as individual React components instead of <use href>.
const PATHS = {
  check: <path d="M4 12.5l5 5L20 6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16.5V19a1 1 0 001 1h14a1 1 0 001-1v-2.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.5 2" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h8l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1v-16a1 1 0 011-1z" />
      <path d="M14 3.5v4h4" />
    </>
  ),
  db: (
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13" />
      <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="12" r="2.2" />
      <path d="M6 8.2v4a4 4 0 004 4h1.5M8.2 6H14a4 4 0 014 4v0" />
    </>
  ),
  send: <path d="M4 12l16-7-6.5 16-2.7-6.8L4 12z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-5-5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 10a6 6 0 1112 0v4l1.5 3h-15L6 14v-4z" />
      <path d="M9.5 20a2.5 2.5 0 005 0" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  layers: (
    <>
      <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" />
      <path d="M4 12l8 4.5 8-4.5M4 16.5L12 21l8-4.5" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.6 6 .7-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6-4.4-4.2 6-.7L12 3.5z" />,
  rain: (
    <>
      <path d="M7 15a4 4 0 01.7-7.94A5.5 5.5 0 0118 9.5 3.5 3.5 0 0117.5 16H7z" />
      <path d="M8 19l-1 2M12.5 19l-1 2M17 19l-1 2" />
    </>
  ),
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  alert: (
    <>
      <path d="M12 3.5L2 20.5h20L12 3.5z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17.3" r="0.15" fill="currentColor" stroke="none" />
    </>
  ),
  scooter: (
    <>
      <circle cx="5.5" cy="18" r="2.2" />
      <circle cx="18.5" cy="18" r="2.2" />
      <path d="M7.5 18h6l2-6h3M13.5 12H10l-1.5-4H6" />
      <path d="M16 8.5h2.5" />
    </>
  ),
  thumbsup: (
    <>
      <path d="M8 10.5v10h9.2a2 2 0 002-1.6l1.3-6a2 2 0 00-2-2.4H14l.8-4.2a1.8 1.8 0 00-3.2-1.4L8 10.5z" />
      <path d="M8 10.5H5a1 1 0 00-1 1V19a1 1 0 001 1h3" />
    </>
  ),
  thumbsdown: (
    <>
      <path d="M16 13.5v-10H6.8a2 2 0 00-2 1.6l-1.3 6a2 2 0 002 2.4H10l-.8 4.2a1.8 1.8 0 003.2 1.4L16 13.5z" />
      <path d="M16 13.5h3a1 1 0 001-1V5a1 1 0 00-1-1h-3" />
    </>
  ),
  eye: (
    <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
    </>
  ),
};

export default function Icon({ name, size = 14, className = "", style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
