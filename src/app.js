// Absensi App - SMK Yappa Depok Frontend logic: Multi-Class, Shift/Jam, GPS (20m), High-Res/iPhone Image Compressor, Webhook to Google Sheets

// ==================== CONFIG ====================
const CONFIG = {
  webhookUrl: 'https://script.google.com/macros/s/AKfycbx1wNb0V4fI3AhfKMX_Mz8-d-hm3QDntXZmQKbtEp1eR0v3XhxxsMdro__T633_yuUd/exec',
  school: {
    name: 'SMK Yappa Depok',
    lat: -6.394003,
    lng: 106.845314,
    radius: 30
  },
  maxAcceptableAccuracy: 40,
  requireAccuracy: true,
  maxPhotoInputSize: 20 * 1024 * 1024,
  maxDimension: 800,
  quality: 0.75,
  secretToken: 'YAPPA-2026-SECRET'
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

// ==================== SECURITY HELPER ====================
async function generateSecurePayload(nama, jam) {
  const timestamp = Date.now();
  const secret = CONFIG.secretToken; 
  const rawData = `${nama}|${jam}|${timestamp}|${secret}`;
  
  const msgBuffer = new TextEncoder().encode(rawData);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return { timestamp, signature };
}

// ==================== GPS HANDLERS ====================
function setGpsStatus(status, message = '') {
  const map = {
    idle: { badge: 'idle', text: 'Belum Diambil' },
    processing: { badge: 'processing', text: 'Memproses GPS...' },
    active: { badge: 'active', text: 'Valid ✅' },
    error: { badge: 'error', text: 'Gagal ❌' }
  };
  
  const s = map[status] || map.idle;
  if(els.gpsBadge) {
    els.gpsBadge.className = `badge ${s.badge}`;
    els.gpsBadge.textContent = message || s.text;
  }
  
  if(els.valLat && els.valLng && els.valAcc) {
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
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
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

if(els.btnGps) {
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
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// ==================== CAMERA / SELFIE HANDLERS ====================
if(els.tipe) {
  els.tipe.addEventListener('change', () => {
    if(els.sectionSelfie) {
      els.sectionSelfie.style.display = els.tipe.value === 'foto' ? 'block' : 'none';
    }
    if (els.tipe.value !== 'foto') {
      currentState.photoBase64 = null;
      if(els.previewWrapper) els.previewWrapper.style.display = 'none';
    }
  });
}

if(els.btnCamera) {
  els.btnCamera.addEventListener('click', () => {
    if(els.cameraInput) els.cameraInput.click();
  });
}

if(els.cameraInput) {
  els.cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > CONFIG.maxPhotoInputSize) {
      showError(`Ukuran foto mentah terlalu besar (${(file.size/1024/1024).toFixed(1)}MB). Maksimal 20MB.`);
      return;
    }
    
    try {
      if(els.btnCamera) els.btnCamera.textContent = '⏳ Mengompres foto...';
      const compressed = await compressImage(file, CONFIG.maxDimension, CONFIG.quality);
      currentState.photoBase64 = compressed.base64;
      
      if(els.photoPreview) els.photoPreview.src = compressed.base64;
      if(els.previewWrapper) els.previewWrapper.style.display = 'block';
      if(els.btnCamera) els.btnCamera.textContent = '🔄 Ambil Ulang Foto';
      showSuccess('Foto berhasil diproses & dikompres!');
    } catch (err) {
      showError('Gagal memproses foto: ' + err.message);
      if(els.btnCamera) els.btnCamera.textContent = '📸 Buka Kamera Selfie';
    }
  });
}

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
  if(!els.alertBox) return;
  els.alertBox.className = 'alert success';
  els.alertBox.textContent = msg;
  els.alertBox.style.display = 'block';
  setTimeout(() => { els.alertBox.style.display = 'none'; }, 4000);
}

function showError(msg) {
  if(!els.alertBox) return;
  els.alertBox.className = 'alert error';
  els.alertBox.textContent = msg;
  els.alertBox.style.display = 'block';
  setTimeout(() => { els.alertBox.style.display = 'none'; }, 6000);
}

if(els.form) {
  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nama = els.nama.value.trim();
    const kelas = els.kelas.value;
    const jam = els.jam.value;

    if (!nama) { showError('Nama Lengkap / NIS wajib diisi!'); els.nama.focus(); return; }
    if (!kelas) { showError('Silakan pilih Kelas!'); els.kelas.focus(); return; }
    if (!jam) { showError('Silakan pilih Jam Pelajaran / Sesi!'); els.jam.focus(); return; }
    
    if (!currentState.lat || !currentState.lng) {
      showError('Silakan ambil lokasi GPS terlebih dahulu!');
      if(els.btnGps) els.btnGps.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (els.tipe.value === 'foto' && !currentState.photoBase64) {
      showError('Wajib ambil foto selfie sebelum submit!');
      if(els.btnCamera) els.btnCamera.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    
    await submitAttendanceWithRetry({ nama, kelas, jam }, 3);
  });
}

// Fungsi Submit dengan Auto-Retry (Write Bottleneck Mitigasi)
async function submitAttendanceWithRetry({ nama, kelas, jam }, maxRetries) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    try {
      if(els.btnSubmit) els.btnSubmit.disabled = true;
      if(els.btnText) {
        els.btnText.innerHTML = attempt > 1 
          ? `<span class="loader"></span> Server sibuk, mencoba ulang (${attempt}/${maxRetries})...` 
          : `<span class="loader"></span> Menyimpan absensi...`;
      }
      
      const security = await generateSecurePayload(nama, jam);

      const payload = {
        nama,
        kelas,
        jam,
        role: els.role ? els.role.value : 'siswa',
        tipe: els.tipe ? els.tipe.value : 'gps',
        lat: currentState.lat,
        lng: currentState.lng,
        photo: currentState.photoBase64 || null,
        timestamp: security.timestamp,
        signature: security.signature
      };
      
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
        return; // Berhasil, keluar dari loop
      } else {
        // Kalau error karena duplikat atau signature, gak usah retry
        showError(data.msg || 'Gagal mengirim absensi.');
        return; 
      }
    } catch (err) {
      console.error(`Attempt ${attempt} failed:`, err);
      if (attempt >= maxRetries) {
        showError('Gagal menghubungi server setelah 3 kali percobaan. Coba lagi nanti.');
      } else {
        // Tunggu 2 detik sebelum retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } finally {
      if(els.btnSubmit) els.btnSubmit.disabled = false;
      if(els.btnText) els.btnText.textContent = 'Kirim Absensi';
    }
  }
}

function resetForm() {
  if(els.nama) els.nama.value = '';
  if(els.previewWrapper) els.previewWrapper.style.display = 'none';
  if(els.cameraInput) els.cameraInput.value = '';
  if(els.btnCamera) els.btnCamera.textContent = '📸 Buka Kamera Selfie';
  currentState.photoBase64 = null;
  currentState.lat = null;
  currentState.lng = null;
  setGpsStatus('idle');
}
