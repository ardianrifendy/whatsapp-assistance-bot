# Agents and Subagents

## Tujuan

Dokumen ini mendefinisikan pembagian pekerjaan apabila implementasi dikerjakan secara paralel. Setiap worker memiliki batas direktori yang jelas dan tidak boleh menulis file milik worker lain.

## Aturan kerja

- Satu worker menangani satu modul atau direktori.
- File bersama hanya diubah oleh manager.
- Worker wajib membaca kode yang relevan sebelum mengubahnya.
- Worker tidak melakukan deployment, commit, atau push tanpa instruksi manager.
- Worker menambahkan test untuk logic yang diubah.
- Worker melaporkan file yang diubah, asumsi, dan hasil verifikasi.
- Manager melakukan integrasi, review, dan pengecekan TypeScript dari root.

## Owner file bersama

Manager memegang file berikut:

- `package.json`
- lock file
- `tsconfig.json`
- konfigurasi Docker Compose
- konfigurasi environment example
- migrasi database utama
- command registry bersama
- dokumentasi root

## Pembagian worker yang disarankan

### Worker A — WhatsApp adapter

Scope:

- QR dan lifecycle client.
- LocalAuth atau session storage.
- Event `message` dan `message_create`.
- Normalisasi JID.
- Group event.
- Pengiriman text, image, dan quoted reply.
- Reconnect dan status koneksi.

Tidak boleh menyentuh schema database atau handler inventory.

### Worker B — Access control dan group management

Scope:

- Owner guard.
- Group registry.
- Warehouse mapping.
- User registry.
- Group membership.
- Role guard.
- `!grup` dan `!user`.

Tidak boleh mengubah logic saldo atau file adapter WhatsApp.

### Worker C — Inventory domain

Scope:

- Product service.
- Stock balance.
- Stock movement.
- Transaction preview.
- Batch processing.
- `!stok`, `!masuk`, `!dijalan`, `!terima`, `!keluar`, `!koreksi`, dan `!batal`.

Tidak boleh mengubah flow session menu atau group registry.

### Worker D — Help, session, dan moderation

Scope:

- Conversation session.
- `!help`, `!menu`, `!back`, `!cancel`.
- Asset image bantuan.
- `!clear`.
- Help cooldown.
- Konfirmasi berbasis session.

Tidak boleh menyentuh saldo database selain memanggil service publik.

## Tanggung jawab manager

1. Menentukan kontrak antar-modul.
2. Menentukan schema dan migrasi.
3. Menggabungkan command registry.
4. Meninjau privilege setiap command.
5. Menjalankan test lintas modul.
6. Menjalankan `npx tsc --noEmit` dari root.
7. Melakukan local end-to-end test sebelum deployment.

## Kontrak antar-modul

Setiap handler menerima context yang sudah dinormalisasi:

- `messageId`
- `chatId`
- `groupId`
- `warehouseId`
- `senderJid`
- `userId`
- `role`
- `isOwner`
- `quotedMessageId`
- `sessionId`

Handler tidak boleh menebak identitas User dari nama tampilan WhatsApp.

## Handoff checklist

- [ ] Unit test lulus.
- [ ] Tidak ada perubahan file di luar scope.
- [ ] Error handling sudah diuji.
- [ ] Permission matrix sudah diperiksa.
- [ ] Tidak ada secret yang ditulis ke source.
- [ ] Response error ramah untuk User.
- [ ] Manager sudah diberi daftar file dan hasil test.
