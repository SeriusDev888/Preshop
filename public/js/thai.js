// 77 จังหวัดของไทย
export const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท',
  'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม',
  'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
  'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์',
  'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง',
  'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
  'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย',
  'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี',
];

// "เขตสายไหม" / "อำเภอเมืองเชียงใหม่" → "สายไหม" / "เมืองเชียงใหม่"
const strip = (s) => String(s || '').replace(/^(จังหวัด|อำเภอ|เขต|แขวง|ตำบล|จ\.|อ\.)\s*/, '').trim();

// ชื่อพื้นที่แบบสั้น: เขตใน กทม. / อ. ในต่างจังหวัด
export function areaLabel(province, district) {
  if (!province && !district) return '';
  const bkk = province === 'กรุงเทพมหานคร';
  return [district ? (bkk ? `เขต${district}` : `อ.${district}`) : '', province ? (bkk ? 'กรุงเทพฯ' : `จ.${province}`) : ''].filter(Boolean).join(' ');
}

// หาจังหวัด/อำเภอจากพิกัด (OpenStreetMap Nominatim)
export async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=th`);
    if (!r.ok) return null;
    const a = (await r.json()).address || {};
    // กทม.: city = กรุงเทพมหานคร, เขตอยู่ใน suburb · ต่างจังหวัด: province = จังหวัด..., อำเภออยู่ใน county
    let province = strip(a.province || a.state || '');
    if (!province && (/กรุงเทพ/.test(a.city || '') || a['ISO3166-2-lvl4'] === 'TH-10')) province = 'กรุงเทพมหานคร';
    if (!PROVINCES.includes(province)) province = PROVINCES.find((p) => province.includes(p)) || province;
    const cands = [a.county, a.suburb, a.city_district, a.district, a.municipality].filter(Boolean);
    const district = strip(cands.find((v) => /^(เขต|อำเภอ)/.test(v)) || a.county || '');
    const road = [a.road, a.quarter, a.village].filter(Boolean).join(' ');
    return { province, district, hint: road };
  } catch {
    return null;
  }
}
