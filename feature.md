# Feature Specification

## 1. Group Registry

### Tujuan

Mencegah bot digunakan di grup yang belum diizinkan.

### Fitur

- Owner mendaftarkan grup dengan `!grup daftar`.
- Group ID disimpan sebagai identitas unik.
- Grup dipetakan ke gudang.
- Grup dapat diaktifkan atau dinonaktifkan.
- Grup tidak terdaftar tidak dapat membaca atau mengubah stok.

### Command

```text
!grup daftar <nama gudang>
!grup status
!grup aktif
!grup nonaktif
!grup list
```

## 2. User and Role Management

### Role

- Owner: kontrol sistem.
- Admin: pengelolaan operasional per gudang.
- User: transaksi harian.

### Command

```text
!user tambah <nomor> <nama> user
!user role <nomor> user
!user aktif <nomor>
!user nonaktif <nomor>
!user list
```

Pengangkatan Admin hanya dapat dilakukan Owner.

## 3. Product Management

### Data produk

- SKU unik.
- Nama barang.
- Alias pencarian.
- Satuan.
- Minimum stok.
- Mode tracking kuantitas atau serial.
- Status aktif/nonaktif.

### Command

```text
!produk tambah
!produk ubah <sku>
!produk nonaktif <sku>
!produk cari <kata>
!produk list
```

Produk nonaktif tidak dapat dipakai untuk transaksi baru, tetapi tetap muncul di riwayat.

## 4. Inventory Overview

### Command

```text
!stok
!stok list
!stok saya
!stok user <nama|nomor>
!stok sku <sku>
!stok cari <kata>
!stok menipis
!ringkasan
```

### Hak akses

- User dapat melihat ringkasan, daftar gudang, stok sendiri, dan pencarian produk.
- Admin dapat memfilter stok berdasarkan User.
- Owner dapat melihat seluruh gudang.

### Tampilan

Stok selalu dipisahkan menjadi:

- Ready.
- Di Jalan.
- Total.
- Minimum stok.

## 5. Stock Movement

### Jenis transaksi

- `MASUK`: barang masuk Ready.
- `DI_JALAN`: barang dicatat dalam perjalanan.
- `TERIMA`: barang berpindah dari Di Jalan ke Ready.
- `KELUAR`: barang keluar dari Ready.
- `KOREKSI`: penyesuaian Admin dengan alasan.
- `BATAL`: transaksi pembalik.

### Batch input

```text
!masuk PO-001
POCO-F7 | 3
REDMI-NOTE-13 | 5
```

Setiap batch divalidasi seluruhnya sebelum disimpan.

## 6. Interactive Help

### Perilaku

- `!help` mengirim gambar utama dan menu.
- Menu berbeda sesuai role.
- User membalas quoted message dengan angka.
- Bot mengirim submenu sebagai pesan baru.
- Sesi terikat pada User dan grup.
- Sesi kedaluwarsa.
- `!back`, `!cancel`, dan `0` selalu tersedia.

### Asset

```text
help-main.png
help-stock.png
help-transaction.png
help-in-transit.png
help-history.png
help-admin.png
help-confirmation.png
```

Gambar dikirim sebagai panduan visual, bukan sebagai kontrol clickable.

## 7. Preview and Confirmation

Semua command berikut wajib memakai preview:

- `!masuk`.
- `!keluar`.
- `!dijalan`.
- `!terima`.
- `!koreksi`.
- `!batal`.

Konfirmasi terikat pada User, grup, payload, dan masa berlaku.

## 8. History and Audit

Setiap transaksi mencatat:

- ID transaksi.
- Referensi invoice/PO.
- Pelaku command.
- Pemilik stok.
- Gudang.
- Data sebelum dan sesudah.
- Alasan jika koreksi.
- Waktu Asia/Jakarta.

Ledger tidak dihapus.

## 9. Chat Cleanup

### Command

```text
!clear bot
!clear saya
!clear recent <jumlah>
!clear all
```

`!clear` hanya menghapus pesan chat, tidak menghapus stok, transaksi, atau audit log.

`!clear all` hanya Owner dan disabled pada MVP sampai pengujian selesai.

## 10. Reliability

- Idempotensi berdasarkan WhatsApp message ID.
- Transaksi PostgreSQL atomik.
- Tidak boleh ada saldo negatif.
- Reconnect WhatsApp.
- Persistent session volume.
- Health check.
- Backup database.
- Error response tidak boleh mengklaim sukses jika commit gagal.

## 11. Privacy and Safety

- Secret hanya disimpan di VPS environment.
- Nomor User dinormalisasi dan tidak ditampilkan penuh di laporan umum.
- Grup tidak resmi tidak mendapatkan data.
- Role aplikasi tidak disamakan dengan status Admin WhatsApp.
- Command sensitif selalu dicatat di audit log.
