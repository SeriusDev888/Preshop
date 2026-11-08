# Deploy Preshop ขึ้นออนไลน์ (ทดสอบ)

เลือกที่ใดที่หนึ่ง: **Render** หรือ **Railway** — ใช้โค้ดเดิมได้เลย
ต้องมี **ดิสก์ถาวร** ไว้เก็บโฟลเดอร์ข้อมูล (ฐานข้อมูล + รูป) ไม่งั้นข้อมูลหายทุกครั้งที่ deploy

## ขั้นที่ 0: เอาโค้ดขึ้น GitHub (ทำครั้งเดียว)

1. สมัคร https://github.com แล้วกด **New repository** ตั้งชื่อ `preshop` เลือก **Private** (ไม่ต้องติ๊กสร้าง README)
2. ในโฟลเดอร์ `C:\Yana` รันทีละบรรทัด (เปลี่ยน `USERNAME` เป็นชื่อ GitHub ของคุณ):

```bash
git init
git add .
git commit -m "Preshop first version"
git branch -M main
git remote add origin https://github.com/USERNAME/preshop.git
git push -u origin main
```

โฟลเดอร์ `data/` (ฐานข้อมูลทดสอบในเครื่อง) ไม่ถูกส่งขึ้นไป เพราะอยู่ใน `.gitignore` — บนเซิร์ฟเวอร์จะเริ่มจากฐานข้อมูลว่าง

---

## ทาง A: Render (แนะนำ ตั้งค่าน้อยสุด)

1. สมัคร https://render.com ด้วยบัญชี GitHub
2. กด **New → Blueprint** → เลือก repo `preshop` → Render อ่าน `render.yaml` แล้วสร้างให้ครบ
   (เว็บ Node 24, ภูมิภาคสิงคโปร์, ดิสก์ 1 GB ที่ `/var/data`)
3. ใส่ค่า `ADMIN_PHONES` = เบอร์ของคุณ (เช่น `0812345678`) → **Apply**
4. รอ 2–3 นาที จะได้ลิงก์ เช่น `https://preshop.onrender.com`

ค่าใช้จ่าย: แผน Starter ประมาณ 7 ดอลลาร์/เดือน + ดิสก์ราว 0.25 ดอลลาร์/GB
(แผน Free ใช้ดิสก์ถาวรไม่ได้ ข้อมูลจะหาย)

## ทาง B: Railway

1. สมัคร https://railway.com ด้วยบัญชี GitHub
2. **New Project → Deploy from GitHub repo** → เลือก `preshop`
3. คลิกที่ service → แท็บ **Variables** เพิ่ม:
   - `NODE_ENV` = `production`
   - `DATA_DIR` = `/data`
   - `ADMIN_PHONES` = เบอร์ของคุณ
4. คลิกขวาที่ service → **Attach Volume** → Mount path = `/data`
5. แท็บ **Settings → Networking → Generate Domain** จะได้ลิงก์ `https://xxx.up.railway.app`

ค่าใช้จ่าย: แผน Hobby ประมาณ 5 ดอลลาร์/เดือน (รวมเครดิตใช้งาน)

---

## หลัง deploy

- **ทดสอบ:** เปิดลิงก์ → เข้าสู่ระบบ ตอนนี้ยังเป็น **โหมดทดสอบ SMS** (รหัส OTP ขึ้นบนจอ)
  เหมาะกับให้คนในบ้าน/เพื่อนลองใช้ **ยังไม่ควรเปิดให้ลูกค้าจริง** เพราะใครก็เข้าบัญชีเบอร์ไหนก็ได้
- **ใส่ร้านตัวอย่าง (ไม่บังคับ):** Render → Shell / Railway → คลิก service แล้วเปิด terminal รัน `node scripts/seed.js`
- **อัปเดตเว็บ:** แก้โค้ดในเครื่อง แล้ว

```bash
git add .
git commit -m "อธิบายสิ่งที่แก้"
git push
```

  ระบบจะ deploy ใหม่เองภายในไม่กี่นาที ข้อมูลในดิสก์ไม่หาย
  ถ้าแก้ CSS/JS ให้เปลี่ยน `VERSION` ใน `public/sw.js` ด้วย ผู้ใช้จะได้ไฟล์ใหม่ทันที

- **สำรองข้อมูล:** Render มี snapshot ของดิสก์อัตโนมัติรายวัน · Railway ตั้ง backup ได้ในหน้า Volume

## ก่อนเปิดให้ลูกค้าจริง
1. ต่อ SMS: เพิ่ม Variables `SMS_PROVIDER=thaibulksms`, `SMS_API_KEY`, `SMS_API_SECRET`, `SMS_SENDER`
2. ผูกโดเมนของตัวเอง (Custom Domain ในหน้า Render/Railway) — ได้ HTTPS ให้อัตโนมัติ
3. ทำหน้านโยบายความเป็นส่วนตัว
4. จากนั้นทำแอป Play Store ต่อได้ตาม [PLAYSTORE.md](PLAYSTORE.md)
