// ============================================================
// MODUL SCANNER KASIR & LIVE STATUS KEHADIRAN
// ============================================================
let scannerTransitioning = false;
let cachedLocation = null;

function updateLokasiStatusUI(status, message) {
  const el = document.getElementById('scanner-lokasi-status');
  if (!el) return;
  if (!lokasiEnabled) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  if (status === 'ok') {
    el.style.background = 'rgba(39,174,96,0.1)';
    el.style.border = '1px solid rgba(39,174,96,0.3)';
    el.style.color = 'var(--green)';
  } else if (status === 'error') {
    el.style.background = 'rgba(192,57,43,0.1)';
    el.style.border = '1px solid rgba(192,57,43,0.3)';
    el.style.color = 'var(--red)';
  } else {
    el.style.background = 'rgba(201,169,110,0.1)';
    el.style.border = '1px solid rgba(201,169,110,0.3)';
    el.style.color = 'var(--gold)';
  }
  el.innerHTML = message;
}

async function checkScannerLocation() {
  if (!lokasiEnabled) return true;
  updateLokasiStatusUI('loading', '📍 Memeriksa lokasi GPS...');
  try {
    const pos = await getCurrentPosition();
    cachedLocation = pos;
    const distance = getDistanceMeters(pos.lat, pos.lng, lokasiLat, lokasiLng);
    const isInRange = distance <= lokasiRadius;
    if (isInRange) {
      updateLokasiStatusUI('ok', `📍 Lokasi OK — ${Math.round(distance)}m dari ${lokasiNama} (maks ${lokasiRadius}m)`);
      return true;
    } else {
      updateLokasiStatusUI('error', `📍 Lokasi DITOLAK — ${Math.round(distance)}m dari ${lokasiNama} (maks ${lokasiRadius}m). Pindah ke lokasi barber!`);
      return false;
    }
  } catch (err) {
    cachedLocation = null;
    updateLokasiStatusUI('error', `📍 ${err.message}`);
    return false;
  }
}

async function toggleScanner() {
  if (scannerTransitioning) return;
  scannerTransitioning = true;

  const btn = document.getElementById('btn-toggle-scanner');
  const placeholder = document.getElementById('scanner-placeholder');
  const container = document.getElementById('scanner-reader');
  const selectedCabang = document.getElementById('scanner-cabang').value;

  if (!selectedCabang) {
    alert('Silakan pilih cabang aktif terlebih dahulu!');
    scannerTransitioning = false;
    return;
  }

  btn.disabled = true;

  if (!isScanning && lokasiEnabled) {
    const locationOk = await checkScannerLocation();
    if (!locationOk) {
      btn.disabled = false;
      scannerTransitioning = false;
      return;
    }
  }

  if (isScanning) {
    try {
      await html5QrCode.stop();
    } catch (err) {
      console.warn('Stop scanner warning:', err);
    }
    isScanning = false;
    html5QrCode = null;
    btn.textContent = '🎥 Aktifkan Kamera';
    btn.className = 'btn btn-gold';
    placeholder.style.display = 'flex';
    container.style.display = 'none';
    document.getElementById('scanner-laser').style.display = 'none';
    document.getElementById('scanner-zoom-container').style.display = 'none';
    btn.disabled = false;
    scannerTransitioning = false;
  } else {
    try {
      html5QrCode = new Html5Qrcode("scanner-reader");
      placeholder.style.display = 'none';
      container.style.display = 'block';
      document.getElementById('scanner-laser').style.display = 'block';

      const facingModeValue = document.getElementById('scanner-camera-facing').value;
      const isFrontCam = facingModeValue === 'user';

      const config = {
        fps: isFrontCam ? 30 : 24,
        qrbox: function(viewfinderWidth, viewfinderHeight) {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minDim * (isFrontCam ? 0.85 : 0.7));
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: isFrontCam ? 1.0 : 1.333333,
        formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        disableFlip: false
      };

      // Html5Qrcode mewajibkan objek cameraIdOrConfig memiliki tepat 1 key
      const cameraConstraints = { facingMode: facingModeValue };

      await html5QrCode.start(cameraConstraints, config, onScanSuccess, onScanFailure);

      // Optimasi kamera & zoom slider
      try {
        const track = getCameraVideoTrack();
        if (track) {
          const caps = (typeof track.getCapabilities === 'function') ? track.getCapabilities() : {};
          const adv = [];
          if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
            adv.push({ focusMode: 'continuous' });
          }
          if (caps.exposureMode && Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
            adv.push({ exposureMode: 'continuous' });
          }
          if (adv.length > 0 && typeof track.applyConstraints === 'function') {
            await track.applyConstraints({ advanced: adv });
          }

          // Zoom slider
          if (caps.zoom) {
            const zoomInput = document.getElementById('scanner-zoom');
            zoomInput.min = caps.zoom.min;
            zoomInput.max = caps.zoom.max;
            zoomInput.step = caps.zoom.step || 0.1;
            const settings = (typeof track.getSettings === 'function') ? track.getSettings() : {};
            zoomInput.value = settings.zoom || caps.zoom.min;
            document.getElementById('zoom-val').textContent = parseFloat(zoomInput.value).toFixed(1) + 'x';
            document.getElementById('scanner-zoom-container').style.display = 'block';
          } else {
            document.getElementById('scanner-zoom-container').style.display = 'none';
          }
        }
      } catch (e) {
        console.warn('[Scanner] Optimasi kamera info:', e);
      }

      isScanning = true;
      btn.textContent = '🛑 Matikan Kamera';
      btn.className = 'btn btn-danger';

    } catch (err) {
      console.error('Gagal mengakses kamera:', err);
      showToast('Gagal mengakses kamera. Coba tutup aplikasi lain yang menggunakan kamera, lalu coba lagi.', 'error');
      placeholder.style.display = 'flex';
      container.style.display = 'none';
      document.getElementById('scanner-laser').style.display = 'none';
      document.getElementById('scanner-zoom-container').style.display = 'none';
      html5QrCode = null;
    } finally {
      btn.disabled = false;
      scannerTransitioning = false;
    }
  }
}

function getCameraVideoTrack() {
  const videoElem = document.querySelector("#scanner-reader video");
  if (videoElem && videoElem.srcObject && typeof videoElem.srcObject.getVideoTracks === 'function') {
    const tracks = videoElem.srcObject.getVideoTracks();
    if (tracks && tracks.length > 0) return tracks[0];
  }
  return null;
}

async function onCameraFacingChange() {
  if (scannerTransitioning) return;
  if (isScanning) {
    await toggleScanner();
    await new Promise(resolve => setTimeout(resolve, 500));
    await toggleScanner();
  }
}

async function applyZoom(value) {
  try {
    const track = getCameraVideoTrack();
    if (track && typeof track.applyConstraints === 'function') {
      await track.applyConstraints({
        advanced: [{ zoom: parseFloat(value) }]
      });
      const zoomVal = document.getElementById('zoom-val');
      if (zoomVal) zoomVal.textContent = parseFloat(value).toFixed(1) + 'x';
    }
  } catch (err) {
    console.warn('Gagal mengubah zoom:', err);
  }
}

function onScanSuccess(decodedText) {
  const now = Date.now();
  if (now - lastScanTime < SCAN_COOLDOWN) return; // ignore duplicates
  
  let empId = decodedText.trim();
  if (decodedText.startsWith('BARBER_EMP:')) {
    empId = decodedText.split(':')[1];
  }
  
  empId = empId.trim().toUpperCase();
  lastScanTime = now;
  triggerScannerCooldown(SCAN_COOLDOWN);
  processAbsenScanner(empId);
}

function onScanFailure(error) {
  if (error && !error.toString().includes('No MultiFormat Readers')) {
    console.warn('[Scanner]', error);
  }
}

function showScanError(msg) {
  document.getElementById('scan-result-empty').style.display = 'none';
  document.getElementById('scan-result-card').style.display = 'none';
  const errorBox = document.getElementById('scan-result-error');
  document.getElementById('scan-result-error-msg').textContent = msg;
  
  const flash = document.getElementById('scanner-flash');
  if (flash) {
    flash.className = '';
    void flash.offsetWidth;
    flash.classList.add('flash-error');
  }
  
  errorBox.className = '';
  void errorBox.offsetWidth;
  errorBox.classList.add('animate-pop-in', 'error-glow');
  errorBox.style.display = 'block';
  
  showToast(msg, 'error');
  setTimeout(resetScannerResultView, 5000);
}

function showScanSuccess(empId, name, role, cabang, status, time, lateMinutes = 0) {
  document.getElementById('scan-result-empty').style.display = 'none';
  document.getElementById('scan-result-error').style.display = 'none';
  const card = document.getElementById('scan-result-card');
  const badge = document.getElementById('scan-result-status-badge');
  const avatar = document.getElementById('scan-result-avatar');

  document.getElementById('scan-result-name').textContent = name;
  document.getElementById('scan-result-id').textContent = empId;
  document.getElementById('scan-result-time').textContent = new Date(time).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit', ...tz });
  document.getElementById('scan-result-cabang').textContent = cabang;

  const initials = name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
  avatar.textContent = initials;

  let glowClass = 'success-glow';
  let toastMsg = '';
  let toastType = 'success';

  if (status === 'hadir') {
    if (lateMinutes > 0) {
      badge.textContent = `⚠️ Masuk — Terlambat ${lateMinutes} mnt`;
      badge.className = 'badge b-yellow';
      avatar.style.borderColor = 'var(--yellow)';
      avatar.style.color = '#e5c800';
      glowClass = 'error-glow';
      toastMsg = `⚠️ <b>${name}</b> masuk (Terlambat ${lateMinutes} mnt)`;
      toastType = 'warning';
    } else {
      badge.textContent = '✓ Masuk (Tepat Waktu)';
      badge.className = 'badge b-green';
      avatar.style.borderColor = 'var(--green)';
      avatar.style.color = '#5dca87';
      glowClass = 'success-glow';
      toastMsg = `✅ <b>${name}</b> masuk (Tepat Waktu)`;
      toastType = 'success';
    }
  } else {
    badge.textContent = '✓ Keluar';
    badge.className = 'badge b-blue';
    avatar.style.borderColor = 'var(--blue)';
    avatar.style.color = '#7ec8e3';
    glowClass = 'blue-glow';
    toastMsg = `📤 <b>${name}</b> keluar`;
    toastType = 'blue';
  }

  const flash = document.getElementById('scanner-flash');
  if (flash) {
    flash.className = '';
    void flash.offsetWidth;
    flash.classList.add('flash-success');
  }

  card.className = '';
  void card.offsetWidth;
  card.classList.add('animate-pop-in', glowClass);
  card.style.display = 'block';

  showToast(toastMsg, toastType);
  setTimeout(resetScannerResultView, 5000);
}

function resetScannerResultView() {
  const now = Date.now();
  if (now - lastScanTime >= 4900) {
    document.getElementById('scan-result-empty').style.display = 'block';
    document.getElementById('scan-result-card').style.display = 'none';
    document.getElementById('scan-result-error').style.display = 'none';
  }
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.style.pointerEvents = 'auto';
  toast.style.background = 'var(--surface)';
  toast.style.color = 'var(--text)';
  toast.style.padding = '14px 18px';
  toast.style.borderRadius = '12px';
  toast.style.fontSize = '13px';
  toast.style.fontWeight = '500';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '10px';
  toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6)';
  toast.style.border = '1px solid var(--border)';
  
  let borderCol = 'var(--gold)';
  let icon = '🔔';
  if (type === 'success') {
    borderCol = 'var(--green)';
    icon = '✅';
  } else if (type === 'error') {
    borderCol = 'var(--red)';
    icon = '❌';
  } else if (type === 'warning') {
    borderCol = 'var(--yellow)';
    icon = '⚠️';
  } else if (type === 'blue') {
    borderCol = 'var(--blue)';
    icon = '📤';
  }
  
  toast.style.borderLeft = `4px solid ${borderCol}`;
  toast.innerHTML = `<span style="font-size: 16px;">${icon}</span><span style="flex: 1; line-height: 1.4;">${message}</span>`;
  
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-20px) scale(0.95)';
  toast.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0) scale(1)';
  }, 10);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px) scale(0.95)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

async function submitManualScan() {
  const input = document.getElementById('manual-emp-id');
  const empId = input.value.trim().toUpperCase();
  if (!empId) {
    alert('Masukkan ID Karyawan!');
    return;
  }
  if (lokasiEnabled) {
    const locationOk = await checkScannerLocation();
    if (!locationOk) {
      alert('Absen ditolak! Lokasi GPS tidak sesuai. Pastikan Anda berada di lokasi barber.');
      return;
    }
  }
  triggerScannerCooldown(SCAN_COOLDOWN);
  processAbsenScanner(empId);
  input.value = '';
}

async function processAbsenScanner(empId) {
  const selectedCabang = document.getElementById('scanner-cabang').value;
  if (!selectedCabang) {
    showScanError('✗ Silakan pilih cabang terlebih dahulu.');
    playAudioTone(false);
    return;
  }
  
  try {
    const { data: emp, error: empErr } = await db
      .from('employees')
      .select('name, role')
      .eq('employee_id', empId)
      .single();
      
    if (empErr || !emp) {
      showScanError(`✗ Karyawan dengan ID ${empId} tidak terdaftar.`);
      playAudioTone(false);
      return;
    }
    
    const today = new Date().toLocaleDateString('en-CA', tz);
    
    const { data: todayRecords, error: dbErr } = await db
      .from('attendance')
      .select('status, created_at')
      .eq('employee_id', empId)
      .gte('created_at', today + 'T00:00:00+07:00')
      .lte('created_at', today + 'T23:59:59+07:00');
      
    if (dbErr) throw dbErr;
    
    const hasCheckedIn = todayRecords ? todayRecords.some(r => r.status === 'hadir') : false;
    const hasCheckedOut = todayRecords ? todayRecords.some(r => r.status === 'keluar') : false;
    
    let absenType = 'hadir';
    
    if (hasCheckedIn) {
      if (hasCheckedOut) {
        showScanError(`⚠ Karyawan ${emp.name} sudah absen masuk & keluar hari ini.`);
        playAudioTone(false);
        return;
      } else {
        absenType = 'keluar';
      }
    }
    
    let lateMinutes = 0;
    if (absenType === 'hadir' && jamMasuk) {
      const now = new Date();
      const [h, m] = jamMasuk.split(':').map(Number);
      const cutoff = new Date(now);
      cutoff.setHours(h, m + toleransiMenit, 0, 0);
      if (now > cutoff) {
        lateMinutes = Math.round((now - cutoff) / 60000);
      }
    }

    const notesStr = absenType === 'keluar'
      ? 'Scan Keluar Kasir'
      : lateMinutes > 0
        ? `Scan Masuk Kasir | Terlambat ${lateMinutes} mnt`
        : 'Scan Masuk Kasir';

    let userLat = null, userLng = null, locationText = null;

    if (lokasiEnabled) {
      try {
        const pos = cachedLocation || await getCurrentPosition();
        userLat = pos.lat;
        userLng = pos.lng;
        const distance = getDistanceMeters(userLat, userLng, lokasiLat, lokasiLng);
        locationText = `${Math.round(distance)}m dari ${lokasiNama}`;

        if (distance > lokasiRadius) {
          showScanError(`📍 Lokasi terlalu jauh! ${Math.round(distance)}m dari ${lokasiNama} (maks ${lokasiRadius}m). Pastikan Anda berada di lokasi barber.`);
          playAudioTone(false);
          updateLokasiStatusUI('error', `📍 Lokasi DITOLAK — ${Math.round(distance)}m dari ${lokasiNama}`);
          return;
        }
        updateLokasiStatusUI('ok', `📍 Lokasi OK — ${Math.round(distance)}m dari ${lokasiNama}`);
      } catch (locErr) {
        showScanError('📍 ' + locErr.message);
        playAudioTone(false);
        updateLokasiStatusUI('error', `📍 ${locErr.message}`);
        return;
      }
    }

    const submitTime = new Date().toISOString();
    const payload = {
      employee_id: empId,
      employee_name: emp.name,
      cabang: selectedCabang,
      status: absenType,
      notes: notesStr,
      latitude: userLat,
      longitude: userLng,
      location_text: locationText
    };

    const { error: insertErr } = await db.from('attendance').insert(payload);
    if (insertErr) throw insertErr;
    
    playAudioTone(true);
    showScanSuccess(empId, emp.name, emp.role || 'Barber', selectedCabang, absenType, submitTime, lateMinutes);
    
    if (waEnabled && fonnteToken && waTarget && typeof sendWA === 'function') {
      sendWA(empId, emp.name, submitTime, absenType);
    }
    
    if (typeof loadAbsensi === 'function') loadAbsensi();
    if (typeof loadChartLine === 'function') loadChartLine();
    loadBelumAbsen();
    
  } catch (err) {
    showScanError('✗ Gagal mencatat absensi: ' + (err.message || err));
    playAudioTone(false);
  }
}

// ===== PANEL BELUM ABSEN =====
async function loadBelumAbsen() {
  const cabangEl = document.getElementById('scanner-cabang');
  const wrap = document.getElementById('belum-absen-wrap');
  if (!cabangEl || !wrap) return;

  const cabang = cabangEl.value;
  if (!cabang) {
    wrap.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:13px;">Pilih cabang untuk melihat data</div>';
    return;
  }

  wrap.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const today = new Date().toLocaleDateString('en-CA', tz);

  let empQ = db.from('employees').select('employee_id, name, role').eq('cabang', cabang);
  const { data: allEmps } = await empQ;

  let attQ = db.from('attendance').select('employee_id, status')
    .gte('created_at', today + 'T00:00:00+07:00')
    .lte('created_at', today + 'T23:59:59+07:00')
    .eq('cabang', cabang);
  const { data: todayAtt } = await attQ;

  const recorded = {};
  (todayAtt || []).forEach(r => {
    if (!recorded[r.employee_id]) recorded[r.employee_id] = [];
    recorded[r.employee_id].push(r.status);
  });

  const belumAbsen = (allEmps || []).filter(e => !recorded[e.employee_id]);
  const sudahMasuk = (allEmps || []).filter(e => {
    const st = recorded[e.employee_id];
    return st && st.includes('hadir') && !st.includes('keluar');
  });

  if (!allEmps || !allEmps.length) {
    wrap.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:13px;">Tidak ada karyawan di cabang ini</div>';
    return;
  }

  const totalEmp = allEmps.length;
  const sudahAbsen = totalEmp - belumAbsen.length;
  const pct = Math.round((sudahAbsen / totalEmp) * 100);

  let html = `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px;">
        <span style="color:var(--muted);">Kehadiran hari ini</span>
        <span style="color:var(--gold);font-weight:700;">${sudahAbsen}/${totalEmp} (${pct}%)</span>
      </div>
      <div style="width:100%;height:8px;background:var(--surface2);border-radius:4px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--green),#5dca87);border-radius:4px;transition:width 0.5s;"></div>
      </div>
    </div>
  `;

  if (sudahMasuk.length > 0) {
    html += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--blue);font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
      <span style="width:8px;height:8px;background:var(--blue);border-radius:50%;display:inline-block;"></span> Sudah Masuk, Belum Pulang (${sudahMasuk.length})
    </div>`;
    sudahMasuk.forEach(e => {
      const initials = e.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(41,128,185,0.06);border:1px solid rgba(41,128,185,0.15);border-radius:8px;margin-bottom:6px;">
        <div style="width:32px;height:32px;border-radius:50%;background:rgba(41,128,185,0.15);color:var(--blue);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(e.name)}</div>
          <div style="font-size:10px;color:var(--muted);">${escapeHtml(e.employee_id)} · ${escapeHtml(e.role || '—')}</div>
        </div>
        <span class="badge b-blue" style="font-size:9px;flex-shrink:0;">Masuk</span>
      </div>`;
    });
  }

  if (belumAbsen.length > 0) {
    html += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--red);font-weight:600;margin:12px 0 8px;display:flex;align-items:center;gap:6px;">
      <span style="width:8px;height:8px;background:var(--red);border-radius:50%;display:inline-block;"></span> Belum Absen (${belumAbsen.length})
    </div>`;
    belumAbsen.forEach(e => {
      const initials = e.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(192,57,43,0.06);border:1px solid rgba(192,57,43,0.15);border-radius:8px;margin-bottom:6px;">
        <div style="width:32px;height:32px;border-radius:50%;background:rgba(192,57,43,0.15);color:#e57373;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(e.name)}</div>
          <div style="font-size:10px;color:var(--muted);">${escapeHtml(e.employee_id)} · ${escapeHtml(e.role || '—')}</div>
        </div>
        <span class="badge b-red" style="font-size:9px;flex-shrink:0;">Belum</span>
      </div>`;
    });
  }

  if (belumAbsen.length === 0 && sudahMasuk.length === 0) {
    html += '<div style="text-align:center;padding:16px;color:var(--green);font-size:13px;font-weight:600;">✓ Semua karyawan sudah absen masuk & pulang hari ini!</div>';
  }

  wrap.innerHTML = html;
}

// Auto-refresh panel Belum Absen
setInterval(() => {
  const cabang = document.getElementById('scanner-cabang');
  if (cabang && cabang.value) loadBelumAbsen();
}, 2 * 60 * 1000);

document.addEventListener('DOMContentLoaded', () => {
  const scanCabang = document.getElementById('scanner-cabang');
  if (scanCabang) {
    scanCabang.addEventListener('change', () => loadBelumAbsen());
  }
});
