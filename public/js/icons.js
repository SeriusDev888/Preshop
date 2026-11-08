// ไอคอน/ภาพประกอบ SVG ของ Preshop (วาดเอง สีส้ม-ขาว-น้ำตาลเข้ม ให้เข้ากับโลโก้)
const O = '#d62828';
const D = '#111111';
const L = '#ffd5d5';
const svg = (body, vb = '0 0 48 48') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  // หมวดร้าน
  dessert: svg(`<path d="M6 24h36c0 9-8 16-18 16S6 33 6 24z" fill="${O}"/><path d="M14 34h20" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="17" cy="20" r="4.5" fill="${L}"/><circle cx="26" cy="18" r="4.5" fill="#fff" stroke="${O}" stroke-width="2"/><circle cx="33" cy="21" r="4" fill="${L}"/>
    <path d="M20 8c0 3 3 3 3 6M27 6c0 3 3 3 3 6" stroke="${D}" stroke-width="2" stroke-linecap="round" fill="none"/>`),
  food: svg(`<rect x="6" y="18" width="36" height="22" rx="5" fill="${O}"/><rect x="10" y="22" width="13" height="14" rx="3" fill="#fff"/><rect x="25" y="22" width="13" height="6" rx="2" fill="${L}"/><rect x="25" y="30" width="13" height="6" rx="2" fill="${L}"/>
    <path d="M12 28h9M12 31h7" stroke="${O}" stroke-width="2" stroke-linecap="round"/><path d="M10 14h28" stroke="${D}" stroke-width="3" stroke-linecap="round"/>`),
  bakery: svg(`<path d="M8 26c0-9 7-14 16-14s16 5 16 14v10a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="${O}"/><path d="M16 22v14M24 20v16M32 22v14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="24" cy="9" r="3" fill="${D}"/>`),
  drink: svg(`<path d="M12 14h24l-3 26a3 3 0 0 1-3 2.6H18a3 3 0 0 1-3-2.6z" fill="${O}"/><path d="M13.5 24h21" stroke="#fff" stroke-width="2.5"/><circle cx="20" cy="32" r="2" fill="#fff"/><circle cx="27" cy="35" r="2" fill="#fff"/><circle cx="26" cy="29" r="1.6" fill="#fff"/>
    <path d="M26 14l4-9h5" stroke="${D}" stroke-width="2.5" stroke-linecap="round" fill="none"/>`),
  merit: svg(`<path d="M24 8c4 5 4 11 0 16-4-5-4-11 0-16z" fill="${O}"/><path d="M24 24c-5-1-10-5-11-11 5 0 10 4 11 11zM24 24c5-1 10-5 11-11-5 0-10 4-11 11z" fill="${L}" stroke="${O}" stroke-width="1.5"/>
    <path d="M8 28h32l-4 12H12z" fill="${O}"/><path d="M14 33h20" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`),
  goods: svg(`<path d="M24 6l16 8v20l-16 8-16-8V14z" fill="${O}"/><path d="M8 14l16 8 16-8M24 22v20" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" fill="none"/><path d="M16 10l16 8" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>`),
  other: svg(`<path d="M10 18h28l-2 22H12z" fill="${O}"/><path d="M17 18v-3a7 7 0 0 1 14 0v3" stroke="${D}" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="17" y="24" width="14" height="11" rx="2" fill="#fff"/><path d="M20 29.5l2.5 2.5 5-5" stroke="${O}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  all: svg(`<rect x="8" y="8" width="14" height="14" rx="4" fill="${O}"/><rect x="26" y="8" width="14" height="14" rx="4" fill="${L}"/><rect x="8" y="26" width="14" height="14" rx="4" fill="${L}"/><rect x="26" y="26" width="14" height="14" rx="4" fill="${O}"/>`),

  // ฟีเจอร์
  calendar: svg(`<rect x="7" y="11" width="34" height="30" rx="6" fill="${O}"/><rect x="11" y="19" width="26" height="18" rx="3" fill="#fff"/><path d="M15 8v6M33 8v6" stroke="${D}" stroke-width="3" stroke-linecap="round"/><path d="M18 28l4 4 8-8" stroke="${O}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  pin: svg(`<path d="M24 42s-13-12-13-22a13 13 0 0 1 26 0c0 10-13 22-13 22z" fill="${O}"/><circle cx="24" cy="20" r="5" fill="#fff"/><ellipse cx="24" cy="43" rx="8" ry="2" fill="${L}"/>`),
  scooter: svg(`<circle cx="13" cy="34" r="6" fill="${D}"/><circle cx="35" cy="34" r="6" fill="${D}"/><circle cx="13" cy="34" r="2.5" fill="#fff"/><circle cx="35" cy="34" r="2.5" fill="#fff"/>
    <path d="M13 34h14l5-14h6" stroke="${O}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="8" y="16" width="14" height="12" rx="3" fill="${O}"/><path d="M12 22h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`),
  store: svg(`<path d="M8 18l3-9h26l3 9z" fill="${O}"/><path d="M8 18a5 5 0 0 0 10 0 5 5 0 0 0 12 0 5 5 0 0 0 10 0" fill="${L}"/><rect x="10" y="22" width="28" height="18" rx="2" fill="${O}"/><rect x="20" y="28" width="8" height="12" fill="#fff"/>`),
  qr: svg(`<rect x="6" y="6" width="36" height="36" rx="7" fill="${O}"/><rect x="11" y="11" width="10" height="10" rx="2" fill="#fff"/><rect x="27" y="11" width="10" height="10" rx="2" fill="#fff"/><rect x="11" y="27" width="10" height="10" rx="2" fill="#fff"/>
    <rect x="14" y="14" width="4" height="4" fill="${D}"/><rect x="30" y="14" width="4" height="4" fill="${D}"/><rect x="14" y="30" width="4" height="4" fill="${D}"/><path d="M27 27h4v4h-4zM33 33h4v4h-4zM33 27h4v2h-4zM27 34h3v3h-3z" fill="#fff"/>`),
  chart: svg(`<rect x="6" y="6" width="36" height="36" rx="7" fill="${L}"/><rect x="12" y="24" width="6" height="12" rx="2" fill="${O}"/><rect x="21" y="16" width="6" height="20" rx="2" fill="${O}"/><rect x="30" y="20" width="6" height="16" rx="2" fill="${D}"/>`),
  list: svg(`<rect x="9" y="6" width="30" height="36" rx="5" fill="${O}"/><rect x="17" y="3" width="14" height="7" rx="3" fill="${D}"/><path d="M15 19h18M15 26h18M15 33h11" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`),
  bell: svg(`<path d="M24 7a11 11 0 0 1 11 11v8l4 7H9l4-7v-8A11 11 0 0 1 24 7z" fill="${O}"/><path d="M19 37a5 5 0 0 0 10 0" fill="${D}"/><circle cx="35" cy="11" r="5" fill="${D}"/>`),
  chat: svg(`<path d="M8 10h32a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H20l-8 7v-7H8a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z" fill="${O}"/><path d="M14 19h20M14 25h13" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`),
  shops: svg(`<rect x="4" y="18" width="18" height="20" rx="3" fill="${L}"/><rect x="26" y="12" width="18" height="26" rx="3" fill="${O}"/><path d="M4 22h18M26 18h18" stroke="${D}" stroke-width="2.5"/><rect x="31" y="26" width="8" height="12" fill="#fff"/><rect x="9" y="28" width="8" height="10" fill="${O}"/>`),
  money: svg(`<rect x="5" y="13" width="38" height="24" rx="5" fill="${O}"/><circle cx="24" cy="25" r="6" fill="#fff"/><path d="M24 21.5v7M22 23h3a1.5 1.5 0 0 1 0 3h-2" stroke="${O}" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="11" cy="25" r="2" fill="#fff"/><circle cx="37" cy="25" r="2" fill="#fff"/>`),
};

export const CATEGORIES = [
  { key: 'dessert', th: 'ขนมไทย' },
  { key: 'food', th: 'อาหาร' },
  { key: 'bakery', th: 'เบเกอรี่' },
  { key: 'drink', th: 'เครื่องดื่ม' },
  { key: 'merit', th: 'ชุดทำบุญ' },
  { key: 'goods', th: 'ของใช้ / สิ่งของ' },
  { key: 'other', th: 'อื่นๆ' },
];
export const catTh = (k) => CATEGORIES.find((c) => c.key === k)?.th || 'อื่นๆ';
export const catIcon = (k) => ICONS[k] || ICONS.other;

// ภาพประกอบหน้าแรก: ถุง Preshop + ปฏิทิน + ถ้วยขนม + หมุดแผนที่ + รถส่ง
export const HERO_ART = `<svg viewBox="0 0 520 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ภาพประกอบ สั่งขนมล่วงหน้า">
  <circle cx="270" cy="215" r="185" fill="#fff0f0"/>
  <circle cx="270" cy="215" r="130" fill="#ffe0e0"/>
  <path d="M60 352h420" stroke="#e6e6e6" stroke-width="3" stroke-linecap="round"/>
  <g class="float">
    <path d="M196 140c0-40 26-66 74-66s74 26 74 66" stroke="#d62828" stroke-width="22" fill="none" stroke-linecap="round"/>
    <path d="M150 150h240l-18 180a24 24 0 0 1-24 22H192a24 24 0 0 1-24-22z" fill="#d62828"/>
    <rect x="205" y="186" width="130" height="112" rx="18" fill="#fff"/>
    <rect x="228" y="174" width="12" height="28" rx="6" fill="#fff" stroke="#d62828" stroke-width="5"/>
    <rect x="300" y="174" width="12" height="28" rx="6" fill="#fff" stroke="#d62828" stroke-width="5"/>
    <path d="M222 222h96" stroke="#d62828" stroke-width="7" stroke-linecap="round"/>
    <path d="M246 258l18 18 34-34" stroke="#d62828" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M380 92l14-26M400 116l24-16M404 146l28-4" stroke="#d62828" stroke-width="9" stroke-linecap="round"/>
  </g>
  <g class="float d2">
    <rect x="44" y="200" width="104" height="88" rx="18" fill="#fff" stroke="#e6e6e6" stroke-width="2"/>
    <path d="M60 240h72c0 20-16 34-36 34s-36-14-36-34z" fill="#d62828"/>
    <circle cx="80" cy="234" r="9" fill="#ffd5d5"/><circle cx="98" cy="230" r="9" fill="#fff" stroke="#d62828" stroke-width="3"/><circle cx="114" cy="235" r="8" fill="#ffd5d5"/>
    <path d="M86 214c0 5 5 5 5 10M100 210c0 5 5 5 5 10" stroke="#111111" stroke-width="3" stroke-linecap="round" fill="none"/>
  </g>
  <g class="float d3">
    <path d="M440 250s-30-28-30-52a30 30 0 0 1 60 0c0 24-30 52-30 52z" fill="#111111"/>
    <circle cx="440" cy="198" r="11" fill="#fff"/>
    <ellipse cx="440" cy="258" rx="18" ry="5" fill="#e6e6e6"/>
  </g>
  <g>
    <rect x="368" y="306" width="74" height="22" rx="11" fill="#111111"/>
    <text x="405" y="322" text-anchor="middle" font-family="Prompt, sans-serif" font-size="13" font-weight="600" fill="#fff">≤ 5 กม.</text>
  </g>
</svg>`;

// ภาพพื้นหลังสไลด์/ปกร้าน สำหรับร้านที่ยังไม่มีรูปปก: ลายไอคอนตามหมวดบนพื้นแดง-ดำ
const place = (icon, x, y, size, opacity = 1) =>
  icon.replace('<svg ', `<svg x="${x}" y="${y}" width="${size}" height="${size}" opacity="${opacity}" `);
export function bannerArt(category = 'other', seed = 0) {
  const ic = ICONS[category] || ICONS.other;
  const tones = [['#111111', '#3a0d0d'], ['#1b1b1f', '#5a1010'], ['#0d0d0d', '#7a1414']];
  const [c1, c2] = tones[seed % tones.length];
  let pattern = '';
  for (let r = 0; r < 5; r++) for (let c = 0; c < 12; c++) {
    if ((r + c + seed) % 3) continue;
    pattern += place(ic, c * 110 + (r % 2) * 55 - 20, r * 110 - 10, 54, 0.1);
  }
  return `<svg viewBox="0 0 1200 500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="bg${seed}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="1200" height="500" fill="url(#bg${seed})"/>
    ${pattern}
    <circle cx="930" cy="250" r="210" fill="#d62828" opacity="0.9"/>
    <circle cx="930" cy="250" r="150" fill="#fff"/>
    ${place(ic, 830, 150, 200)}
  </svg>`;
}
