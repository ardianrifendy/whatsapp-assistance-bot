# Implementation Plan

## Tujuan

Membangun bot stok internal berbasis WhatsApp yang berjalan di VPS, memakai Supabase PostgreSQL sebagai database utama, dan membatasi akses berdasarkan grup, pengguna, serta role.

## Stack

- Node.js dengan TypeScript strict.
- `whatsapp-web.js` sebagai adapter WhatsApp Web.
- Supabase PostgreSQL sebagai database utama.
- Drizzle ORM atau `pg` untuk query dan transaksi PostgreSQL.
- Docker Compose untuk deployment VPS.
- Volume persisten untuk sesi WhatsApp dan file asset bantuan.
- Timezone aplikasi: `Asia/Jakarta`.

## Lapisan aplikasi

1. `whatsapp-adapter`: menerima pesan, reply, media, group event, QR, dan status koneksi.
2. `message-normalizer`: menormalisasi JID, nomor, chat ID, command, dan metadata pesan.
3. `access-control`: memeriksa Owner, grup terdaftar, User aktif, dan role.
4. `conversation-session`: menangani menu `!help`, reply bernomor, input bertahap, konfirmasi, dan expiry.
5. `command-router`: memetakan command ke handler beserta role yang diizinkan.
6. `inventory-service`: validasi dan transaksi stok.
7. `group-user-service`: registrasi gudang, grup, User, dan role.
8. `help-service`: mengirim teks bantuan dan asset gambar berdasarkan role/topik.
9. `chat-moderation-service`: menangani `!clear` dengan batasan privilege.
10. `audit-service`: menyimpan seluruh aktivitas penting.
11. `persistence`: query Supabase, migrasi, transaksi, dan idempotensi pesan.

## Urutan pemrosesan pesan

1. Terima event `message` atau `message_create`.
2. Abaikan response bot yang bukan command.
3. Normalisasi `from`, `author`, JID, dan Group ID.
4. Cek `processed_messages` agar pesan tidak diproses dua kali.
5. Resolusi conversation session jika pesan merupakan quoted reply.
6. Validasi grup terdaftar dan gudang aktif.
7. Validasi User aktif dan role.
8. Parse serta validasi input.
9. Untuk mutasi, tampilkan preview dan minta konfirmasi.
10. Jalankan transaksi PostgreSQL atomik.
11. Simpan audit log.
12. Kirim response baru sebagai reply.

## Database inti

- `warehouses`: data gudang.
- `bot_groups`: grup WhatsApp yang diizinkan dan relasinya ke gudang.
- `bot_users`: identitas nomor WhatsApp.
- `group_members`: keanggotaan dan role per grup/gudang.
- `products`: SKU, nama, alias, satuan, minimum stok, dan mode tracking.
- `stock_balances`: saldo Ready dan Di Jalan.
- `stock_movements`: ledger transaksi yang tidak dihapus.
- `stock_units`: opsional untuk barang ber-IMEI atau serial number.
- `conversation_sessions`: state menu dan input bertahap.
- `processed_messages`: idempotensi pesan.
- `audit_logs`: log keamanan dan operasional.

## Aturan transaksi

- `!masuk`: menambah saldo Ready.
- `!dijalan`: menambah saldo Di Jalan.
- `!terima`: mengurangi Di Jalan dan menambah Ready berdasarkan transaksi sebelumnya.
- `!keluar`: mengurangi Ready.
- `!koreksi`: hanya Admin/Owner, wajib alasan.
- `!batal`: membuat transaksi pembalik, bukan menghapus transaksi.
- Batch bersifat all-or-nothing jika satu baris tidak valid.
- Saldo tidak boleh negatif.
- Satu invoice/PO tidak boleh diproses dua kali.

## Interactive help

`!help` mengirim gambar panduan utama dan menu teks berbasis quoted reply. Submenu dikirim sebagai pesan baru, bukan edit pesan lama.

Asset yang disiapkan:

```text
assets/help/help-main.png
assets/help/help-stock.png
assets/help/help-transaction.png
assets/help/help-in-transit.png
assets/help/help-history.png
assets/help/help-admin.png
assets/help/help-confirmation.png
```

Sesi menu terikat pada User, grup, dan ID pesan. Sesi kedaluwarsa setelah 2 menit.

## Command canonical

### Navigasi

```text
!help
!help stok
!help transaksi
!menu
!back
!cancel
```

### Stok

```text
!stok
!stok list
!stok saya
!stok user <nama|nomor>
!stok sku <sku>
!stok cari <kata>
```

### Transaksi

```text
!masuk <referensi>
!dijalan <referensi>
!terima <transaction_id>
!keluar <referensi>
!riwayat [sku]
!koreksi <sku> <jumlah> <alasan>
!batal <transaction_id>
```

### Manajemen

```text
!grup daftar <nama gudang>
!grup status
!grup aktif
!grup nonaktif
!user tambah
!user role
!user aktif
!user nonaktif
!user list
!produk tambah
!produk ubah
!produk nonaktif
!audit
!status
```

### Chat cleanup

```text
!clear bot
!clear saya
!clear recent <jumlah>
!clear all
```

## Deployment

- Satu service bot di VPS.
- Docker Compose dengan `restart: unless-stopped`.
- Volume persisten untuk sesi WhatsApp.
- Semua secret berada di environment variable.
- Health check untuk proses Node dan koneksi database.
- Backup database terjadwal.
- `!clear all` Owner-only dan disabled pada MVP sampai diuji.

## Verifikasi implementasi

- Unit test parser command.
- Unit test role guard.
- Test idempotensi `message_id`.
- Test saldo tidak negatif.
- Test transaksi batch all-or-nothing.
- Test sesi help dan expiry.
- Test group registry.
- Test restart VPS tanpa kehilangan sesi.
- Test restore backup Supabase.
