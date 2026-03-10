// Datos de rangos inhabilitados (Serie B)
const disabledRanges = {
    "Bs50": [
        [67250001, 67700000], [69050001, 69500000], [69500001, 69950000],
        [69950001, 70400000], [70400001, 70850000], [70850001, 71300000],
        [76310012, 85139995], [86400001, 86850000], [90900001, 91350000],
        [91800001, 92250000]
    ],
    "Bs20": [
        [87280145, 91646549], [96650001, 97100000], [99800001, 100250000],
        [100250001, 100700000], [109250001, 109700000], [110600001, 111050000],
        [111050001, 111500000], [111950001, 112400000], [112400001, 112850000],
        [112850001, 113300000], [114200001, 114650000], [114650001, 115100000],
        [115100001, 115550000], [118700001, 119150000], [119150001, 119600000],
        [120500001, 120950000]
    ],
    "Bs10": [
        [77100001, 77550000], [78000001, 78450000], [78900001, 96350000],
        [96350001, 96800000], [96800001, 97250000], [98150001, 98600000],
        [104900001, 105350000], [105350001, 105800000], [106700001, 107150000],
        [107600001, 108050000], [108050001, 108500000], [109400001, 109850000]
    ]
};

// Estado global
let currentStream = null;
let isProcessing = false;
let historyData = JSON.parse(localStorage.getItem('billetescanner_history')) || [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    loadHistory();
    
    // Input validation para solo números
    document.getElementById('serial-input').addEventListener('input', function(e) {
        this.value = this.value.replace(/[^0-9]/g, '');
    });
});

// Navegación
function showScreen(screenName) {
    // Ocultar todas las pantallas
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    // Mostrar pantalla seleccionada
    document.getElementById(`screen-${screenName}`).classList.add('active');
    
    // Actualizar tabs
    const buttons = document.querySelectorAll('.nav-btn');
    const index = ['home', 'scanner', 'manual', 'history'].indexOf(screenName);
    if (index >= 0) buttons[index].classList.add('active');
    
    // Acciones específicas por pantalla
    if (screenName === 'scanner') {
        startCamera();
    } else {
        stopCamera();
    }
    
    if (screenName === 'history') {
        loadHistory();
    }
}

// Cámara y OCR
async function initCamera() {
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('camera-canvas');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });
        
        currentStream = stream;
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            document.getElementById('scan-status').textContent = 'Enfoca el número de serie';
        };
        
    } catch (err) {
        console.error('Error cámara:', err);
        document.getElementById('scan-status').textContent = 'No se pudo acceder a la cámara';
        showToast('Permiso de cámara denegado o no disponible');
    }
}

function startCamera() {
    if (!currentStream) {
        initCamera();
    } else {
        const video = document.getElementById('camera-feed');
        video.srcObject = currentStream;
        video.play();
    }
}

function stopCamera() {
    const video = document.getElementById('camera-feed');
    if (video.srcObject) {
        video.pause();
    }
}

async function captureAndAnalyze() {
    if (isProcessing) return;
    isProcessing = true;
    
    showLoading(true);
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('camera-canvas');
    const ctx = canvas.getContext('2d');
    
    // Capturar frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Análisis de color para denominación
    const denomination = detectDenomination(ctx, canvas.width, canvas.height);
    
    // OCR para número de serie
    const serialNumber = await performOCR(canvas);
    
    // Detección de Serie (A o B) basado en el número/patrón
    const series = detectSeries(serialNumber);
    
    // Validar
    const result = validateBill(series, denomination, serialNumber);
    
    // Mostrar resultados
    displayResult(result, 'scan-results');
    saveToHistory(result);
    
    showLoading(false);
    isProcessing = false;
}

function detectDenomination(ctx, width, height) {
    // Análisis de color en el centro de la imagen
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const radius = 50;
    
    const imageData = ctx.getImageData(centerX - radius, centerY - radius, radius * 2, radius * 2);
    const data = imageData.data;
    
    let r = 0, g = 0, b = 0;
    let count = 0;
    
    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
    }
    
    r = Math.floor(r / count);
    g = Math.floor(g / count);
    b = Math.floor(b / count);
    
    // Clasificación por color predominante
    // 10 = Azul (alto B, bajo R), 20 = Naranja (alto R, medio G), 50 = Violeta (alto R y B)
    
    if (b > r && b > g) {
        return "Bs10";
    } else if (r > 150 && g > 100 && b < 100) {
        return "Bs20";
    } else if (r > 100 && b > 100 && g < 150) {
        return "Bs50";
    } else if (r > g && r > b) {
        return "Bs20"; // Default a naranja si es rojizo
    }
    
    return "Desconocido";
}

async function performOCR(canvas) {
    try {
        const result = await Tesseract.recognize(
            canvas,
            'eng',
            { 
                tessedit_char_whitelist: '0123456789',
                logger: m => console.log(m)
            }
        );
        
        // Limpiar resultado (buscar secuencias de 8-9 dígitos)
        const text = result.data.text;
        const matches = text.match(/\d{8,9}/g);
        
        if (matches && matches.length > 0) {
            return matches[0].substring(0, 9); // Tomar primer número válido
        }
        
        return "No detectado";
    } catch (error) {
        console.error('OCR Error:', error);
        return "Error OCR";
    }
}

function detectSeries(serial) {
    if (serial === "No detectado" || serial === "Error OCR") return "Desconocida";
    
    // Serie B generalmente tiene números en ciertos rangos, pero para simplificar:
    // Si el número está en rangos específicos de B, es B, sino asumimos A
    // O podemos usar heurísticas de longitud/formato
    
    const num = parseInt(serial);
    if (isNaN(num)) return "Desconocida";
    
    // Verificar si está en algún rango de Serie B
    for (let denom in disabledRanges) {
        for (let range of disabledRanges[denom]) {
            if (num >= range[0] && num <= range[1]) {
                return "B";
            }
        }
    }
    
    return "A"; // Por defecto válido si no está en rangos inhabilitados
}

function validateBill(series, denomination, serialNumber) {
    const result = {
        series: series,
        denomination: denomination,
        serial: serialNumber,
        timestamp: new Date().toISOString(),
        isValid: true,
        message: "BILLETE VÁLIDO",
        detail: "Serie A - Tiene valor legal",
        status: "valid"
    };
    
    if (series === "A") {
        return result;
    }
    
    if (series === "B") {
        // Verificar si está en rangos inhabilitados
        const ranges = disabledRanges[denomination] || [];
        const num = parseInt(serialNumber);
        
        for (let range of ranges) {
            if (num >= range[0] && num <= range[1]) {
                result.isValid = false;
                result.status = "invalid";
                result.message = "SERIE B INHABILITADA";
                result.detail = "Sin valor legal - No aceptar";
                return result;
            }
        }
        
        result.detail = "Serie B válida (fuera de rangos inhabilitados)";
    }
    
    return result;
}

// Verificación Manual
function verifyManual() {
    const denomSelector = document.querySelector('input[name="denom"]:checked');
    const seriesSelector = document.querySelector('input[name="series"]:checked');
    const serialInput = document.getElementById('serial-input').value;
    
    if (!serialInput || serialInput.length < 5) {
        showToast('Ingrese un número de serie válido');
        return;
    }
    
    const denomination = "Bs" + denomSelector.value;
    const series = seriesSelector.value;
    
    const result = validateBill(series, denomination, serialInput);
    displayResult(result, 'manual-result');
    saveToHistory(result);
}

// Display Results
function displayResult(result, containerId) {
    const container = document.getElementById(containerId);
    const isValid = result.isValid;
    
    const html = `
        <div class="result-box ${isValid ? 'valid' : 'invalid'}">
            <div class="result-icon">${isValid ? '✅' : '⚠️'}</div>
            <div class="result-title">${result.message}</div>
            <div style="margin: 1rem 0; font-family: monospace; font-size: 1.2rem; letter-spacing: 2px;">
                ${result.denomination} - Serie ${result.series}
            </div>
            <div style="font-family: monospace; font-size: 1.1rem; margin-bottom: 0.5rem;">
                Nº: ${result.serial}
            </div>
            <div class="result-desc">${result.detail}</div>
            <div style="margin-top: 1rem; font-size: 0.8rem; opacity: 0.7;">
                ${new Date(result.timestamp).toLocaleString()}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    container.classList.remove('hidden');
}

// Historial
function saveToHistory(result) {
    historyData.unshift(result);
    if (historyData.length > 50) historyData.pop(); // Limitar a 50 items
    
    localStorage.setItem('billetescanner_history', JSON.stringify(historyData));
    if (document.getElementById('screen-history').classList.contains('active')) {
        loadHistory();
    }
}

function loadHistory() {
    const container = document.getElementById('history-list');
    
    if (historyData.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay verificaciones recientes</div>';
        return;
    }
    
    const html = historyData.map(item => `
        <div class="history-item ${item.status}">
            <div class="history-info">
                <h4>${item.denomination} - Serie ${item.series}</h4>
                <div class="history-meta">${item.serial} • ${new Date(item.timestamp).toLocaleDateString()}</div>
            </div>
            <div class="history-badge ${item.status}">
                ${item.isValid ? 'Válido' : 'Invalidado'}
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

function clearHistory() {
    if (confirm('¿Limpiar todo el historial?')) {
        historyData = [];
        localStorage.removeItem('billetescanner_history');
        loadHistory();
        showToast('Historial limpiado');
    }
}

// Utilidades
function showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(reg => console.log('Service Worker registrado'))
        .catch(err => console.log('Error registrando SW:', err));
}
function downloadQR() {
  const link = document.createElement('a');
  link.href = 'assets/qr-donacion.png';
  link.download = 'qr-donacion-intipixel.png';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('QR descargado');
}
document.getElementById('donation-qr').addEventListener('click', function() {
  // Abrir imagen en tamaño completo para escanear mejor desde otro celular
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.9); display: flex; 
    align-items: center; justify-content: center; z-index: 3000;
    flex-direction: column;
  `;
  modal.innerHTML = `
    <img src="assets/qr-donacion.png" style="width: 80%; max-width: 400px; border-radius: 8px;">
    <p style="color: white; margin-top: 20px; font-size: 1.1rem;">Escanea para donar</p>
    <button style="margin-top: 20px; padding: 10px 20px; border: none; border-radius: 20px; background: white; color: black; font-weight: bold;" onclick="this.parentElement.remove()">Cerrar</button>
  `;
  document.body.appendChild(modal);
});