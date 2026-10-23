// Captures new texture PNGs for the RestaurantGPT reskin, at the exact same
// pixel coordinates the existing live-layout.json already specifies (so the
// JSON's numeric geometry — and every scene's PageCam/animation code that
// reads it — stays untouched; only the *content* changes).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/textures/live-light');
mkdirSync(OUT, { recursive: true });

const TOKENS = {
  bg: '#f8f9fc', surface: '#ffffff', text: '#14151f', textDim: '#5c6077',
  divider: 'rgba(0,0,0,0.08)', accent: '#7a68d6', accent200: '#6656c4', accent800: '#e4e0f9',
};

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, -apple-system, 'Segoe UI', Roboto, sans-serif; background: ${TOKENS.bg}; color: ${TOKENS.text}; }
  .card {
    position: absolute; border-radius: 12px; border: 1px solid ${TOKENS.divider};
    background: linear-gradient(180deg, #ffffff 0%, #fafafc 100%);
    padding: 18px; overflow: hidden;
  }
  .kicker { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: ${TOKENS.textDim}; display: flex; align-items: center; gap: 8px; }
  .status-pill { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: ${TOKENS.accent800}; color: ${TOKENS.accent200}; }
  .status-pill.flag { background: rgba(217,56,58,0.08); color: #d9383a; }
  .card-title { font-size: 16px; font-weight: 600; margin-top: 10px; letter-spacing: -0.01em; }
  .card-body { font-size: 12.5px; color: ${TOKENS.textDim}; margin-top: 6px; line-height: 1.5; }
  .stat-row { display: flex; gap: 14px; margin-top: 14px; font-size: 11.5px; color: ${TOKENS.textDim}; }
  .stat-row b { color: ${TOKENS.text}; font-weight: 600; }
  .tagrow { display: flex; gap: 6px; margin-top: 10px; }
  .tag { font-size: 10.5px; border: 1px solid ${TOKENS.divider}; border-radius: 999px; padding: 2px 8px; color: ${TOKENS.textDim}; }
`;

function navHtml({ w, h }) {
  return `<div style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:${TOKENS.surface};border-bottom:1px solid ${TOKENS.divider};display:flex;align-items:center;padding:0 32px;gap:10px;">
    <span style="width:24px;height:24px;border-radius:7px;background:${TOKENS.accent800};display:inline-flex;align-items:center;justify-content:center;font-size:13px;">🟪</span>
    <span style="font-weight:600;font-size:16px;">Restaurant<span style="color:${TOKENS.accent200}">GPT</span></span>
    <span style="margin-left:auto;font-size:12px;color:${TOKENS.textDim}">Chain overview</span>
  </div>`;
}

// ---------------------------------------------------------------------------
// PAGE 1: "projects" -> Outlets overview grid. Same geometry as the original
// live-layout.json: header 1920x61, 10 cards at the same x/y/w/h, 3 section
// labels at the same positions. pageH 1746.
// ---------------------------------------------------------------------------
const OUTLETS = [
  { file: 'card1.png', x: 408, y: 247, w: 357.328125, h: 288, title: 'Andheri West', zone: 'West', flagged: 0, text: 'Up to date. No orders flagged this week.' },
  { file: 'card2.png', x: 781.328125, y: 247, w: 357.328125, h: 288, title: 'Powai', zone: 'West', flagged: 1, text: '1 claim submitted — awaiting payout.' },
  { file: 'card3.png', x: 408, y: 616, w: 357.328125, h: 312, title: 'Indiranagar', zone: 'North', flagged: 0, text: 'Up to date. Nothing flagged this week.' },
  { file: 'card4.png', x: 781.328125, y: 616, w: 357.328125, h: 312, title: 'Koramangala — Zone 3', zone: 'North', flagged: 6, text: '6 orders qualify — ₹2,730 total, delayed past SLA due to rain.' },
  { file: 'card5.png', x: 1154.65625, y: 616, w: 357.34375, h: 312, title: 'Whitefield', zone: 'North', flagged: 1, text: '1 claim under review.' },
  { file: 'card6.png', x: 408, y: 1009, w: 357.328125, h: 312, title: 'HSR Layout', zone: 'South', flagged: 3, text: '3 claims drafted — ₹960 total, courier no-shows and late prep.' },
  { file: 'card7.png', x: 781.328125, y: 1009, w: 357.328125, h: 312, title: 'Salt Lake', zone: 'East', flagged: 0, text: 'Up to date. No orders flagged this week.' },
  { file: 'card8.png', x: 1154.65625, y: 1009, w: 357.34375, h: 312, title: 'Sector 62', zone: 'East', flagged: 1, text: '1 order flagged, pending confirmation.' },
  { file: 'card9.png', x: 408, y: 1402, w: 357.328125, h: 312, title: 'Banjara Hills', zone: 'South', flagged: 0, text: 'Up to date. No orders flagged this week.' },
  { file: 'card10.png', x: 781.328125, y: 1402, w: 357.328125, h: 312, title: 'Viman Nagar', zone: 'East', flagged: 0, text: 'Up to date. No orders flagged this week.' },
];
const SECTIONS = [
  { text: 'All outlets', x: 408, y: 93, w: 90, h: 16 },
  { text: 'Flagged this week', x: 408, y: 206, w: 160, h: 16 },
  { text: 'Up to date', x: 408, y: 575, w: 100, h: 16 },
];
const PROJECTS_PAGE_H = 1746;

function outletCard(o, { empty = false } = {}) {
  if (empty) return '';
  return `<div id="outlet-${o.file.replace('.png','')}" class="card" style="left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;">
    <div class="kicker"><span>OUTLET</span>${o.flagged > 0 ? `<span class="status-pill flag" style="margin-left:auto">Flagged</span>` : `<span class="status-pill" style="margin-left:auto">Up to date</span>`}</div>
    <div class="card-title">${o.title}</div>
    <div class="card-body">${o.text}</div>
    <div class="stat-row"><span>Zone <b>${o.zone}</b></span><span>Flagged <b>${o.flagged}</b></span></div>
  </div>`;
}

function projectsPageHtml({ empty = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
  <body><div style="position:relative;width:1920px;height:${PROJECTS_PAGE_H}px;background:${TOKENS.bg};">
    ${navHtml({ w: 1920, h: 61 })}
    <div id="search" style="position:absolute;left:408px;top:130px;width:1016px;height:44px;border-radius:999px;border:1px solid ${TOKENS.divider};background:${TOKENS.surface};display:flex;align-items:center;padding:0 18px;color:${TOKENS.textDim};font-size:13px;">Search outlets…</div>
    <div id="filter" style="position:absolute;left:1436px;top:130px;width:76px;height:44px;border-radius:999px;border:1px solid ${TOKENS.divider};background:${TOKENS.surface};display:flex;align-items:center;justify-content:center;color:${TOKENS.textDim};font-size:12px;">Filter</div>
    ${SECTIONS.map((s) => `<div id="section-${s.text.replace(/\s+/g,'-')}" style="position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${TOKENS.textDim};">${s.text}</div>`).join('')}
    <div id="stats" style="position:absolute;left:429px;top:388px;width:315.328125px;height:56px;border-radius:10px;background:${TOKENS.accent800};color:${TOKENS.accent200};display:flex;align-items:center;padding:0 16px;font-size:13px;font-weight:600;">10 outlets · 5 flagged this week</div>
    ${OUTLETS.map((o) => outletCard(o, { empty })).join('')}
  </div></body></html>`;
}

// ---------------------------------------------------------------------------
// PAGE 2: "detail" -> Koramangala outlet investigation/detail view. Same
// geometry: pageH 1172, 5 rows at the same x/y/w/h.
// ---------------------------------------------------------------------------
const DETAIL_ROWS_TEXT = [
  { title: 'Order #4021', body: 'Zone 3 · cancelled · weather delay logged by the rider app' },
  { title: 'Historical weather, 14 Oct', body: 'Confirmed rain at pickup time — independently checked, not self-reported' },
  { title: 'Policy §4.2 — weather delay', body: '65% of order value, no cap, applies once SLA is missed during confirmed rain' },
  { title: 'Computed compensation', body: '₹2,730 across 6 qualifying orders this week' },
  { title: 'Claim status', body: 'Drafted — ready for your review, not yet submitted' },
];
const DETAIL_PAGE_H = 1172;
function detailPageHtml() {
  const rows = [
    { x: 408, y: 666, w: 1104, h: 94.5 },
    { x: 408, y: 760.5, w: 1104, h: 95 },
    { x: 408, y: 855.5, w: 1104, h: 95 },
    { x: 408, y: 950.5, w: 1104, h: 95 },
    { x: 408, y: 1045.5, w: 1104, h: 95 },
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
  <body><div style="position:relative;width:1920px;height:${DETAIL_PAGE_H}px;background:${TOKENS.bg};">
    ${navHtml({ w: 1920, h: 61 })}
    <div style="position:absolute;left:408px;top:110px;width:1104px;">
      <div class="kicker">OUTLET · ZONE 3</div>
      <div style="font-size:26px;font-weight:600;margin-top:8px;">Koramangala</div>
      <div style="font-size:13px;color:${TOKENS.textDim};margin-top:6px;max-width:700px;">6 orders qualify — ₹2,730 total, delayed past SLA due to rain.</div>
      <div class="tagrow"><span class="tag">Order #4021</span><span class="tag">Policy §4.2</span></div>
    </div>
    ${rows.map((r, i) => {
      const t = DETAIL_ROWS_TEXT[i];
      return `<div class="card" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;display:flex;flex-direction:column;justify-content:center;padding:0 22px;">
        <div style="font-size:14px;font-weight:600;">${t.title}</div>
        <div style="font-size:12px;color:${TOKENS.textDim};margin-top:4px;">${t.body}</div>
      </div>`;
    }).join('')}
  </div></body></html>`;
}

// ---------------------------------------------------------------------------
// PAGE 3: "papers" -> Claims list. Same geometry: pageH 1489, 5 cards at the
// same x/y/w/h (paper1..paper5).
// ---------------------------------------------------------------------------
const CLAIMS = [
  { title: 'Koramangala — Zone 3 weather delay', amount: '₹2,730', meta: '6 orders · drafted · ready for review' },
  { title: 'HSR Layout — courier no-show', amount: '₹960', meta: '3 claims · drafted · ready for review' },
  { title: 'Powai — late restaurant prep', amount: 'Pending', meta: '1 claim · submitted · awaiting payout' },
  { title: 'Sector 62 — delivery delay', amount: 'Pending', meta: '1 order · flagged · confirming evidence' },
  { title: 'Whitefield — courier no-show', amount: 'Pending', meta: '1 order · under review' },
];
const PAPERS_PAGE_H = 1489;
function papersPageHtml() {
  const slots = [
    { x: 408, y: 214, w: 1104, h: 224.5 },
    { x: 408, y: 454.5, w: 1104, h: 224.5 },
    { x: 408, y: 695, w: 1104, h: 224.5 },
    { x: 408, y: 935.5, w: 1104, h: 224.5 },
    { x: 408, y: 1176, w: 1104, h: 224.5 },
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
  <body><div style="position:relative;width:1920px;height:${PAPERS_PAGE_H}px;background:${TOKENS.bg};">
    ${navHtml({ w: 1920, h: 61 })}
    <div style="position:absolute;left:408px;top:120px;font-size:22px;font-weight:600;">Claims</div>
    ${slots.map((s, i) => {
      const c = CLAIMS[i];
      const status = c.meta.includes('submitted') ? 'Submitted' : c.meta.includes('drafted') ? 'Drafted' : 'Flagged';
      const flag = status === 'Flagged';
      return `<div id="paper${i+1}" class="card" style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;display:flex;flex-direction:column;justify-content:center;">
        <div class="kicker"><span>CLAIM 0${i+1}</span><span class="status-pill ${flag ? 'flag' : ''}" style="margin-left:auto">${status}</span></div>
        <div class="card-title">${c.title}</div>
        <div class="card-body">${c.meta}</div>
        <div style="font-size:22px;font-weight:600;margin-top:10px;color:${TOKENS.accent200}">${c.amount}</div>
      </div>`;
    }).join('')}
  </div></body></html>`;
}

// ---------------------------------------------------------------------------
// PAGE 4: "wbr" -> Monthly Recovery Summary document. Same geometry: pageH
// 1080, 20 blocks (1 h1 + 5 h2 + 14 li) at the same x/y/w/h, left rail
// (month list) and right rail (notes) at the same x/y/w/h.
// ---------------------------------------------------------------------------
const WBR_BLOCKS = [
  { tag: 'h1', text: 'October Recovery Summary' },
  { tag: 'h2', text: 'Overview' },
  { tag: 'li', text: '4 outlets reviewed this month. All delay claims checked against policy before submission.' },
  { tag: 'li', text: 'Claims now link directly to the order and the policy clause used.' },
  { tag: 'h2', text: 'North' },
  { tag: 'li', text: 'Koramangala: 6 orders flagged, ₹2,730 recoverable — rain delay, drafted for review.' },
  { tag: 'li', text: 'Indiranagar: up to date, nothing flagged this week.' },
  { tag: 'li', text: 'Whitefield: 1 claim under review.' },
  { tag: 'h2', text: 'South' },
  { tag: 'li', text: 'HSR Layout: 3 claims drafted, ₹960 recoverable — courier no-show.' },
  { tag: 'li', text: 'Banjara Hills: up to date.' },
  { tag: 'li', text: 'Next month: compare no-show rates across South outlets.' },
  { tag: 'h2', text: 'East' },
  { tag: 'li', text: 'Salt Lake: up to date.' },
  { tag: 'li', text: 'Sector 62: 1 order flagged, pending confirmation.' },
  { tag: 'li', text: 'Viman Nagar: up to date.' },
  { tag: 'h2', text: 'West' },
  { tag: 'li', text: 'Andheri West: up to date.' },
  { tag: 'li', text: 'Powai: claim submitted, awaiting payout.' },
  { tag: 'li', text: 'Next month: close out this month’s records.' },
];
const WBR_PAGE_H = 1080;
function wbrPageHtml() {
  const blocks = [
    { x: 576, y: 189, w: 401.203125, h: 28, tag: 'h1' },
    { x: 576, y: 242.1875, w: 167, h: 23, tag: 'h2' },
    { x: 598.390625, y: 277.21875, w: 665.609375, h: 54.375, tag: 'li' },
    { x: 598, y: 338, w: 666, h: 27, tag: 'li' },
    { x: 576, y: 384, w: 60, h: 23, tag: 'h2' },
    { x: 598, y: 419, w: 666, h: 54, tag: 'li' },
    { x: 598, y: 479, w: 666, h: 27, tag: 'li' },
    { x: 598, y: 513, w: 666, h: 27, tag: 'li' },
    { x: 576, y: 559, w: 56, h: 23, tag: 'h2' },
    { x: 598, y: 594, w: 666, h: 27, tag: 'li' },
    { x: 598, y: 627, w: 666, h: 27, tag: 'li' },
    { x: 598, y: 661, w: 666, h: 27, tag: 'li' },
    { x: 576, y: 706, w: 44, h: 23, tag: 'h2' },
    { x: 598, y: 741, w: 666, h: 27, tag: 'li' },
    { x: 598, y: 775, w: 666, h: 27, tag: 'li' },
    { x: 598, y: 808, w: 666, h: 27, tag: 'li' },
    { x: 576, y: 854, w: 52, h: 23, tag: 'h2' },
    { x: 598, y: 889, w: 666, h: 27, tag: 'li' },
    { x: 598, y: 923, w: 666, h: 27, tag: 'li' },
    { x: 598, y: 956, w: 666, h: 27, tag: 'li' },
  ];
  const leftRail = { x: 0, y: 61, w: 208, h: 1019 };
  const rightRail = { x: 1632, y: 61, w: 288, h: 1019 };
  const blockHtml = blocks.map((b, i) => {
    const t = WBR_BLOCKS[i].text;
    // width is the box the mask-wipe reveal animates over (left-anchored,
    // matches the original layout's geometry exactly) — not a hard clip,
    // since new copy won't be the exact same pixel width as the original
    // fictional content it replaced. No overflow:hidden, so longer text
    // spills into the empty space to its right instead of truncating.
    if (b.tag === 'h1') return `<div style="position:absolute;left:${b.x}px;top:${b.y}px;min-width:${b.w}px;height:${b.h}px;font-size:24px;font-weight:700;white-space:nowrap;">${t}</div>`;
    if (b.tag === 'h2') return `<div style="position:absolute;left:${b.x}px;top:${b.y}px;min-width:${b.w}px;height:${b.h}px;font-size:16px;font-weight:700;color:${TOKENS.accent200};white-space:nowrap;">${t}</div>`;
    return `<div style="position:absolute;left:${b.x - 22}px;top:${b.y}px;width:${b.w + 22}px;height:${b.h}px;font-size:13px;color:${TOKENS.textDim};line-height:1.4;">• ${t}</div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
  <body><div style="position:relative;width:1920px;height:${WBR_PAGE_H}px;background:${TOKENS.bg};">
    ${navHtml({ w: 1920, h: 61 })}
    <div style="position:absolute;left:${leftRail.x}px;top:${leftRail.y}px;width:${leftRail.w}px;height:${leftRail.h}px;border-right:1px solid ${TOKENS.divider};padding:16px 14px;font-size:11px;color:${TOKENS.textDim};">
      <div style="font-weight:700;color:${TOKENS.text};margin-bottom:8px;">Past summaries</div>
    </div>
    <div style="position:absolute;left:${rightRail.x}px;top:${rightRail.y}px;width:${rightRail.w}px;height:${rightRail.h}px;border-left:1px solid ${TOKENS.divider};padding:16px 14px;font-size:11px;color:${TOKENS.textDim};">
      <div style="font-weight:700;color:${TOKENS.text};margin-bottom:8px;">Notes</div>
      <div>Generated automatically from this month's claims.</div>
    </div>
    ${blockHtml}
  </div></body></html>`;
}

// ---------------------------------------------------------------------------
async function capture() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });

  async function shootFullPage(html, w, h, outFile) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT, outFile) });
    return page;
  }

  // 1. projects-full.png + projects-empty.png
  const pProj = await shootFullPage(projectsPageHtml(), 1920, PROJECTS_PAGE_H, 'projects-full.png');
  // element crops: individual outlet cards at 2x (matches original card*.png)
  for (const o of OUTLETS) {
    await pProj.locator(`#outlet-${o.file.replace('.png', '')}`).screenshot({ path: path.join(OUT, o.file) });
  }
  await pProj.locator('#search').screenshot({ path: path.join(OUT, 'float-search.png') });
  await pProj.locator('#filter').screenshot({ path: path.join(OUT, 'float-filter.png') });
  await pProj.locator('#stats').screenshot({ path: path.join(OUT, 'float-stats.png') });
  await pProj.locator('#section-Flagged-this-week').screenshot({ path: path.join(OUT, 'float-section.png') });
  await pProj.close();
  await shootFullPage(projectsPageHtml({ empty: true }), 1920, PROJECTS_PAGE_H, 'projects-empty.png');

  // card4-hires.png: the Koramangala card (MAIN hero), captured at 4x for the
  // opening spotlight's close-up zoom.
  {
    const hiPage = await browser.newPage({ viewport: { width: 1920, height: PROJECTS_PAGE_H }, deviceScaleFactor: 4 });
    await hiPage.setContent(projectsPageHtml(), { waitUntil: 'networkidle' });
    await hiPage.locator('#outlet-card4').screenshot({ path: path.join(OUT, 'card4-hires.png') });
    await hiPage.close();
  }

  // 2. detail-full.png
  await (await shootFullPage(detailPageHtml(), 1920, DETAIL_PAGE_H, 'detail-full.png')).close();

  // 3. papers-full.png + paper1..5.png crops
  {
    const pPapers = await shootFullPage(papersPageHtml(), 1920, PAPERS_PAGE_H, 'papers-full.png');
    for (let i = 1; i <= 5; i++) {
      await pPapers.locator(`#paper${i}`).screenshot({ path: path.join(OUT, `paper${i}.png`) });
    }
    await pPapers.close();
  }

  // 4. wbr-full.png
  await (await shootFullPage(wbrPageHtml(), 1920, WBR_PAGE_H, 'wbr-full.png')).close();

  // 5. nav.png: just the nav bar region, reused standalone (1920x61 CSS -> 2x)
  {
    const navPage = await browser.newPage({ viewport: { width: 1920, height: 61 }, deviceScaleFactor: 2 });
    await navPage.setContent(`<!doctype html><html><head><style>${BASE_CSS}</style></head><body>${navHtml({ w: 1920, h: 61 })}</body></html>`, { waitUntil: 'networkidle' });
    await navPage.screenshot({ path: path.join(OUT, 'nav.png') });
    await navPage.close();
  }

  await browser.close();
  console.log('Capture complete.');
}

capture().catch((e) => { console.error(e); process.exit(1); });
