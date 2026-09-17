/**
 * Absensi App - SMK Yappa Depok
 * Frontend logic: Multi-Class, Shift/Jam, GPS (20m), High-Res/iPhone Image Compressor, Webhook to Google Sheets
 */

// ==================== CONFIG ====================
const CONFIG = {
  // Webhook Google Apps Script
  webhookUrl: 'https://script.google.com/macros/s/AKfycbzrxjjVs3GvmJsplq4CrrdUz5JCX64zh78pDpxaNS-PR-5IU5AQhyDFNSPF77CZtR1X/exec',
  
  // Titik koordinat sekolah (SMK Yappa Depok)
  school: {
    name: 'SMK Yappa Depok',
    lat: -6.394003,
    lng: 106.845314,
    radius: 20 // meter
  },
  
  // Validasi GPS
  maxAcceptableAccuracy: 40, // meter toleransi GPS HP
  requireAccuracy: true,
  
  // Selfie Compression (iPhone & Android high-res safe)
  maxPhotoInputSize: 20 * 1024 * 1024, // terima hingga 20MB file mentah
  maxDimension: 800, // resize max 800px (sangat tajam untuk selfie tapi kecil ukurannya)
  quality: 0.75 // JPEG quality ~80-120KB
};

// ==================== DOM ELEMENTS ====================
const els = {
  gpsBadge: document.getElementById('gps-badge'),
  valLat: document.getElementById('val-lat'),
  valLng: document.getElementById('val-lng'),
  valAcc: document.getElementById('val-acc'),
  btnGps: document.getElementById('btn-gps'),
  form: document.getElementById('form-absen'),
  nama: document.getElementById('nama'),
  kelas: document.getElementById('kelas'),
  jam: document.getElementById('jam'),
  role: document.getElementById('role'),
  tipe: document.getElementById('tipe'),
  sectionSelfie: document.getElementById('section-selfie'),
  btnCamera: document.getElementById('btn-camera'),
  cameraInput: document.getElementById('camera-input'),
  previewWrapper: document.getElementById('preview-wrapper'),
  photoPreview: document.getElementById('photo-preview'),
  alertBox: document.getElementById('alert-box'),
  btnSubmit: document.getElementById('btn-submit'),
  btnText: document.querySelector('.btn-text')
};

// ==================== STATE ====================
let currentState = {
  lat: null,
  lng: null,
  accuracy: null,
  photoBase64: null
};

// ==================== GPS HANDLERS ====================
function setGpsStatus(status, message = '') {
  const map = {
    idle: { badge: 'idle', text: 'Belum Diambil' },
    processing: { badge: 'processing', text: 'Memproses GPS...' },
    active: { badge: 'active', text: 'Valid ✅' },
    error: { badge: 'error', text: 'Gagal ❌' }
  };
  
  const s = map[status] || map.idle;
  els.gpsBadge.className = `badge ${s.badge}`;
  els.gpsBadge.textContent = message || s.text;
  
  if (status === 'active') {
    els.valLat.textContent = currentState.lat.toFixed(6);
    els.valLng.textContent = currentState.lng.toFixed(6);
    els.valAcc.textContent = currentState.accuracy.toFixed(1) + ' m';
  } else {
    els.valLat.textContent = '-';
    els.valLng.textContent = '-';
    els.valAcc.textContent = '-';
  }
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meter
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*toRad) * Math.cos(lat2*toRad) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function validateLocation(lat, lng, accuracy) {
  const dist = haversine(lat, lng, CONFIG.school.lat, CONFIG.school.lng);
  
  if (CONFIG.requireAccuracy && accuracy > CONFIG.maxAcceptableAccuracy) {
    throw new Error(`Akurasi GPS (${accuracy.toFixed(0)}m) kurang presisi. Maksimal ${CONFIG.maxAcceptableAccuracy}m.`);
  }
  
  if (dist > CONFIG.school.radius) {
    throw new Error(`Anda berada ${dist.toFixed(1)}m dari sekolah (Maksimal radius ${CONFIG.school.radius}m).`);
  }
  
  return { distance: dist, valid: true };
}

els.btnGps.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setGpsStatus('error', 'GPS tidak didukung');
    showError('Browser Anda tidak mendukung Geolocation API.');
    return;
  }
  
  setGpsStatus('processing');
  
  navigator.geolocation.getCurrentPosition(
    pos => {
      currentState.lat = pos.coords.latitude;
      currentState.lng = pos.coords.longitude;
      currentState.accuracy = pos.coords.accuracy || 0;
      
      try {
        validateLocation(currentState.lat, currentState.lng, currentState.accuracy);
        setGpsStatus('active', `Valid ✅ (${currentState.accuracy.toFixed(0)}m)`);
        showSuccess('Lokasi GPS valid di area sekolah!');
      } catch (err) {
        setGpsStatus('error', err.message);
        showError(err.message);
      }
    },
    err => {
      setGpsStatus('error', 'Gagal ambil lokasi');
      showError('GPS Error: ' + err.message + '. Pastikan GPS aktif dan beri izin browser.');
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
});

// ==================== CAMERA / SELFIE HANDLERS ====================
els.tipe.addEventListener('change', () => {
  els.sectionSelfie.style.display = els.tipe.value === 'foto' ? 'block' : 'none';
  if (els.tipe.value !== 'foto') {
    currentState.photoBase64 = null;
    els.previewWrapper.style.display = 'none';
  }
});

els.btnCamera.addEventListener('click', () => {
  els.cameraInput.click();
});

els.cameraInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (file.size > CONFIG.maxPhotoInputSize) {
    showError(`Ukuran foto mentah terlalu besar (${(file.size/1024/1024).toFixed(1)}MB). Maksimal 20MB.`);
    return;
  }
  
  try {
    els.btnCamera.textContent = '⏳ Mengompres foto...';
    const compressed = await compressImage(file, CONFIG.maxDimension, CONFIG.quality);
    currentState.photoBase64 = compressed.base64;
    
    els.photoPreview.src = compressed.base64;
    els.previewWrapper.style.display = 'block';
    els.btnCamera.textContent = '🔄 Ambil Ulang Foto';
    showSuccess('Foto berhasil diproses & dikompres!');
  } catch (err) {
    showError('Gagal memproses foto: ' + err.message);
    els.btnCamera.textContent = '📸 Buka Kamera Selfie';
  }
});

function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let width = img.width;
        let height = img.height;
        
        if (Math.max(width, height) > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve({ base64, width, height });
      };
      img.onerror = () => reject(new Error('Gagal render gambar'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

// ==================== FORM SUBMISSION ====================
function showSuccess(msg) {
  els.alertBox.className = 'alert success';
  els.alertBox.textContent = msg;
  els.alertBox.style.display = 'block';
  setTimeout(() => { els.alertBox.style.display = 'none'; }, 4000);
}

function showError(msg) {
  els.alertBox.className = 'alert error';
  els.alertBox.textContent = msg;
  els.alertBox.style.display = 'block';
  setTimeout(() => { els.alertBox.style.display = 'none'; }, 6000);
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const nama = els.nama.value.trim();
  const kelas = els.kelas.value;
  const jam = els.jam.value;

  if (!nama) {
    showError('Nama Lengkap / NIS wajib diisi!');
    els.nama.focus();
    return;
  }

  if (!kelas) {
    showError('Silakan pilih Kelas!');
    els.kelas.focus();
    return;
  }

  if (!jam) {
    showError('Silakan pilih Jam Pelajaran / Sesi!');
    els.jam.focus();
    return;
  }
  
  // Validasi GPS
  if (!currentState.lat || !currentState.lng) {
    showError('Silakan ambil lokasi GPS terlebih dahulu!');
    els.btnGps.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  // Validasi Foto jika tipe = foto
  if (els.tipe.value === 'foto' && !currentState.photoBase64) {
    showError('Wajib ambil foto selfie sebelum submit!');
    els.btnCamera.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  
  await submitAttendance({ nama, kelas, jam });
});

async function submitAttendance({ nama, kelas, jam }) {
  const payload = {
    nama,
    kelas,
    jam,
    role: els.role.value,
    tipe: els.tipe.value,
    lat: currentState.lat,
    lng: currentState.lng,
    photo: currentState.photoBase64 || null,
    timestamp: new Date().toISOString()
  };
  
  els.btnSubmit.disabled = true;
  els.btnText.innerHTML = '<span class="loader"></span> Menyimpan absensi...';
  
  try {
    const res = await fetch(CONFIG.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    
    const data = await res.json();
    
    if (data.status === 'ok') {
      showSuccess(data.msg);
      resetForm();
    } else {
      showError(data.msg || 'Gagal mengirim absensi.');
    }
  } catch (err) {
    showError('Network error: ' + err.message);
    console.error('Fetch error:', err);
  } finally {
    els.btnSubmit.disabled = false;
    els.btnText.textContent = 'Kirim Absensi';
  }
}

function resetForm() {
  els.nama.value = '';
  els.previewWrapper.style.display = 'none';
  els.cameraInput.value = '';
  els.btnCamera.textContent = '📸 Buka Kamera Selfie';
  currentState.photoBase64 = null;
  currentState.lat = null;
  currentState.lng = null;
  setGpsStatus('idle');
}
