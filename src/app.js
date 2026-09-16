/**
 * Absensi App - SMK Yappa Depok
 * Frontend logic dengan GPS validation, selfie compression, dan mock backend support
 */

// ==================== CONFIG ====================
const CONFIG = {
  // Webhook Google Apps Script (production, deploy 2026-09-16)
  webhookUrl: 'https://script.google.com/macros/s/AKfycbwjQttCY2qtNNvy8OpPVnz10_hVQdgPMYlKdhTfrAw2uUavh0NPO1qmaIqdZfO3aBOs/exec',
  
  // Titik koordinat sekolah (SMK Yappa Depok)
  school: {
    name: 'SMK Yappa Depok',
    lat: -6.394003,
    lng: 106.845314,
    radius: 150 // meter
  },
  
  // Validasi GPS
  maxAcceptableAccuracy: 50, // meter — lebih kecil = lebih akurat
  requireAccuracy: true,
  
  // Selfie
  maxPhotoSize: 1024 * 1024, // 1MB max
  maxDimension: 600, // px
  quality: 0.85 // JPEG quality
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
    processing: { badge: 'processing', text: 'Memproses...' },
    active: { badge: 'active', text: 'Valid ✅' },
    error: { badge: 'error', text: 'Gagal ❌' }
  };
  
  const s = map[status];
  els.gpsBadge.className = `badge ${s.badge}`;
  els.gpsBadge.textContent = message || s.text;
  
  if (status === 'active') {
    els.valLat.textContent = currentState.lat.toFixed(6);
    els.valLng.textContent = currentState.lng.toFixed(6);
    els.valAcc.textContent = currentState.accuracy.toFixed(2) + ' m';
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
    throw new Error(`Akurasi GPS (${accuracy.toFixed(0)}m) terlalu rendah. Maksimal ${CONFIG.maxAcceptableAccuracy}m.`);
  }
  
  if (dist > CONFIG.school.radius) {
    throw new Error(`Lokasi Anda (${dist.toFixed(0)}m dari ${CONFIG.school.name}) di luar radius ${CONFIG.school.radius}m.`);
  }
  
  return { distance: dist, valid: true };
}

els.btnGps.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setGpsStatus('error', 'GPS tidak didukung');
    alert('Browser Anda tidak mendukung Geolocation API.');
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
        showSuccess('Lokasi GPS valid!');
      } catch (err) {
        setGpsStatus('error', err.message);
        showError(err.message);
      }
    },
    err => {
      setGpsStatus('error', 'Gagal mendapatkan lokasi');
      showError('GPS Error: ' + err.message + '. Pastikan GPS aktif dan izin lokasi diberikan.');
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
  els.cameraInput.value = ''; // reset
  els.previewWrapper.style.display = 'none';
});

els.btnCamera.addEventListener('click', () => {
  els.cameraInput.click();
});

els.cameraInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (file.size > CONFIG.maxPhotoSize) {
    showError(`Ukuran foto terlalu besar (${(file.size/1024/1024).toFixed(1)}MB). Maksimal 1MB.`);
    return;
  }
  
  try {
    const compressed = await compressImage(file, CONFIG.maxDimension, CONFIG.quality);
    currentState.photoBase64 = compressed.base64;
    
    els.photoPreview.src = compressed.base64;
    els.previewWrapper.style.display = 'block';
    showSuccess('Foto dikompres & siap dikirim!');
  } catch (err) {
    showError('Gagal memproses foto: ' + err.message);
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
            height = (height * maxDim) / width;
            width = maxDim;
          } else {
            width = (width * maxDim) / height;
            height = maxDim;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to JPEG (lebih kecil dari PNG)
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve({ base64, width, height });
      };
      img.onerror = () => reject(new Error('Gagal membaca gambar'));
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
  
  setTimeout(() => {
    els.alertBox.style.display = 'none';
  }, 3000);
}

function showError(msg) {
  els.alertBox.className = 'alert error';
  els.alertBox.textContent = msg;
  els.alertBox.style.display = 'block';
  
  setTimeout(() => {
    els.alertBox.style.display = 'none';
  }, 5000);
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Validasi nama
  const nama = els.nama.value.trim();
  if (!nama) {
    showError('Nama/NIS wajib diisi!');
    els.nama.focus();
    return;
  }
  
  // Validasi GPS
  if (!currentState.lat || !currentState.lng) {
    showError('Ambil lokasi GPS dulu!');
    setGpsStatus('idle', 'Ambil GPS dulu');
    els.btnGps.click();
    return;
  }
  
  // Validasi webhook URL (mock check)
  if (CONFIG.webhookUrl.includes('YOUR_WEBHOOK_URL')) {
    // MODE MOCK: Simulasi tanpa kirim ke server
    showMockSuccess(nama);
    return;
  }
  
  // Kirim ke server
  await submitAttendance(nama);
});

function showMockSuccess(nama) {
  // Simulasi response server
  const mockResponse = {
    status: 'ok',
    msg: `Mock: Absensi "${nama}" diterima.`,
    timestamp: new Date().toISOString(),
    serverLat: CONFIG.school.lat,
    serverLng: CONFIG.school.lng
  };
  
  console.log('[MOCK] Submit data:', {
    nama,
    role: els.role.value,
    tipe: els.tipe.value,
    lat: currentState.lat,
    lng: currentState.lng,
    photo: currentState.photoBase64 ? 'base64(' + currentState.photoBase64.substring(0,50) + '...)' : null
  });
  
  els.nama.value = '';
  els.previewWrapper.style.display = 'none';
  els.cameraInput.value = '';
  currentState.photoBase64 = null;
  currentState.lat = null;
  currentState.lng = null;
  
  showSuccess(mockResponse.msg);
}

async function submitAttendance(nama) {
  const payload = {
    nama,
    role: els.role.value,
    tipe: els.tipe.value,
    lat: currentState.lat,
    lng: currentState.lng,
    photo: currentState.photoBase64 || null,
    timestamp: new Date().toISOString()
  };
  
  els.btnSubmit.disabled = true;
  els.btnText.innerHTML = '<span class="loader"></span> Mengirim...';
  
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
    els.btnText.textContent = '✅ Kirim Absensi';
  }
}

function resetForm() {
  els.nama.value = '';
  els.previewWrapper.style.display = 'none';
  els.cameraInput.value = '';
  currentState.photoBase64 = null;
  currentState.lat = null;
  currentState.lng = null;
  setGpsStatus('idle');
}

// ==================== INIT ====================
console.log('[Absensi App] Loaded. Config loaded. Webhook URL:', CONFIG.webhookUrl);
