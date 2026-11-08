# เอา Preshop ขึ้น Google Play Store

Preshop เป็น **PWA** (เว็บที่ติดตั้งเป็นแอปได้) แล้ว ตอนขึ้น Play Store จะห่อเว็บเป็นแอป Android แบบ
**Trusted Web Activity (TWA)** — แอปเปิดเว็บของเราแบบเต็มจอ ไม่มีแถบเบราว์เซอร์ และอัปเดตตามเว็บทันที
ไม่ต้องส่งแอปเวอร์ชันใหม่ทุกครั้งที่แก้เว็บ

## สิ่งที่ต้องมีก่อน

1. **เว็บที่ออนไลน์จริงผ่าน HTTPS** พร้อมโดเมน เช่น `https://preshop.co.th` (TWA ใช้กับ localhost ไม่ได้)
2. **บัญชี Google Play Console** — ค่าสมัครครั้งเดียว 25 ดอลลาร์ (https://play.google.com/console)
   บัญชีส่วนตัวที่สมัครใหม่ Google กำหนดให้ทดสอบแบบปิดกับผู้ทดสอบจำนวนหนึ่งก่อนเปิดสาธารณะ — เช็กเงื่อนไขล่าสุดใน Play Console
3. **นโยบายความเป็นส่วนตัว (Privacy Policy)** เป็นลิงก์หน้าเว็บ — แอปเก็บเบอร์โทรและตำแหน่ง จึงต้องมี
4. ต่อ **SMS OTP จริง** แล้ว (ดู README)

## ขั้นตอน

### 1) ตรวจว่าเว็บพร้อมเป็นแอป
เปิดเว็บจริงใน Chrome → `F12` → แท็บ **Application → Manifest** ต้องไม่มีข้อผิดพลาด
และ **Service workers** ต้องขึ้นว่า activated

### 2) สร้างแอป Android ด้วย PWABuilder (ฟรี ไม่ต้องเขียนโค้ด)
1. ไปที่ https://www.pwabuilder.com ใส่ URL เว็บ แล้วกด Start
2. เลือก **Package for stores → Android → Google Play**
3. ตั้งค่า:
   - Package ID: เช่น `th.co.preshop.app` (เปลี่ยนภายหลังไม่ได้)
   - App name: `Preshop` · Launcher name: `Preshop`
   - Theme / Status bar color: `#D62828`
   - Start URL: `/?source=app`
   - Signing key: **Create new** — แล้ว **เก็บไฟล์ `.keystore` และรหัสผ่านไว้ให้ดี** หายแล้วอัปเดตแอปไม่ได้
4. ดาวน์โหลดไฟล์ zip จะได้:
   - `app-release-bundle.aab` → ไฟล์ที่อัปโหลดขึ้น Play Store
   - `assetlinks.json` → ไฟล์ยืนยันว่าแอปกับเว็บเป็นเจ้าของเดียวกัน

### 3) วางไฟล์ยืนยันโดเมน
คัดลอก `assetlinks.json` ไปไว้ที่ `public/.well-known/assetlinks.json` แล้ว deploy
ต้องเปิดได้ที่ `https://โดเมนของคุณ/.well-known/assetlinks.json`
(ถ้าไม่มีไฟล์นี้ แอปจะยังเปิดได้แต่มีแถบ URL ด้านบนเหมือนเบราว์เซอร์)

> หลังอัปโหลดขึ้น Play Console แล้วเปิดใช้ **Play App Signing** ให้ไปที่
> Setup → App signing → คัดลอก **SHA-256 certificate fingerprint** ของ Google
> แล้วเพิ่มลงใน `assetlinks.json` อีกค่าหนึ่ง (ใส่ได้หลายค่าใน `sha256_cert_fingerprints`)

### 4) อัปโหลดขึ้น Play Console
1. Create app → ชื่อ Preshop, ภาษาไทย, ประเภท App, ฟรี
2. กรอก Store listing: คำอธิบาย, ไอคอน 512×512 (ใช้ `public/icons/icon-512.png`),
   ภาพหน้าจอมือถืออย่างน้อย 2 รูป, Feature graphic 1024×500
3. กรอก App content: Privacy policy, Data safety (เก็บ เบอร์โทร, ชื่อ, ตำแหน่ง, รูปสลิป),
   Content rating, Target audience
4. Testing → Closed testing → อัปโหลด `.aab` → เพิ่มอีเมลผู้ทดสอบ
5. ผ่านการทดสอบแล้ว → Production → ส่งรีวิว (ปกติไม่กี่วัน)

## หลังขึ้น Store แล้ว
- แก้เว็บ = แอปอัปเดตทันที ไม่ต้องส่งใหม่
- ต้องส่งแอปเวอร์ชันใหม่เฉพาะตอนเปลี่ยน ไอคอน / ชื่อแอป / สีธีม / package
- ถ้าแก้ไฟล์ CSS/JS แล้วผู้ใช้ยังเห็นของเก่า ให้เปลี่ยน `VERSION` ใน `public/sw.js` (เช่น `preshop-v2`)

## ถ้าอนาคตต้องการฟีเจอร์ native มากขึ้น
เช่น แจ้งเตือนออเดอร์ใหม่แบบ push ตอนปิดแอป หรือขึ้น App Store (iPhone) —
ใช้ **Capacitor** ห่อเว็บเดิมเป็นแอปได้ โค้ดหน้าเว็บเกือบทั้งหมดใช้ต่อได้
