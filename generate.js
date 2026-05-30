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
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap(w => w.contributionDays)
    .filter(d => d.contributionCount > 0);
}

function fixed(n, dec = 4) {
  return parseFloat(n.toFixed(dec));
}

function generateSVG(days) {
  const W = 900;
  const H = 220;
  const SHIP_X = 45;
  const BULLET_SPEED = 650; // px/s
  const FIRE_INTERVAL = 0.5; // s between shots
  const WIN_DISPLAY = 2.0;   // s to show You Win
  const WIN_PAUSE = 0.5;     // s before restart

  // ── Stars ──────────────────────────────────────────────────────────
  const stars = Array.from({ length: 70 }, (_, i) => {
    const x = ((i * 173) % W).toFixed(0);
    const y = ((i * 113) % H).toFixed(0);
    const r = i % 4 === 0 ? 1.5 : 0.7;
    const dur = (1.2 + (i % 6) * 0.3).toFixed(1);
    const op = (0.3 + (i % 5) * 0.12).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${op}">
      <animate attributeName="opacity" values="${op};${Math.min(1, +op + 0.4)};${op}" dur="${dur}s" repeatCount="indefinite"/>
    </circle>`;
  }).join('');

  // ── Targets: GitHub-style contribution grid ─────────────────────────
  const WEEKS = 53;
  const DAYS  = 7;
  const CELL  = 11;
  const GAP   = 2;
  const GRID_X = 190;
  const GRID_Y = 10;

  const allDays = days.slice(-(WEEKS * DAYS));
  const targets = [];

  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) {
      const idx = w * DAYS + d;
      const day = allDays[idx];
      if (day && day.contributionCount > 0) {
        const cx = GRID_X + w * (CELL + GAP) + CELL / 2;
        const cy = GRID_Y + d * (CELL + GAP) + CELL / 2;
        const count = day.contributionCount;
        const level = count >= 10 ? '#216e39'
                    : count >= 5  ? '#30a14e'
                    : count >= 2  ? '#40c463'
                    :               '#9be9a8';
        targets.push({ cx: Math.round(cx), cy: Math.round(cy), count, level, id: `t${w}_${d}` });
      }
    }
  }

  // Shuffle targets so bullets hit in random order
  for (let i = targets.length - 1; i > 0; i--) {
    const j = Math.floor((i * 1664525 + 1013904223) % (i + 1));
    [targets[i], targets[j]] = [targets[j], targets[i]];
  }

  // ── Timing per target ───────────────────────────────────────────────
  const BULLET_START_X = SHIP_X + 30;

  const seq = targets.map((t, i) => {
    const fireTime  = i * FIRE_INTERVAL;
    const travelTime = (t.cx - BULLET_START_X) / BULLET_SPEED;
    const hitTime   = fireTime + travelTime;
    return { ...t, fireTime, travelTime, hitTime };
  });

  const lastHit     = seq[seq.length - 1].hitTime;
  const winStart    = lastHit + 0.3;
  const winEnd      = winStart + WIN_DISPLAY;
  const totalDur    = winEnd + WIN_PAUSE;

  function pct(t) { return fixed(Math.max(0, Math.min(1, t / totalDur))); }

  // ── Ship: continuous up-down oscillation ───────────────────────────
  const shipShape = `
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
  `;

  const shipSVG = `
    <g>
      ${shipShape}
      <animateTransform attributeName="transform" type="translate"
        values="${SHIP_X},20; ${SHIP_X},${H/2}; ${SHIP_X},${H-20}; ${SHIP_X},${H/2}; ${SHIP_X},20"
        keyTimes="0;0.25;0.5;0.75;1"
        calcMode="spline"
        keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
        dur="4s"
        repeatCount="indefinite"/>
    </g>
  `;

  // ── Contributors: disappear on hit ─────────────────────────────────
  const targetsSVG = seq.map(s => {
    const r = Math.min(4 + Math.sqrt(s.count), 7);
    const p0 = pct(s.hitTime);
    const p1 = pct(s.hitTime + 0.15);
    return `
    <g>
      <circle cx="${s.cx}" cy="${s.cy}" r="${r}" fill="${s.level}">
        <animate attributeName="opacity" values="0.9;0.9;0;0"
          keyTimes="0;${p0};${p1};1"
          dur="${totalDur}s" repeatCount="indefinite"/>
        <animate attributeName="r" values="${r};${r};${r * 2.5};0"
          keyTimes="0;${p0};${p1};1"
          dur="${totalDur}s" repeatCount="indefinite"/>
      </circle>
    </g>`;
  }).join('');

  // ── Bullets ─────────────────────────────────────────────────────────
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
        values="${BULLET_START_X};${BULLET_START_X};${BULLET_START_X};${s.cx - 8};${s.cx - 8};${BULLET_START_X}"
        keyTimes="0;${pFire};${pStart};${pHit};${pEnd};1"
        calcMode="linear"
        dur="${totalDur}s" repeatCount="indefinite"/>
    </rect>`;
  }).join('');

  // ── You Win ─────────────────────────────────────────────────────────
  const pw0 = pct(winStart);
  const pw1 = pct(winStart + 0.3);
  const pw2 = pct(winEnd - 0.3);
  const pw3 = pct(winEnd);
  const total = seq.reduce((s, t) => s + t.count, 0);

  const youWin = `
    <text x="${W / 2}" y="${H / 2 + 10}" text-anchor="middle"
      font-size="42" fill="#ffeb3b" font-family="monospace" font-weight="bold"
      letter-spacing="4" opacity="0">
      YOU WIN!
      <animate attributeName="opacity" values="0;0;1;1;0;0"
        keyTimes="0;${pw0};${pw1};${pw2};${pw3};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
    </text>
    <text x="${W / 2}" y="${H / 2 + 40}" text-anchor="middle"
      font-size="14" fill="#4fc3f7" font-family="monospace" opacity="0">
      ${total} contributions destroyed
      <animate attributeName="opacity" values="0;0;1;1;0;0"
        keyTimes="0;${pw0};${pw1};${pw2};${pw3};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
    </text>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0d1117" rx="8"/>
  ${stars}
  ${targetsSVG}
  ${bulletsSVG}
  ${shipSVG}
  ${youWin}
  <text x="12" y="${H - 6}" font-size="10" fill="#444" font-family="monospace">🚀 ${USER}'s contributions</text>
</svg>`;
}

async function main() {
  const days = await fetchContributions();
  const svg = generateSVG(days);
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/arcade.svg', svg);
  console.log(`Generated arcade.svg — ${days.length} contribution days, ${days.reduce((s,d)=>s+d.contributionCount,0)} total`);
}

main();
