# Progress

## Status saat ini

Status: **Kode aplikasi selesai (Fase 0-6), menunggu setup manual manusia (Supabase + VPS) untuk Fase 7-8**.

Struktur project, tooling, migrasi database, kontrak antar-modul, dan seluruh command (`!grup`, `!user`, `!stok`, `!masuk`/`!keluar`/dll, `!help`, `!clear`) sudah diimplementasikan dan terintegrasi di `src/`. `npm run typecheck`, `npm run build`, dan `npm test` (151 test di 18 file) semuanya bersih dari root. Bot belum pernah dijalankan terhadap Supabase/WhatsApp sungguhan — langkah itu ada di `instruksi.txt` dan menunggu manusia.

## Keputusan yang sudah disepakati

- Bot dijalankan di VPS.
- Database utama menggunakan Supabase PostgreSQL.
- Bot dipakai secara internal oleh beberapa orang.
- Grup WhatsApp wajib didaftarkan sebelum dapat menggunakan bot.
- Satu grup terhubung ke satu gudang.
- Satu gudang dapat memiliki grup pengganti jika diperlukan.
- Ada Owner, Admin, dan User.
- Role Admin/User berlaku per grup atau gudang.
- Owner mengontrol pengangkatan Admin.
- User harus didaftarkan sebelum memakai bot.
- `!help` bersifat interaktif dengan quoted reply.
- Bantuan memakai asset gambar statis per topik.
- Response bot dikirim sebagai pesan baru, bukan mengedit response lama.
- Transaksi mendukung banyak item dalam satu batch.
- Mutasi menggunakan preview dan konfirmasi.
- Data transaksi tidak dihapus; pembatalan membuat movement pembalik.
- Saldo Ready dan Di Jalan dipisahkan.
- Pencarian stok per User menggunakan `stock_owner_id`.
- `!clear` dipisahkan dari command pembatalan stok.
- `!clear all` Owner-only dan disabled pada MVP.
- Sesi WhatsApp harus disimpan pada volume VPS permanen.
- Saldo stok selalu memiliki `stock_owner_id` (User) — tidak ada stok milik gudang bersama tanpa owner.
- MVP melacak kuantitas per SKU saja; tabel `stock_units` (serial/IMEI) disiapkan di schema tapi belum dipakai service manapun.
- User (bukan hanya Admin/Owner) dapat melihat seluruh stok gudang lewat `!stok list`.
- `!clear recent` boleh dijalankan Admin maupun Owner, tidak Owner-only.
- `MAX_BATCH_ITEMS` default 50 (asumsi, dapat diubah lewat env `MAX_BATCH_ITEMS` — lihat `instruksi.txt` poin 7 jika bisnis ingin angka lain).

## Fase implementasi

### Fase 0 — Project bootstrap

Status: **Selesai** (oleh manager)

- Project Node.js TypeScript (strict) dibuat di `src/`.
- Struktur folder 11 lapisan aplikasi dibuat.
- Docker Compose + Dockerfile dibuat (volume sesi WhatsApp + assets/help, healthcheck).
- `.env.example` dibuat.
- Logging dasar (`pino`) ditambahkan di `src/shared/logger.ts`.
- `npx tsc --noEmit` bersih dan test suite awal (`vitest`) lulus.

### Fase 1 — Database

Status: **Migrasi ditulis, belum dijalankan ke Supabase live** (menunggu manusia — lihat `instruksi.txt`)

- Schema 11 tabel ditulis di `migrations/0001_init_schema.sql`.
- Constraint unik dan CHECK (saldo tidak boleh negatif, dll) sudah ada di migrasi.
- Fungsi transaksi atomik `process_stock_movement()` ditulis di `migrations/0002_stock_movement_function.sql` (row-lock + validasi saldo negatif untuk keenam jenis movement).
- Rollback dan saldo negatif diuji lewat unit test dispatch/registry; pengujian langsung terhadap Supabase live menunggu `npm run db:migrate` dijalankan manusia sesuai `instruksi.txt`.

### Fase 2 — WhatsApp adapter

Status: **Selesai** (`src/whatsapp-adapter/`, `src/message-normalizer/`)

- QR login (`qr.ts`, `qrcode-terminal`), LocalAuth dengan session path persisten.
- Event `message_create` (dengan filter `fromMe`, non-grup, non-command).
- Normalisasi JID/nomor dan tokenisasi command (`message-normalizer/`).
- Reconnect dengan exponential backoff (`reconnect.ts`).
- Pengiriman response teks + gambar sebagai quoted reply baru (`send.ts`), termasuk eksekusi `!clear` (`clearAction`).

### Fase 3 — Access control

Status: **Selesai** (`src/access-control/`, `src/group-user-service/`)

- Owner bootstrap otomatis dari `OWNER_WHATSAPP_NUMBER` saat startup.
- `!grup daftar/status/aktif/nonaktif/list`, `!user tambah/role/aktif/nonaktif/list`.
- Role guard + resolusi akses terpusat (`resolveAccess.ts`) dengan bypass khusus `grup daftar` untuk Owner di grup belum terdaftar.
- Penolakan grup/User tidak terdaftar dengan pesan ramah.

### Fase 4 — Inventory

Status: **Selesai** (`src/inventory-service/`)

- CRUD produk, ringkasan dan daftar stok, stok per User/SKU/pencarian/menipis.
- Transaksi batch (`!masuk`/`!dijalan`/`!keluar`) dengan validasi all-or-nothing.
- Preview dan konfirmasi (`!ya`/`!cancel`) via `SessionService`.
- `!riwayat`, `!terima`, `!batal`, `!koreksi` (Admin/Owner, wajib alasan).

### Fase 5 — Interactive help

Status: **Selesai** (`src/conversation-session/`, `src/help-service/`)

- Session state 2 menit, quoted-reply validation terikat User+grup.
- Menu role-aware (gambar Admin tidak dikirim ke User biasa).
- Navigasi `!1`-`!9`, `!back`, `!cancel`, `!0`/`0` (bare digit reply diizinkan khusus untuk navigasi menu).
- Expiry sweep berkala (`expirySweep.ts`).

### Fase 6 — Moderation dan operasi

Status: **Selesai** (`src/chat-moderation-service/`)

- `!clear bot`/`!clear saya` (langsung), `!clear recent` (Admin+Owner, via konfirmasi).
- `!clear all` hanya terdaftar sebagai command jika `ENABLE_CLEAR_ALL=true` (default false pada MVP).
- Audit log untuk setiap aksi clear. Health endpoint `/health` (db + whatsapp ready).
- Catatan: eksekusi hapus pesan WhatsApp bersifat best-effort — WhatsApp hanya mengizinkan bot menghapus pesan yang ia kirim sendiri kecuali bot adalah admin grup; kegagalan per-pesan di-log, tidak menggagalkan seluruh perintah.

### Fase 7 — Local end-to-end test

Status: **Sebagian** — unit test (151 test) lulus untuk seluruh alur di atas menggunakan mock DB/WhatsApp. Skenario yang butuh Supabase + sesi WhatsApp sungguhan (restart container tanpa kehilangan sesi, dua User pakai help bersamaan di grup nyata, dsb.) BELUM dijalankan — menunggu `instruksi.txt` selesai dikerjakan manusia.

### Fase 8 — VPS deployment

Status: Pending — lihat `instruksi.txt` untuk seluruh langkah manual (Supabase, VPS, nomor WhatsApp dedicated, `docker compose up`, verifikasi restart/reconnect/backup).

## Blocker yang sudah diputuskan (2026-08-02)

- Stok selalu punya pemilik User (`stock_owner_id` NOT NULL) — sudah diterapkan di schema.
- MVP mulai dari kuantitas per SKU; serial/IMEI (`stock_units`) hanya scaffold.
- User boleh melihat seluruh stok gudang (`!stok list` terbuka untuk semua role).
- `!clear recent` boleh Admin dan Owner.
- Session menu/konfirmasi berlaku 2 menit (sudah ditetapkan sebelumnya di `implementation.md`).

## Asumsi non-blocking yang perlu dikonfirmasi sebelum go-live

- `MAX_BATCH_ITEMS` default 50 — ubah di `.env` jika bisnis menginginkan angka lain (lihat `instruksi.txt` poin 7).
- SKU diasumsikan unik per gudang (`UNIQUE(warehouse_id, sku)`), bukan unik global — masuk akal karena satu bot bisa melayani beberapa gudang/grup, tapi belum dikonfirmasi eksplisit ke pemilik produk.
- `!grup daftar <nama gudang>` mencocokkan nama gudang secara case-insensitive; nama yang sama menggabung ke gudang yang sama, nama baru membuat gudang baru.
- `!terima <nomor_transaksi> <jumlah>` mendukung penerimaan sebagian (partial) dari saldo Di Jalan; `!batal <nomor_transaksi>` tetap satu argumen sesuai spesifikasi asli.
- `!produk tambah`/`!produk ubah` memakai format satu baris dipisah `|`: `SKU | Nama | Satuan | MinStok | alias1,alias2` (tidak ada grammar eksplisit di spesifikasi asli).
- `!user tambah <nomor> <nama> user`: token terakhir divalidasi harus persis `"user"`; nilai lain ditolak dan mengarahkan ke `!user role` (mencegah promosi Admin tidak sengaja lewat typo).
- Nomor WhatsApp di `!user list` ditampilkan tersamar (4 digit awal + 3 digit akhir) sesuai prd.md §11.
- Penghapusan pesan WhatsApp (`!clear`) bersifat best-effort: bot hanya bisa menghapus pesannya sendiri kecuali menjadi admin grup WhatsApp; ini adalah batasan platform WhatsApp, bukan bug.
