// ============================================================
// MODUL PENGATURAN, WA NOTIFIKASI & AUDIT LOG PENGHAPUSAN
// ============================================================

async function loadSettings() {
  const { data } = await db.from('settings').select('key,value');
  if (!data) return;
  const s = Object.fromEntries(data.map(r => [r.key, r.value]));
  
  const setFonnte = document.getElementById('set-fonnte');
  const setWaTarget = document.getElementById('set-wa-target');
  const setWaEnabled = document.getElementById('set-wa-enabled');
  const setJamMasuk = document.getElementById('set-jam-masuk');
  const setToleransi = document.getElementById('set-toleransi');

  if (setFonnte) setFonnte.value = s.fonnte_token || '';
  if (setWaTarget) setWaTarget.value = s.wa_target || '';
  if (setWaEnabled) setWaEnabled.value = s.wa_enabled || 'false';
  if (setJamMasuk) setJamMasuk.value = s.jam_masuk || '09:00';
  if (setToleransi) setToleransi.value = s.toleransi_menit || '0';

  fonnteToken = s.fonnte_token || '';
  waTarget = s.wa_target || '';
  waEnabled = s.wa_enabled === 'true';
  jamMasuk = s.jam_masuk || '09:00';
  toleransiMenit = parseInt(s.toleransi_menit || '0');

  // Location settings
  const setLokasiEnabled = document.getElementById('set-lokasi-enabled');
  const setLokasiLat = document.getElementById('set-lokasi-lat');
  const setLokasiLng = document.getElementById('set-lokasi-lng');
  const setLokasiRadius = document.getElementById('set-lokasi-radius');
  const setLokasiNama = document.getElementById('set-lokasi-nama');

  if (setLokasiEnabled) setLokasiEnabled.value = s.lokasi_enabled || 'false';
  if (setLokasiLat) setLokasiLat.value = s.lokasi_lat || '-6.2030017';
  if (setLokasiLng) setLokasiLng.value = s.lokasi_lng || '106.7147163';
  if (setLokasiRadius) setLokasiRadius.value = s.lokasi_radius || '100';
  if (setLokasiNama) setLokasiNama.value = s.lokasi_nama || 'BHC Professional';

  lokasiEnabled = s.lokasi_enabled === 'true';
  lokasiLat = parseFloat(s.lokasi_lat || '-6.2030017');
  lokasiLng = parseFloat(s.lokasi_lng || '106.7147163');
  lokasiRadius = parseInt(s.lokasi_radius || '100');
  lokasiNama = s.lokasi_nama || 'BHC Professional';

  loadDeletionLogs();
}

async function saveSettings() {
  const updates = [
    { key: 'fonnte_token', value: document.getElementById('set-fonnte').value.trim() },
    { key: 'wa_target', value: document.getElementById('set-wa-target').value.trim() },
    { key: 'wa_enabled', value: document.getElementById('set-wa-enabled').value },
    { key: 'jam_masuk', value: document.getElementById('set-jam-masuk').value },
    { key: 'toleransi_menit', value: document.getElementById('set-toleransi').value },
  ];
  const msg = document.getElementById('save-msg-wa');
  const { error } = await db.from('settings').upsert(updates, { onConflict: 'key' });
  if (error) {
    msg.className = 'save-msg err'; msg.textContent = 'Gagal: ' + error.message;
  } else {
    msg.className = 'save-msg ok'; msg.textContent = '✓ Settings disimpan!';
    loadSettings();
  }
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

async function saveLokasiSettings() {
  const updates = [
    { key: 'lokasi_enabled', value: document.getElementById('set-lokasi-enabled').value },
    { key: 'lokasi_lat', value: document.getElementById('set-lokasi-lat').value.trim() },
    { key: 'lokasi_lng', value: document.getElementById('set-lokasi-lng').value.trim() },
    { key: 'lokasi_radius', value: document.getElementById('set-lokasi-radius').value.trim() },
    { key: 'lokasi_nama', value: document.getElementById('set-lokasi-nama').value.trim() },
  ];
  const msg = document.getElementById('save-msg-lokasi');
  const { error } = await db.from('settings').upsert(updates, { onConflict: 'key' });
  if (error) {
    msg.className = 'save-msg err'; msg.textContent = 'Gagal: ' + error.message;
  } else {
    msg.className = 'save-msg ok'; msg.textContent = '✓ Settings lokasi disimpan!';
    loadSettings();
  }
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

async function testGeolocation() {
  const resultEl = document.getElementById('test-lokasi-result');
  if (!resultEl) return;
  resultEl.style.display = 'block';
  resultEl.innerHTML = '⏳ Mendapatkan lokasi GPS...';

  try {
    const pos = await getCurrentPosition();
    const targetLat = parseFloat(document.getElementById('set-lokasi-lat').value) || lokasiLat;
    const targetLng = parseFloat(document.getElementById('set-lokasi-lng').value) || lokasiLng;
    const radius = parseInt(document.getElementById('set-lokasi-radius').value) || lokasiRadius;
    const distance = getDistanceMeters(pos.lat, pos.lng, targetLat, targetLng);
    const isInRange = distance <= radius;

    resultEl.innerHTML = `
      <b>📍 Lokasi Anda:</b> ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)} (akurasi ~${Math.round(pos.accuracy)}m)<br>
      <b>🎯 Lokasi Target:</b> ${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}<br>
      <b>📏 Jarak:</b> ${Math.round(distance)} meter (maks ${radius}m)<br>
      <b>Status:</b> ${isInRange
        ? '<span style="color:var(--green);font-weight:700;">✅ DALAM RADIUS — Absensi diizinkan</span>'
        : '<span style="color:var(--red);font-weight:700;">❌ DI LUAR RADIUS — Absensi akan ditolak</span>'}
    `;
  } catch (err) {
    resultEl.innerHTML = `<span style="color:var(--red);">❌ ${err.message}</span>`;
  }
}

// ===== SINKRONISASI & PEMBERSIHAN DATA ORPHAN =====
async function syncAndCleanOrphanAttendance() {
  const btn = document.getElementById('btn-sync-orphan');
  const statusEl = document.getElementById('sync-orphan-status');
  if (btn) btn.disabled = true;
  if (statusEl) {
    statusEl.innerHTML = '<span class="live-dot" style="background:var(--gold);width:7px;height:7px;display:inline-block;margin-right:6px;"></span> Memeriksa database...';
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--muted)';
  }

  try {
    // 1. Ambil seluruh list employee_id aktif di tabel employees
    const { data: emps, error: empErr } = await db.from('employees').select('employee_id, name');
    if (empErr) throw empErr;

    const validEmpIds = new Set((emps || []).map(e => (e.employee_id || '').toUpperCase().trim()));

    // 2. Ambil seluruh data absensi
    const { data: attRows, error: attErr } = await db.from('attendance').select('id, employee_id, employee_name');
    if (attErr) throw attErr;

    // 3. Cari absensi yang employee_id-nya sudah tidak terdaftar di tabel employees
    const orphans = (attRows || []).filter(r => {
      const id = (r.employee_id || '').toUpperCase().trim();
      return !id || !validEmpIds.has(id);
    });

    if (orphans.length === 0) {
      if (statusEl) {
        statusEl.innerHTML = '✅ <b>Database Sinkron & Bersih!</b> Tidak ditemukan data absensi dari karyawan yang sudah dihapus.';
        statusEl.style.color = 'var(--green)';
      }
      if (typeof showToast === 'function') {
        showToast('✓ Database sinkron & bersih. Tidak ada data absensi orphan.', 'success');
      } else {
        alert('✓ Database sinkron & bersih. Seluruh data absensi sesuai dengan daftar karyawan aktif.');
      }
      return;
    }

    // Kelompokkan data orphan berdasarkan employee_id
    const orphanMap = {};
    orphans.forEach(r => {
      const key = r.employee_id || '(Tanpa ID)';
      if (!orphanMap[key]) orphanMap[key] = { count: 0, name: r.employee_name || 'Tanpa Nama' };
      orphanMap[key].count++;
    });

    const orphanSummary = Object.entries(orphanMap)
      .map(([id, info]) => `• ${id} (${info.name}): ${info.count} data`)
      .join('\n');

    const confirmMsg = `Ditemukan ${orphans.length} data absensi dari karyawan yang sudah tidak ada di database:\n\n${orphanSummary}\n\nApakah Anda ingin menghapus seluruh ${orphans.length} data absensi ini agar database bersih dan sinkron?`;

    if (!confirm(confirmMsg)) {
      if (statusEl) {
        statusEl.innerHTML = `⚠️ Ditemukan <b>${orphans.length}</b> data absensi orphan. Pembersihan dibatalkan oleh pengguna.`;
        statusEl.style.color = 'var(--yellow)';
      }
      return;
    }

    // 4. Hapus seluruh data orphan dari tabel attendance
    const orphanIds = orphans.map(r => r.id);
    const { error: delErr } = await db.from('attendance').delete().in('id', orphanIds);
    if (delErr) throw delErr;

    // 5. Catat ke audit log riwayat penghapusan
    try {
      const { data: settingData } = await db
        .from('settings')
        .select('value')
        .eq('key', 'deletion_history')
        .maybeSingle();

      let history = [];
      if (settingData && settingData.value) {
        try { history = JSON.parse(settingData.value); } catch (e) { history = []; }
      }

      history.unshift({
        deleted_at: new Date().toISOString(),
        admin_email: loggedInUserEmail || 'Admin',
        employee_id: Object.keys(orphanMap).join(', '),
        employee_name: 'Pembersihan Massal Data Orphan',
        status: 'SINKRONISASI DATABASE',
        cabang: 'Semua Cabang',
        absensi_created_at: new Date().toISOString(),
        notes: `Pembersihan ${orphans.length} baris absensi dari karyawan yang telah dihapus`
      });

      if (history.length > 200) history = history.slice(0, 200);

      await db.from('settings').upsert({
        key: 'deletion_history',
        value: JSON.stringify(history)
      }, { onConflict: 'key' });
    } catch (e) {
      console.warn('Gagal mencatat log sync:', e);
    }

    if (statusEl) {
      statusEl.innerHTML = `✅ <b>Berhasil!</b> ${orphans.length} data absensi dari karyawan yang telah dihapus berhasil dibersihkan.`;
      statusEl.style.color = 'var(--gold)';
    }

    if (typeof showToast === 'function') {
      showToast(`✓ Berhasil membersihkan ${orphans.length} data absensi orphan.`, 'success');
    } else {
      alert(`✓ Berhasil membersihkan ${orphans.length} data absensi orphan.`);
    }

    // Refresh semua tampilan terkait
    if (typeof loadAbsensi === 'function') loadAbsensi();
    if (typeof loadKaryawan === 'function') loadKaryawan();
    if (typeof loadDeletionLogs === 'function') loadDeletionLogs();

  } catch (err) {
    console.error('Error saat sinkronisasi:', err);
    if (statusEl) {
      statusEl.innerHTML = '❌ Gagal sinkronisasi: ' + err.message;
      statusEl.style.color = '#e57373';
    }
    alert('Terjadi kesalahan saat sinkronisasi: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadDeletionLogs() {
  const wrap = document.getElementById('deletion-logs-wrap');
  if (!wrap) return;
  
  try {
    const { data, error } = await db
      .from('settings')
      .select('value')
      .eq('key', 'deletion_history')
      .maybeSingle();
      
    if (error) throw error;
    
    let logs = [];
    if (data && data.value) {
      logs = JSON.parse(data.value);
    }
    
    if (!logs.length) {
      wrap.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--muted); font-size: 13px;">Belum ada riwayat penghapusan.</div>';
      return;
    }
    
    const tbody = logs.map(log => {
      const deletedTime = new Date(log.deleted_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', ...tz });
      const recordTime = new Date(log.absensi_created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short', ...tz });
      let statusBadge = 'b-yellow';
      if (log.status === 'hadir') statusBadge = 'b-green';
      else if (log.status === 'keluar') statusBadge = 'b-blue';
      else if (log.status === 'alpha') statusBadge = 'b-red';
      
      return `<tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 10px; white-space: nowrap;">${deletedTime}</td>
        <td style="padding: 10px; color: var(--gold); font-weight: 500;">${escapeHtml(log.admin_email)}</td>
        <td style="padding: 10px;"><span class="id-chip">${escapeHtml(log.employee_id)}</span> ${escapeHtml(log.employee_name || '')}</td>
        <td style="padding: 10px;"><span class="badge ${statusBadge}">${escapeHtml(log.status)}</span></td>
        <td style="padding: 10px;">${escapeHtml(log.cabang || '—')}</td>
        <td style="padding: 10px; font-size: 11px; color: var(--muted);">${recordTime}</td>
      </tr>`;
    }).join('');
    
    wrap.innerHTML = `<table style="font-size: 12px; width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: var(--surface2); border-bottom: 1px solid var(--border);">
          <th style="padding: 10px; text-align: left; font-size: 9px; color: var(--muted); text-transform: uppercase;">Waktu Hapus</th>
          <th style="padding: 10px; text-align: left; font-size: 9px; color: var(--muted); text-transform: uppercase;">Admin</th>
          <th style="padding: 10px; text-align: left; font-size: 9px; color: var(--muted); text-transform: uppercase;">Karyawan</th>
          <th style="padding: 10px; text-align: left; font-size: 9px; color: var(--muted); text-transform: uppercase;">Status</th>
          <th style="padding: 10px; text-align: left; font-size: 9px; color: var(--muted); text-transform: uppercase;">Cabang</th>
          <th style="padding: 10px; text-align: left; font-size: 9px; color: var(--muted); text-transform: uppercase;">Waktu Absen</th>
        </tr>
      </thead>
      <tbody>
        ${tbody}
      </tbody>
    </table>`;
  } catch (err) {
    console.error('Gagal memuat log penghapusan:', err);
    wrap.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--red); font-size: 13px;">Gagal memuat: ${err.message}</div>`;
  }
}

async function sendDailyRecapWA() {
  if (!waEnabled || !fonnteToken || !waTarget) {
    alert('Aktifkan notifikasi WA dan isi token Fonnte di Settings terlebih dahulu.');
    return;
  }
  const date = document.getElementById('filter-date').value;
  const dateLabel = new Date(date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const { data: att } = await db.from('attendance').select('*')
    .gte('created_at', date + 'T00:00:00+07:00')
    .lte('created_at', date + 'T23:59:59+07:00');

  const { data: emps } = await db.from('employees').select('employee_id, name');
  const totalEmp = (emps || []).length;

  const rows = att || [];
  const hadir = [...new Set(rows.filter(r => r.status === 'hadir').map(r => r.employee_id))];
  const keluar = [...new Set(rows.filter(r => r.status === 'keluar').map(r => r.employee_id))];
  const izin = [...new Set(rows.filter(r => r.status === 'izin').map(r => r.employee_id))];
  const sakit = [...new Set(rows.filter(r => r.status === 'sakit').map(r => r.employee_id))];
  const libur = [...new Set(rows.filter(r => r.status === 'libur').map(r => r.employee_id))];
  const alpha = [...new Set(rows.filter(r => r.status === 'alpha').map(r => r.employee_id))];

  const terlambatList = rows.filter(r => r.status === 'hadir' && r.notes && r.notes.includes('Terlambat'));
  const terlambatStr = terlambatList.length > 0
    ? '\n⚠️ *Terlambat:*\n' + terlambatList.map(r => {
        const m = r.notes.match(/Terlambat (\d+) mnt/);
        return `• ${r.employee_name} (+${m ? m[1] : '?'}mnt)`;
      }).join('\n')
    : '';

  const alphaList = rows.filter(r => r.status === 'alpha');
  const alphaStr = alpha.length > 0
    ? '\n🔴 *Alpha:*\n' + alphaList.map(r => `• ${r.employee_name}`).join('\n')
    : '';

  const msg = `💈 *REKAP HARIAN BHC PROFESSIONAL*\n📅 ${dateLabel}\n\n` +
    `✅ Hadir: ${hadir.length}/${totalEmp} karyawan\n` +
    `📤 Sudah Pulang: ${keluar.length}\n` +
    `📋 Izin: ${izin.length} · Sakit: ${sakit.length} · Libur: ${libur.length}\n` +
    `❌ Alpha: ${alpha.length}` +
    terlambatStr + alphaStr +
    `\n\n_Dikirim otomatis dari Sistem Absensi_`;

  try {
    await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': fonnteToken },
      body: new URLSearchParams({ target: waTarget, message: msg })
    });
    alert('✓ Rekap harian berhasil dikirim ke WA!');
  } catch (e) {
    alert('Gagal kirim WA: ' + e.message);
  }
}

function sendWA(empId, empName, time, status) {
  const typeStr = status === 'keluar' ? 'Absen Keluar 📤' : 'Absen Masuk 📥';
  const timeStr = new Date(time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', ...tz });
  const dateStr = new Date(time).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...tz });
  const cabangVal = document.getElementById('scanner-cabang')?.value || 'Pusat';
  const message = `💈 *${typeStr}*\n\n👤 ${empId} — ${empName}\n🏪 Cabang: ${cabangVal}\n📅 ${dateStr}\n🕐 ${timeStr}\n📍 Perangkat Kasir`;
  
  fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: { 'Authorization': fonnteToken },
    body: new URLSearchParams({ target: waTarget, message })
  }).catch(() => {});
}
