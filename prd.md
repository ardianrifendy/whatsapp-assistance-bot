# Product Requirements Document

## Ringkasan produk

Bot Stok adalah asisten inventori internal yang digunakan melalui grup WhatsApp resmi. Bot membantu User dan Admin melihat stok, mencatat pergerakan barang, menerima barang dalam perjalanan, membaca riwayat, dan melakukan administrasi sesuai role.

## Masalah yang diselesaikan

- Data stok sering tersebar di chat dan sulit dicari.
- Perubahan stok tidak selalu memiliki penanggung jawab yang jelas.
- Admin membutuhkan riwayat perubahan dan koreksi.
- Grup WhatsApp harus dapat digunakan sebagai interface operasional tanpa dashboard tambahan.
- Akses bot perlu dibatasi agar nomor yang tidak berwenang tidak dapat membaca atau mengubah data.

## Sasaran pengguna

### Owner

Pemilik sistem yang mengontrol registrasi grup, gudang, dan Admin.

### Admin

Pengelola operasional gudang dan pengguna sistem.

### User

Operator yang melakukan pengecekan dan transaksi stok harian.

## Prinsip produk

- Aman secara default.
- Command mutasi selalu dapat dilacak.
- Grup adalah konteks gudang.
- Role disimpan per grup/gudang.
- User tidak perlu menghafal seluruh command karena ada `!help` interaktif.
- Mutasi stok memerlukan preview dan konfirmasi.
- Transaksi tidak dihapus, tetapi dibalik melalui transaksi koreksi.
- Response bot selalu berupa pesan baru yang me-reply konteks sebelumnya.

## Scope MVP

- Registrasi grup dan mapping ke gudang.
- Registrasi User dan role Admin/User.
- Produk dengan SKU, nama, alias, satuan, dan minimum stok.
- Saldo Ready dan Di Jalan.
- Transaksi masuk, keluar, Di Jalan, terima, koreksi, dan batal.
- Daftar semua stok, stok User tertentu, stok saya, dan pencarian SKU.
- Batch transaction multi-item.
- `!help` interaktif dengan gambar bantuan.
- Riwayat dan audit log.
- Clear chat terbatas.
- Deployment VPS dan Supabase.

## Non-scope MVP

- AI natural language.
- Dashboard web.
- Integrasi marketplace.
- Broadcast promosi.
- WhatsApp Cloud API.
- Multi-cabang dengan aturan kompleks.
- Barcode scanner.

## Acceptance criteria

### Akses

- Grup yang belum terdaftar tidak dapat memakai command stok.
- User yang belum terdaftar ditolak meskipun menjadi anggota grup.
- User hanya dapat menjalankan command sesuai role.
- Owner dapat mendaftarkan grup dari dalam grup.
- Role Admin hanya dapat diberikan atau dicabut oleh Owner.

### Stok

- Saldo Ready dan Di Jalan tampil terpisah.
- Stok tidak pernah menjadi negatif.
- Satu batch invalid tidak menghasilkan perubahan parsial.
- Pesan yang sama tidak menggandakan transaksi.
- Setiap transaksi memiliki ID, pelaku, referensi, dan waktu.
- Pembatalan tidak menghapus ledger asli.

### Help

- `!help` menampilkan panduan visual dan menu role-aware.
- Menu hanya merespons quoted reply yang berasal dari User yang sama.
- Menu kedaluwarsa otomatis.
- User dapat kembali, membatalkan, dan menutup menu.
- Gambar Admin tidak dikirim kepada User.

### Chat cleanup

- `!clear bot` tidak mengubah database stok.
- `!clear recent` membutuhkan role yang sesuai dan konfirmasi.
- `!clear all` tidak aktif pada MVP sebelum pengujian keamanan selesai.

## Contoh success flow

1. Owner mendaftarkan grup sebagai Gudang Utama.
2. Admin mendaftarkan Budi sebagai User.
3. Budi mengirim `!help`.
4. Budi memilih menu Transaksi.
5. Budi mengirim batch barang masuk.
6. Bot menampilkan preview.
7. Budi mengonfirmasi.
8. Supabase menyimpan movement dan memperbarui balance.
9. Bot mengirim nomor transaksi dan saldo terbaru.

## Risiko produk

- WhatsApp Web tidak resmi dan sesi dapat terputus.
- Penghapusan pesan massal tidak selalu dapat menjamin seluruh pesan terhapus.
- Data stok sangat sensitif terhadap duplikasi command.
- User dapat salah memasukkan SKU atau jumlah.

Mitigasi utama adalah dedicated number, allowlist grup/User, idempotensi, preview, konfirmasi, audit log, backup, dan transaksi PostgreSQL atomik.
