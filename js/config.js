// ============================================================
// KONFIGURASI SUPABASE & VARIABEL GLOBAL
// ============================================================
const DEFAULT_SUPABASE_URL = 'https://flwkxasjresbfangppmr.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_SwFRYmFa3PoZX21LMhJTRg_3B4l6Sr1';

const SUPABASE_URL = localStorage.getItem('sb_url') || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = localStorage.getItem('sb_key') || DEFAULT_SUPABASE_ANON_KEY;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let appStarted = false;
let allRows = [], currentPage = 1;
const PAGE_SIZE = 15;
let lineChart = null, doughnutChart = null;
let cabangList = [];
const tz = { timeZone: 'Asia/Jakarta' };
let jamMasuk = '09:00';
let toleransiMenit = 0;
let loggedInUserEmail = 'Unknown Admin';

// Scanner variables
let html5QrCode = null;
let isScanning = false;
let lastScanTime = 0;
const SCAN_COOLDOWN = 4000; // 4 seconds cooldown between scans
let cooldownTimerInterval = null;

// Settings variables
let fonnteToken = '', waTarget = '', waEnabled = false;

// Location settings
let lokasiEnabled = false;
let lokasiLat = -6.2030017;
let lokasiLng = 106.7147163;
let lokasiRadius = 100; // meters
let lokasiNama = 'BHC Professional';

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung di browser ini'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      err => {
        if (err.code === 1) reject(new Error('Izin lokasi ditolak. Aktifkan GPS dan izinkan akses lokasi.'));
        else if (err.code === 2) reject(new Error('Lokasi tidak tersedia. Pastikan GPS aktif.'));
        else reject(new Error('Timeout mendapatkan lokasi. Coba lagi.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

// ---- UTILITIES: XSS & CSV SANITIZATION ----
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  return `"${String(val).replace(/"/g, '""')}"`;
}

// ---- SCANNER COOLDOWN VISUAL INDICATOR ----
function triggerScannerCooldown(durationMs = SCAN_COOLDOWN) {
  const box = document.getElementById('scanner-cooldown-box');
  const text = document.getElementById('scanner-status-text');
  const timer = document.getElementById('scanner-cooldown-timer');
  const bar = document.getElementById('scanner-cooldown-bar');
  if (!box || !text || !timer || !bar) return;

  if (cooldownTimerInterval) clearInterval(cooldownTimerInterval);

  const startTime = Date.now();
  const endTime = startTime + durationMs;

  box.style.background = 'rgba(201, 169, 110, 0.12)';
  box.style.borderColor = 'rgba(201, 169, 110, 0.35)';
  text.style.color = 'var(--gold)';
  text.innerHTML = '<span class="live-dot" style="background: var(--gold); width: 7px; height: 7px;"></span> Jeda Scan (Cooldown)';

  cooldownTimerInterval = setInterval(() => {
    const now = Date.now();
    const remainingMs = Math.max(0, endTime - now);
    const progressPct = (remainingMs / durationMs) * 100;
    const remainingSec = (remainingMs / 1000).toFixed(1);

    bar.style.width = `${progressPct}%`;
    timer.textContent = `${remainingSec}s`;

    if (remainingMs <= 0) {
      clearInterval(cooldownTimerInterval);
      cooldownTimerInterval = null;
      box.style.background = 'rgba(39, 174, 96, 0.1)';
      box.style.borderColor = 'rgba(39, 174, 96, 0.25)';
      text.style.color = 'var(--green)';
      text.innerHTML = '<span class="live-dot" style="background: var(--green); width: 7px; height: 7px;"></span> Scanner Siap';
      timer.textContent = 'Ready';
      bar.style.width = '0%';
    }
  }, 50);
}

// ---- AUDIO TONES FOR FEEDBACK ----
function playAudioTone(success) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (success) {
      // Success beep: high tone, short
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      oscillator.stop(audioCtx.currentTime + 0.15);
    } else {
      // Error buzzer: low sawtooth tone
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(120, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.40);
      oscillator.stop(audioCtx.currentTime + 0.40);
    }
  } catch (e) {
    console.log("Audio feedback not supported: ", e);
  }
}

// ---- CLOCK ----
function updateClock() {
  const timeStr = new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit', ...tz });
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');
  const mobileClk = document.getElementById('clock-time-mobile');
  
  if (timeEl) timeEl.textContent = timeStr;
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('id-ID', { weekday:'short', day:'numeric', month:'short', year:'numeric', ...tz });
  if (mobileClk) mobileClk.textContent = timeStr;
}
updateClock(); setInterval(updateClock, 1000);
