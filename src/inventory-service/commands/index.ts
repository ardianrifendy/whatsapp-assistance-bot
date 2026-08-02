// Side-effecting imports: each module below calls registerCommand() at
// load time. Import this module once (from the composition root) to
// register every inventory-service command.
import './stok.js';
import './masuk.js';
import './dijalan.js';
import './terima.js';
import './keluar.js';
import './koreksi.js';
import './batal.js';
import './riwayat.js';
import './produk.js';
import './ringkasan.js';
import './ya.js';
