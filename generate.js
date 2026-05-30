const fs = require('fs');

const USER = process.env.GITHUB_USER || 'tony-kobs';
const TOKEN = process.env.GITHUB_TOKEN;

async function fetchContributions() {
  const query = `{
    user(login: "${USER}") {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }`;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const json = await res.json();
  return json.data.user.contributionsCollection.contributionCalendar.weeks;
}

function fixed(n) {
  return parseFloat(n.toFixed(4));
}

function generateSVG(weeks) {
  const W = 900;
  const H = 240;
  const SHIP_X = 40;

  // ── Grid dimensions — match GitHub exactly ─────────────────────────
  const CELL = 22;   // cell size px
  const GAP  = 5;    // gap between cells
  const STEP = CELL + GAP; // 14px per week/day
  const GRID_X = 95; // start X (leave room for day labels)
  const GRID_Y = 28; // start Y (leave room for month labels)
  const R = 5;       // uniform circle radius

  const BULLET_SPEED = 650;
  const FIRE_INTERVAL = 0.1;
  const WIN_DISPLAY = 2.2;
  const WIN_PAUSE = 0.6;

  // ── Parse weeks into flat grid ─────────────────────────────────────
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAY_NAMES = ['','Mon','','Wed','','Fri',''];

  const targets = [];
  const monthLabels = [];
  let lastMonth = -1;

  weeks.slice(-26).forEach((week, w) => {
    week.contributionDays.forEach((day, d) => {
      const date = new Date(day.date);
      const month = date.getMonth();

      // Track month label positions
      if (d === 0 && month !== lastMonth) {
        monthLabels.push({ x: GRID_X + w * STEP, label: MONTH_NAMES[month] });
        lastMonth = month;
      }

      if (day.contributionCount > 0) {
        const cx = GRID_X + w * STEP + CELL / 2;
        const cy = GRID_Y + d * STEP + CELL / 2;
        const count = day.contributionCount;
        const level = count >= 10 ? '#216e39'
                    : count >= 5  ? '#30a14e'
                    : count >= 2  ? '#40c463'
                    :               '#9be9a8';
        targets.push({ cx: Math.round(cx), cy: Math.round(cy), count, level, id: `t${w}_${d}` });
      }
    });
  });

  // Shuffle for random destruction order
  for (let i = targets.length - 1; i > 0; i--) {
    const j = (i * 1664525 + 1013904223) % (i + 1);
    [targets[i], targets[j]] = [targets[j], targets[i]];
  }

  // ── Timing ─────────────────────────────────────────────────────────
  const BULLET_START_X = SHIP_X + 32;

  const seq = targets.map((t, i) => {
    const fireTime   = i * FIRE_INTERVAL;
    const travelTime = (t.cx - BULLET_START_X) / BULLET_SPEED;
    const hitTime    = fireTime + travelTime;
    return { ...t, fireTime, travelTime, hitTime };
  });

  const lastHit  = seq.length > 0 ? seq[seq.length - 1].hitTime : 3;
  const winStart = lastHit + 0.4;
  const winEnd   = winStart + WIN_DISPLAY;
  const totalDur = winEnd + WIN_PAUSE;

  function pct(t) { return fixed(Math.max(0, Math.min(1, t / totalDur))); }

  // ── Stars ──────────────────────────────────────────────────────────
  const stars = Array.from({ length: 60 }, (_, i) => {
    const x = ((i * 173) % W).toFixed(0);
    const y = ((i * 113) % H).toFixed(0);
    const r = i % 4 === 0 ? 1.5 : 0.7;
    const dur = (1.2 + (i % 6) * 0.3).toFixed(1);
    const op = (0.3 + (i % 5) * 0.12).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${op}">
      <animate attributeName="opacity" values="${op};${Math.min(1, +op + 0.4)};${op}" dur="${dur}s" repeatCount="indefinite"/>
    </circle>`;
  }).join('');

  // ── Month labels ───────────────────────────────────────────────────
  const monthLabelsSVG = monthLabels.map(m =>
    `<text x="${m.x}" y="${GRID_Y - 6}" font-size="10" fill="#8b949e" font-family="monospace">${m.label}</text>`
  ).join('');

  // ── Day labels ─────────────────────────────────────────────────────
  const dayLabelsSVG = DAY_NAMES.map((name, d) =>
    name ? `<text x="${GRID_X - 6}" y="${GRID_Y + d * STEP + CELL - 1}" font-size="9" fill="#8b949e" font-family="monospace" text-anchor="end">${name}</text>` : ''
  ).join('');

  // ── Empty grid background cells ────────────────────────────────────
  const emptyCells = weeks.map((week, w) =>
    week.contributionDays.map((day, d) => {
      const x = GRID_X + w * STEP;
      const y = GRID_Y + d * STEP;
      return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="#161b22"/>`;
    }).join('')
  ).join('');

  // ── Contributors: disappear on hit ─────────────────────────────────
  const targetsSVG = seq.map(s => {
    const p0 = pct(s.hitTime);
    const p1 = pct(s.hitTime + 0.15);
    const x  = s.cx - CELL / 2;
    const y  = s.cy - CELL / 2;
    return `
    <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${s.level}">
      <animate attributeName="opacity" values="0.9;0.9;0;0"
        keyTimes="0;${p0};${p1};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
      <animate attributeName="width" values="${CELL};${CELL};${CELL * 2};0"
        keyTimes="0;${p0};${p1};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
      <animate attributeName="height" values="${CELL};${CELL};${CELL * 2};0"
        keyTimes="0;${p0};${p1};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
      <animate attributeName="x" values="${x};${x};${x - CELL / 2};${s.cx}"
        keyTimes="0;${p0};${p1};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
      <animate attributeName="y" values="${y};${y};${y - CELL / 2};${s.cy}"
        keyTimes="0;${p0};${p1};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
    </rect>`;
  }).join('');

  // ── Bullets ────────────────────────────────────────────────────────
  const bulletsSVG = seq.map(s => {
    const pFire  = pct(s.fireTime);
    const pStart = pct(s.fireTime + 0.04);
    const pHit   = pct(s.hitTime);
    const pEnd   = pct(s.hitTime + 0.04);
    return `
    <rect height="3" width="20" rx="1" fill="#ffeb3b" y="${s.cy - 1.5}" opacity="0">
      <animate attributeName="opacity"
        values="0;0;1;1;0;0"
        keyTimes="0;${pFire};${pStart};${pHit};${pEnd};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
      <animate attributeName="x"
        values="${BULLET_START_X};${BULLET_START_X};${BULLET_START_X};${s.cx - 8};${s.cx};${BULLET_START_X}"
        keyTimes="0;${pFire};${pStart};${pHit};${pEnd};1"
        calcMode="linear"
        dur="${totalDur}s" repeatCount="indefinite"/>
    </rect>`;
  }).join('');

  // ── Ship ───────────────────────────────────────────────────────────
  const shipSVG = `
    <g>
      <polygon points="30,0 -10,-14 -4,0 -10,14" fill="#cc1100"/>
      <polygon points="22,0 2,-7 -2,0 2,7" fill="#ff3322"/>
      <polygon points="-4,-10 -20,-22 -24,-12 -10,-5" fill="#880000"/>
      <polygon points="-4,10 -20,22 -24,12 -10,5" fill="#880000"/>
      <ellipse cx="-14" cy="0" rx="5" ry="4" fill="#ff6600" opacity="0.95">
        <animate attributeName="rx" values="5;9;5" dur="0.12s" repeatCount="indefinite"/>
      </ellipse>
      <ellipse cx="-22" cy="-16" rx="3" ry="2" fill="#ff8800" opacity="0.7">
        <animate attributeName="rx" values="3;5;3" dur="0.15s" repeatCount="indefinite"/>
      </ellipse>
      <ellipse cx="-22" cy="16" rx="3" ry="2" fill="#ff8800" opacity="0.7">
        <animate attributeName="rx" values="3;5;3" dur="0.15s" repeatCount="indefinite"/>
      </ellipse>
      <animateTransform attributeName="transform" type="translate"
        values="${SHIP_X},22; ${SHIP_X},${H/2}; ${SHIP_X},${H-22}; ${SHIP_X},${H/2}; ${SHIP_X},22"
        keyTimes="0;0.25;0.5;0.75;1"
        calcMode="spline"
        keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
        dur="4s"
        repeatCount="indefinite"/>
    </g>
  `;

  // ── You Win ────────────────────────────────────────────────────────
  const pw0 = pct(winStart);
  const pw1 = pct(winStart + 0.3);
  const pw2 = pct(winEnd - 0.3);
  const pw3 = pct(winEnd);
  const total = targets.reduce((s, t) => s + t.count, 0);

  const youWin = `
    <text x="${W / 2}" y="${H / 2 + 10}" text-anchor="middle"
      font-size="42" fill="#ffeb3b" font-family="monospace" font-weight="bold"
      letter-spacing="4" opacity="0">
      YOU WIN!
      <animate attributeName="opacity" values="0;0;1;1;0;0"
        keyTimes="0;${pw0};${pw1};${pw2};${pw3};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
    </text>
    <text x="${W / 2}" y="${H / 2 + 42}" text-anchor="middle"
      font-size="13" fill="#4fc3f7" font-family="monospace" opacity="0">
      ${total} contributions destroyed
      <animate attributeName="opacity" values="0;0;1;1;0;0"
        keyTimes="0;${pw0};${pw1};${pw2};${pw3};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
    </text>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0d1117" rx="8"/>
  ${stars}
  ${emptyCells}
  ${monthLabelsSVG}
  ${dayLabelsSVG}
  ${targetsSVG}
  ${bulletsSVG}
  ${shipSVG}
  ${youWin}
  <text x="12" y="${H - 6}" font-size="10" fill="#444" font-family="monospace">🚀 ${USER}'s contributions</text>
</svg>`;
}

async function main() {
  const weeks = await fetchContributions();
  const svg = generateSVG(weeks);
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/arcade.svg', svg);
  console.log(`Generated arcade.svg`);
}

main();
