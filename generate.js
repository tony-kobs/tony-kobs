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

function fixed(n) {
  return parseFloat(n.toFixed(4));
}

function generateSVG(days) {
  const W = 900;
  const H = 220;
  const SHIP_X = 45;
  const BULLET_SPEED = 700;
  const MOVE_SPEED = 180;
  const SHOOT_DELAY = 0.3;

  // ── Targets: static grid on right side ──────────────────────────────
  const MAX_TARGETS = 20;
  const targets = days.slice(-MAX_TARGETS).map((d, i) => {
    const cols = 5;
    const rows = Math.ceil(MAX_TARGETS / cols);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 280 + col * 120;
    const y = 30 + row * ((H - 40) / (rows - 1 || 1));
    const r = Math.min(6 + Math.sqrt(d.contributionCount) * 2, 20);
    return { x, y: Math.round(y), r, count: d.contributionCount, id: `t${i}` };
  });

  // ── Sequence timings ─────────────────────────────────────────────────
  let t = 0.8;
  let shipY = H / 2;

  const seq = targets.map(target => {
    const dist = Math.abs(target.y - shipY);
    const moveTime = Math.max(dist / MOVE_SPEED, 0.2);
    const moveStart = t;
    const arrivalTime = t + moveTime;
    const shootTime = arrivalTime + SHOOT_DELAY;
    const bulletDist = target.x - (SHIP_X + 28);
    const bulletDur = bulletDist / BULLET_SPEED;
    const hitTime = shootTime + bulletDur;

    shipY = target.y;
    t = hitTime + 0.35;

    return { ...target, moveStart, moveTime, arrivalTime, shootTime, bulletDur, hitTime };
  });

  const winShowTime = t;
  const winHideTime = t + 1.8;
  const totalDur = winHideTime + 0.5;

  function pct(time) {
    return fixed(Math.max(0, Math.min(1, time / totalDur)));
  }

  // ── Stars ─────────────────────────────────────────────────────────────
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

  // ── Ship shape (facing right, red arcade fighter) ──────────────────
  const shipShape = `
    <polygon points="30,0 -10,-14 -4,0 -10,14" fill="#cc1100"/>
    <polygon points="22,0 2,-7 -2,0 2,7" fill="#ff3322"/>
    <polygon points="-4,-10 -20,-22 -24,-12 -10,-5" fill="#880000"/>
    <polygon points="-4,10 -20,22 -24,12 -10,5" fill="#880000"/>
    <ellipse cx="-14" cy="0" rx="5" ry="4" fill="#ff6600" opacity="0.95">
      <animate attributeName="rx" values="5;9;5" dur="0.12s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.95;0.7;0.95" dur="0.12s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="-22" cy="-16" rx="3" ry="2" fill="#ff8800" opacity="0.7">
      <animate attributeName="rx" values="3;5;3" dur="0.15s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="-22" cy="16" rx="3" ry="2" fill="#ff8800" opacity="0.7">
      <animate attributeName="rx" values="3;5;3" dur="0.15s" repeatCount="indefinite"/>
    </ellipse>
  `;

  // ── Ship Y animation ───────────────────────────────────────────────
  const shipValuesArr = [];
  const shipKeyTimesArr = [];

  // start position
  shipValuesArr.push(`${SHIP_X},${H / 2}`);
  shipKeyTimesArr.push(0);

  seq.forEach((s, i) => {
    const prevY = i === 0 ? H / 2 : seq[i - 1].y;
    shipValuesArr.push(`${SHIP_X},${prevY}`);
    shipKeyTimesArr.push(pct(s.moveStart));
    shipValuesArr.push(`${SHIP_X},${s.y}`);
    shipKeyTimesArr.push(pct(s.arrivalTime));
  });

  // hold last position
  shipValuesArr.push(`${SHIP_X},${seq[seq.length - 1].y}`);
  shipKeyTimesArr.push(1);

  const splines = Array(shipValuesArr.length - 1).fill('0.42 0 0.58 1').join(';');

  const shipSVG = `
    <g>
      ${shipShape}
      <animateTransform attributeName="transform" type="translate"
        values="${shipValuesArr.join(';')}"
        keyTimes="${shipKeyTimesArr.join(';')}"
        calcMode="spline"
        keySplines="${splines}"
        dur="${totalDur}s"
        repeatCount="indefinite"/>
    </g>
  `;

  // ── Targets ───────────────────────────────────────────────────────
  const targetsSVG = seq.map(s => {
    const p0 = pct(s.hitTime);
    const p1 = pct(s.hitTime + 0.15);
    return `
    <g>
      <circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="#4fc3f7">
        <animate attributeName="opacity" values="1;1;0;0"
          keyTimes="0;${p0};${p1};1" dur="${totalDur}s" repeatCount="indefinite"/>
        <animate attributeName="r" values="${s.r};${s.r};${s.r * 2.5};${s.r * 2.5}"
          keyTimes="0;${p0};${p1};1" dur="${totalDur}s" repeatCount="indefinite"/>
      </circle>
      <ellipse cx="${s.x - s.r * 1.5}" cy="${s.y}" rx="${s.r * 2.5}" ry="${s.r * 0.35}" fill="#4fc3f7" opacity="0.2">
        <animate attributeName="opacity" values="0.2;0.2;0;0"
          keyTimes="0;${p0};${p1};1" dur="${totalDur}s" repeatCount="indefinite"/>
      </ellipse>
      <text x="${s.x}" y="${s.y + 4}" text-anchor="middle" font-size="${Math.max(8, Math.min(12, s.r))}px"
        fill="white" font-family="monospace" font-weight="bold">
        ${s.count}
        <animate attributeName="opacity" values="1;1;0;0"
          keyTimes="0;${p0};${p1};1" dur="${totalDur}s" repeatCount="indefinite"/>
      </text>
    </g>`;
  }).join('');

  // ── Bullets ───────────────────────────────────────────────────────
  const bulletsSVG = seq.map(s => {
    const p0 = pct(s.shootTime);
    const p1 = pct(s.shootTime + 0.04);
    const p2 = pct(s.hitTime - 0.04);
    const p3 = pct(s.hitTime);
    const startX = SHIP_X + 30;
    const endX = s.x - s.r;
    return `
    <rect height="2" rx="1" fill="#ffeb3b" y="${s.y - 1}" x="${startX}" width="18">
      <animate attributeName="opacity" values="0;0;1;1;0;0"
        keyTimes="0;${p0};${p1};${p2};${p3};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
      <animate attributeName="x" values="${startX};${startX};${startX};${endX};${endX};${startX}"
        keyTimes="0;${p0};${p1};${p2};${p3};1"
        calcMode="linear"
        dur="${totalDur}s" repeatCount="indefinite"/>
    </rect>`;
  }).join('');

  // ── You Win ───────────────────────────────────────────────────────
  const pw0 = pct(winShowTime);
  const pw1 = pct(winShowTime + 0.3);
  const pw2 = pct(winHideTime - 0.3);
  const pw3 = pct(winHideTime);

  const youWin = `
    <text x="${W / 2}" y="${H / 2 + 14}" text-anchor="middle"
      font-size="40" fill="#ffeb3b" font-family="monospace" font-weight="bold"
      letter-spacing="4" opacity="0">
      YOU WIN!
      <animate attributeName="opacity" values="0;0;1;1;0;0"
        keyTimes="0;${pw0};${pw1};${pw2};${pw3};1"
        dur="${totalDur}s" repeatCount="indefinite"/>
    </text>
    <text x="${W / 2}" y="${H / 2 + 44}" text-anchor="middle"
      font-size="14" fill="#4fc3f7" font-family="monospace" opacity="0">
      ${targets.reduce((sum, t) => sum + t.count, 0)} contributions destroyed
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
  <text x="12" y="${H - 8}" font-size="10" fill="#444" font-family="monospace">🚀 ${USER}'s contributions</text>
</svg>`;
}

async function main() {
  const days = await fetchContributions();
  const svg = generateSVG(days);
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/arcade.svg', svg);
  console.log(`Generated arcade.svg — ${days.length} contribution days`);
}

main();
