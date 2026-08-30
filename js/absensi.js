// ============================================================
// MODUL LOG ABSENSI, STATISTIK, CHART & REALTIME
// ============================================================

async function loadAbsensi() {
  const dateEl = document.getElementById('filter-date');
  const statusEl = document.getElementById('filter-status');
  const cabangEl = document.getElementById('filter-cabang-absensi');
  
  if (!dateEl) return;
  const date = dateEl.value;
  const status = statusEl ? statusEl.value : '';
  const cabang = cabangEl ? cabangEl.value : '';

  let q = db.from('attendance').select('*')
    .gte('created_at', date + 'T00:00:00+07:00')
    .lte('created_at', date + 'T23:59:59+07:00')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  if (cabang) q = q.eq('cabang', cabang);
  
  const { data } = await q;
  allRows = data || [];
  currentPage = 1;
  updateStats();
  renderTable();
}

function updateStats() {
  const hadir = allRows.filter(r => r.status === 'hadir').length;
  const keluar = allRows.filter(r => r.status === 'keluar').length;
  const izin = allRows.filter(r => r.status === 'izin' || r.status === 'sakit' || r.status === 'alpha' || r.status === 'libur').length;
  
  const sHadir = document.getElementById('s-hadir');
  const sKeluar = document.getElementById('s-keluar-pulang');
  const sIzin = document.getElementById('s-izin');
  
  if (sHadir) sHadir.textContent = hadir;
  if (sKeluar) sKeluar.textContent = keluar;
  if (sIzin) sIzin.textContent = izin;
  
  loadTotalKaryawan();
  updateDoughnut(hadir, keluar, izin);
}

async function loadTotalKaryawan() {
  const { count } = await db.from('employees').select('*', { count: 'exact', head: true });
  const sTotal = document.getElementById('s-total');
  if (sTotal) sTotal.textContent = count ?? '—';
}

function filterTable() {
  currentPage = 1;
  renderTable();
}

function renderTable() {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  const filtered = allRows.filter(r => (r.employee_id || '').toLowerCase().includes(q) || (r.employee_name || '').toLowerCase().includes(q));
  const total = filtered.length;
  const start = (currentPage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);
  const wrap = document.getElementById('table-wrap');
  
  if (!wrap) return;

  if (!rows.length) { 
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Tidak ada data</p></div>'; 
    const pageInfo = document.getElementById('page-info');
    const pageBtns = document.getElementById('page-btns');
    if (pageInfo) pageInfo.textContent = '0 data'; 
    if (pageBtns) pageBtns.innerHTML = ''; 
    return; 
  }
  
  const tbody = rows.map(r => {
    const time = new Date(r.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', ...tz });
    let bc = 'b-yellow';
    let bl = 'Izin';
    if (r.status === 'hadir') {
      const lateMatch = r.notes && r.notes.match(/Terlambat (\d+) mnt/);
      if (lateMatch) {
        bc = 'b-yellow'; bl = `⚠️ Masuk +${lateMatch[1]}mnt`;
      } else {
        bc = 'b-green'; bl = '✓ Masuk';
      }
    }
    else if (r.status === 'keluar') { bc = 'b-blue'; bl = '📤 Keluar'; }
    else if (r.status === 'alpha') { bc = 'b-red'; bl = 'Alpha'; }
    else if (r.status === 'sakit') { bc = 'b-blue'; bl = 'Sakit'; }
    else if (r.status === 'libur') { bc = 'b-gold'; bl = '🏖 Libur'; }
    
    const locInfo = r.location_text
      ? `<span style="color:var(--green);font-size:11px;" title="Lat: ${r.latitude}, Lng: ${r.longitude}">📍 ${escapeHtml(r.location_text)}</span>`
      : '<span style="color:var(--muted);font-size:11px;">—</span>';

    return `<tr>
      <td><span class="id-chip">${escapeHtml(r.employee_id || '—')}</span></td>
      <td>${escapeHtml(r.employee_name || '—')}</td>
      <td><span class="badge b-gold">${escapeHtml(r.cabang || '—')}</span></td>
      <td>${time}</td>
      <td><span class="badge ${bc}">${bl}</span></td>
      <td>${locInfo}</td>
      <td><span style="color: var(--muted); font-size:12px">${escapeHtml(r.notes || '—')}</span></td>
      <td><button class="btn btn-danger" onclick="deleteRow('${escapeHtml(r.id)}')">Hapus</button></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table><thead><tr><th>ID</th><th>Nama</th><th>Cabang</th><th>Waktu</th><th>Status</th><th>Lokasi</th><th>Notes</th><th></th></tr></thead><tbody>${tbody}</tbody></table>`;
  
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pageInfo = document.getElementById('page-info');
  const btns = document.getElementById('page-btns');
  
  if (pageInfo) pageInfo.textContent = `${start + 1}–${Math.min(start + PAGE_SIZE, total)} dari ${total}`;
  if (btns) {
    btns.innerHTML = '';
    for (let p = 1; p <= totalPages; p++) {
      const b = document.createElement('button');
      b.className = 'page-btn' + (p === currentPage ? ' active' : '');
      b.textContent = p;
      b.onclick = () => { currentPage = p; renderTable(); };
      btns.appendChild(b);
    }
  }
}

async function deleteRow(id) {
  if (!confirm('Hapus data absensi ini?')) return;
  
  try {
    const { data: record, error: getErr } = await db
      .from('attendance')
      .select('*')
      .eq('id', id)
      .maybeSingle();
      
    if (getErr || !record) {
      alert('Gagal mengambil data absensi sebelum dihapus: ' + (getErr ? getErr.message : 'Data tidak ditemukan'));
      return;
    }
    
    const { error: delErr } = await db.from('attendance').delete().eq('id', id);
    if (delErr) {
      alert('Gagal menghapus data: ' + delErr.message);
      return;
    }
    
    await logDeletionEvent(record);
    loadAbsensi();
    alert('✓ Data absensi berhasil dihapus dan dicatat di log.');
    
  } catch (err) {
    console.error('Error saat menghapus data:', err);
    alert('Terjadi kesalahan saat menghapus data: ' + err.message);
  }
}

async function logDeletionEvent(record) {
  try {
    const { data: settingData } = await db
      .from('settings')
      .select('value')
      .eq('key', 'deletion_history')
      .maybeSingle();
      
    let history = [];
    if (settingData && settingData.value) {
      try {
        history = JSON.parse(settingData.value);
      } catch (e) {
        history = [];
      }
    }
    
    const newLog = {
      deleted_at: new Date().toISOString(),
      admin_email: loggedInUserEmail || 'Unknown Admin',
      employee_id: record.employee_id,
      employee_name: record.employee_name,
      status: record.status,
      cabang: record.cabang,
      absensi_created_at: record.created_at,
      notes: record.notes
    };
    
    history.unshift(newLog);
    if (history.length > 200) {
      history = history.slice(0, 200);
    }
    
    await db.from('settings').upsert({
      key: 'deletion_history',
      value: JSON.stringify(history)
    }, { onConflict: 'key' });
    
    const secSettings = document.getElementById('sec-settings');
    if (secSettings && secSettings.classList.contains('active') && typeof loadDeletionLogs === 'function') {
      loadDeletionLogs();
    }
  } catch (err) {
    console.error('Gagal mencatat log penghapusan:', err);
  }
}

// ===== CHARTS =====
async function loadChartLine() {
  const chartEl = document.getElementById('chartLine');
  if (!chartEl) return;

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  
  const { data } = await db.from('attendance')
    .select('created_at,status')
    .gte('created_at', start.toLocaleDateString('en-CA', tz) + 'T00:00:00+07:00')
    .lte('created_at', end.toLocaleDateString('en-CA', tz) + 'T23:59:59+07:00');
  
  const grouped = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    grouped[d.toLocaleDateString('en-CA', tz)] = 0;
  }
  
  (data || []).forEach(r => {
    const k = new Date(r.created_at).toLocaleDateString('en-CA', tz);
    if (r.status === 'hadir' && grouped[k] !== undefined) grouped[k]++;
  });
  
  const labels = Object.keys(grouped).map(d => {
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
  });
  const values = Object.values(grouped);
  const ctx = chartEl.getContext('2d');
  
  if (lineChart) lineChart.destroy();
  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#C9A96E',
        backgroundColor: 'rgba(201,169,110,0.08)',
        borderWidth: 2,
        pointRadius: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#C9A96E'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b6560', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
        y: { ticks: { color: '#6b6560', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.03)' }, beginAtZero: true }
      }
    }
  });
}

function updateDoughnut(hadir, keluar, izin) {
  const chartEl = document.getElementById('chartDoughnut');
  if (!chartEl) return;

  const totalVal = hadir + keluar + izin;
  const noData = totalVal === 0;
  const ctx = chartEl.getContext('2d');
  
  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Hadir/Masuk', 'Keluar/Pulang', 'Izin/Lainnya'],
      datasets: [{
        data: noData ? [1] : [hadir, keluar, izin],
        backgroundColor: noData ? ['#1e1e1e'] : ['#27ae60', '#2980b9', '#d4ac0d'],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#7a7470', font: { size: 11 }, padding: 14 } },
        tooltip: { enabled: !noData }
      },
      cutout: '70%'
    }
  });
}

// ===== REALTIME REPLICATION =====
let realtimeChannel = null;
function setupRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = db.channel('rt-attendance');
  realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
    loadAbsensi();
    if (typeof loadBelumAbsen === 'function') loadBelumAbsen();
  }).subscribe();
}
