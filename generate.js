const fs = require('fs');

const USER = process.env.GITHUB_USER;
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

function generateSVG(days) {
  const W = 900, H = 200;
  const totalDuration = 8; // секунд на одну петлю

  // Кожен день з контрибуціями = комета
  // Розмір комети залежить від кількості контрибуцій
  const comets = days.slice(-30).map((d, i) => {
    const size = Math.min(4 + d.contributionCount, 12);
    const y = 20 + Math.random() * (H - 40);
    const delay = (i / 30) * totalDuration;
    return { size, y, delay, count: d.contributionCount };
  });

  const cometsSVG = comets.map(({ size, y, delay, count }) => `
    <g>
      <!-- Комета -->
      <circle r="${size}" fill="#4fc3f7" opacity="0.9">
        <animateMotion
          dur="${totalDuration}s"
          begin="${delay}s"
          repeatCount="indefinite"
          path="M ${W + size} ${y} L -${size * 2} ${y}"
        />
      </circle>
      <!-- Хвіст комети -->
      <ellipse rx="${size * 3}" ry="${size * 0.4}" fill="#4fc3f7" opacity="0.3">
        <animateMotion
          dur="${totalDuration}s"
          begin="${delay}s"
          repeatCount="indefinite"
          path="M ${W + size * 4} ${y} L 0 ${y}"
        />
      </ellipse>
      <!-- Число контрибуцій -->
      <text font-size="8" fill="#fff" text-anchor="middle" dy="3">
        ${count}
        <animateMotion
          dur="${totalDuration}s"
          begin="${delay}s"
          repeatCount="indefinite"
          path="M ${W + size} ${y - size - 4} L -${size * 2} ${y - size - 4}"
        />
      </text>
    </g>
  `).join('');

  // Корабель стріляє в ліву сторону
  const shipSVG = `
    <g id="ship">
      <!-- Корпус -->
      <polygon points="0,-10 -20,10 20,10" fill="#a5d6a7"/>
      <!-- Кабіна -->
      <polygon points="0,-6 -8,4 8,4" fill="#e0f2f1"/>
      <!-- Двигун лівий -->
      <rect x="-18" y="8" width="8" height="5" fill="#ff8a65"/>
      <!-- Двигун правий -->
      <rect x="10" y="8" width="8" height="5" fill="#ff8a65"/>
      <!-- Вогонь двигуна -->
      <ellipse cx="-14" cy="16" rx="4" ry="3" fill="#ffcc02" opacity="0.8">
        <animate attributeName="ry" values="3;5;3" dur="0.2s" repeatCount="indefinite"/>
      </ellipse>
      <ellipse cx="14" cy="16" rx="4" ry="3" fill="#ffcc02" opacity="0.8">
        <animate attributeName="ry" values="3;5;3" dur="0.2s" repeatCount="indefinite"/>
      </ellipse>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="60,100; 60,40; 60,160; 60,80; 60,100"
        dur="6s"
        repeatCount="indefinite"
        calcMode="spline"
        keySplines="0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1"
      />
    </g>
  `;

  // Постріли
  const bulletsSVG = Array.from({length: 3}, (_, i) => `
    <rect width="20" height="2" fill="#ffeb3b" rx="1" opacity="0">
      <animate attributeName="opacity" values="0;1;1;0" dur="1s" begin="${i * 0.4}s" repeatCount="indefinite"/>
      <animateMotion
        dur="1s"
        begin="${i * 0.4}s"
        repeatCount="indefinite"
        path="M 80,100 L ${W},100"
      />
    </rect>
  `).join('');

  // Зірки на фоні
  const stars = Array.from({length: 60}, () => {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 1.5 + 0.5;
    const dur = (Math.random() * 2 + 1).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${(Math.random() * 0.5 + 0.3).toFixed(2)}">
      <animate attributeName="opacity" values="0.3;1;0.3" dur="${dur}s" repeatCount="indefinite"/>
    </circle>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0d1117" rx="8"/>
  ${stars}
  ${cometsSVG}
  ${shipSVG}
  ${bulletsSVG}
  <!-- Лейбл -->
  <text x="10" y="${H - 8}" font-size="10" fill="#444" font-family="monospace">
    🚀 ${USER}'s contributions
  </text>
</svg>`;
}

async function main() {
  const days = await fetchContributions();
  const svg = generateSVG(days);
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/arcade.svg', svg);
  console.log(`Generated arcade.svg with ${days.length} contribution days`);
}

main();
