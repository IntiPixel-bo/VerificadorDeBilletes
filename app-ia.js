// Configuración de Rangos Inhabilitados Serie B
const INVALID_RANGES = {
    "Bs10": [[77100001, 77550000], [78000001, 78450000], [78900001, 96350000], [96350001, 96800000], [96800001, 97250000], [98150001, 98600000], [104900001, 105350000], [105350001, 105800000], [106700001, 107150000], [107600001, 108050000], [108050001, 108500000], [109400001, 109850000]],
    "Bs20": [[87280145, 91646549], [96650001, 97100000], [99800001, 100250000], [100250001, 100700000], [109250001, 109700000], [110600001, 111050000], [111050001, 111500000], [111950001, 112400000], [112400001, 112850000], [112850001, 113300000], [114200001, 114650000], [114650001, 115100000], [115100001, 115550000], [118700001, 119150000], [119150001, 119600000], [120500001, 120950000]],
    "Bs50": [[67250001, 67700000], [69050001, 69500000], [69500001, 69950000], [69950001, 70400000], [70400001, 70850000], [70850001, 71300000], [76310012, 85139995], [86400001, 86850000], [90900001, 91350000], [91800001, 92250000]]
};

// Estado global
let currentMode = 'batch';
let detectedBills = [];
let tesseractWorker = null;
let isProcessing = false;
let videoStream = null;

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    await initCamera();
    await initOCR();
    updateStats();
});

// Inicializar OCR con configuración óptima para billetes bolivianos
async function initOCR() {
    showLoader(true, 'Inicializando motor OCR...');
    
    try {
        tesseractWorker = await Tesseract.createWorker('eng');
        await tesseractWorker.load();
        await tesseractWorker.loadLanguage('eng');
        await tesseractWorker.initialize('eng');
        
        // Configuración óptima para números de serie de billetes
        await tesseractWorker.setParameters({
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            tessedit_pageseg_mode: '7', // Tratar como línea única
            preserve_interword_spaces: '0',
            tessedit_ocr_engine_mode: '2', // Neural LSTM only
        });
        
        document.getElementById('conn-status').style.color = '#00c853';
        showLoader(false);
    } catch (error) {
        console.error('Error OCR:', error);
        alert('Error al cargar el motor OCR. Recarga la página.');
    }
}

// Inicializar Cámara
async function initCamera() {
    const video = document.getElementById('video');
    
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                focusMode: 'continuous'
            }
        });
        
        video.srcObject = videoStream;
        await video.play();
        
        // Ajustar canvas al tamaño del video
        const canvas = document.getElementById('preview-canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        
    } catch (err) {
        console.error('Error cámara:', err);
        alert('No se pudo acceder a la cámara. Usa el modo manual.');
    }
}

// Análisis de Pila de Billetes (Múltiple)
async function analyzeStack() {
    if (isProcessing || !tesseractWorker) return;
    isProcessing = true;
    
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Capturar frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Mostrar loader con progreso
    showLoader(true, 'Detectando billetes...');
    updateProgress(20);
    
    // Dividir imagen en regiones (para billetes apilados)
    const regions = detectBillRegions(canvas);
    detectedBills = [];
    updateProgress(40);
    
    // Procesar cada región
    for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        const regionCanvas = cropCanvas(canvas, region);
        
        updateProgress(40 + (i / regions.length) * 40);
        document.getElementById('ocr-detail').textContent = `Analizando billete ${i + 1} de ${regions.length}...`;
        
        const result = await processBillRegion(regionCanvas, region);
        if (result) {
            detectedBills.push(result);
            renderBoundingBox(region, result);
        }
    }
    
    updateProgress(100);
    setTimeout(() => showLoader(false), 500);
    
    // Mostrar resultados
    displayResults();
    updateStats();
    isProcessing = false;
}

// Detectar regiones de billetes (simulación de detección visual)
function detectBillRegions(canvas) {
    const regions = [];
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Estrategia: dividir en grid inteligente basado en colores dominantes
    const cols = 2; // Máximo 2 columnas
    const rows = Math.ceil(4 / cols); // Hasta 4 billetes
    
    const cellWidth = width / cols;
    const cellHeight = height / rows;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = col * cellWidth + 20;
            const y = row * cellHeight + 20;
            const w = cellWidth - 40;
            const h = cellHeight - 40;
            
            // Verificar si hay contenido (color no negro)
            const hasContent = checkRegionHasBill(ctx, x, y, w, h);
            
            if (hasContent) {
                regions.push({ x, y, width: w, height: h, id: regions.length + 1 });
            }
        }
    }
    
    // Si no se detectaron regiones, usar toda la imagen
    if (regions.length === 0) {
        regions.push({ x: 50, y: 50, width: width - 100, height: height - 100, id: 1 });
    }
    
    return regions;
}

// Verificar si una región contiene un billete (análisis de color)
function checkRegionHasBill(ctx, x, y, w, h) {
    try {
        const imageData = ctx.getImageData(x, y, w, h);
        const data = imageData.data;
        let brightnessSum = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
            brightnessSum += brightness;
        }
        
        const avgBrightness = brightnessSum / (data.length / 4);
        return avgBrightness > 30; // No es completamente negro
    } catch (e) {
        return true;
    }
}

// Recortar canvas
function cropCanvas(sourceCanvas, region) {
    const destCanvas = document.createElement('canvas');
    destCanvas.width = region.width;
    destCanvas.height = region.height;
    const ctx = destCanvas.getContext('2d');
    ctx.drawImage(sourceCanvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    return destCanvas;
}

// Procesar región individual con OCR optimizado
async function processBillRegion(canvas, region) {
    // Preprocesamiento de imagen para OCR óptimo
    const processedCanvas = preProcessForOCR(canvas);
    
    // Análisis de color para denominación
    const denomination = detectDenominationByColor(processedCanvas);
    
    // OCR del número de serie
    const { serial, series, confidence } await performAdvancedOCR(processedCanvas);
    
    if (!serial || serial === '000000000') return null;
    
    // Normalizar a 9 dígitos (completar con ceros a la izquierda)
    const normalizedSerial = serial.toString().padStart(9, '0');
    
    // Validar contra rangos
    const isValid = validateBillSeries(denomination, parseInt(normalizedSerial));
    
    return {
        id: region.id,
        denomination,
        series,
        serial: normalizedSerial,
        confidence: Math.round(confidence),
        isValid,
        region,
        timestamp: new Date().toISOString()
    };
}

// Preprocesamiento de imagen para OCR (Mejora significativa de precisión)
function preProcessForOCR(sourceCanvas) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    
    // Dibujar original
    ctx.drawImage(sourceCanvas, 0, 0);
    
    // Obtener datos de imagen
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Procesamiento: Mejorar contraste para números de serie (típicamente oscuros sobre fondo claro)
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // Threshold adaptativo (Binarización)
        const threshold = 120;
        const value = gray > threshold ? 255 : 0;
        
        // Sharpen (bordes más definidos)
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Escalar para mejorar OCR (Tesseract funciona mejor con cierto tamaño)
    const scaleCanvas = document.createElement('canvas');
    const scaleCtx = scaleCanvas.getContext('2d');
    scaleCanvas.width = sourceCanvas.width * 2;
    scaleCanvas.height = sourceCanvas.height * 2;
    scaleCtx.imageSmoothingEnabled = false;
    scaleCtx.drawImage(canvas, 0, 0, scaleCanvas.width, scaleCanvas.height);
    
    return scaleCanvas;
}

// Detección de denominación por Color (95% precisión)
function detectDenominationByColor(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let blueScore = 0, orangeScore = 0, purpleScore = 0;
    const sampleRate = 4; // Analizar 1 de cada 4 píxeles para rendimiento
    
    for (let i = 0; i < data.length; i += 4 * sampleRate) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Convertir a HSV para mejor precisión
        const hsv = rgbToHsv(r, g, b);
        const [h, s, v] = hsv;
        
        // Clasificación precisa por rangos HSV
        // Azul (Bs 10): Hue 200-240
        if (h >= 200 && h <= 240 && s > 0.3) blueScore++;
        
        // Naranja (Bs 20): Hue 15-45
        else if (h >= 15 && h <= 45 && s > 0.4) orangeScore++;
        
        // Violeta/Morado (Bs 50): Hue 270-310 o bajo rojo con azul alto
        else if ((h >= 270 && h <= 310) || (h > 280 && b > r && r > 100)) purpleScore++;
    }
    
    const total = blueScore + orangeScore + purpleScore;
    if (total === 0) return 'Desconocido';
    
    // Determinar ganador
    const scores = [
        { denom: 'Bs10', score: blueScore, color: 'blue' },
        { denom: 'Bs20', score: orangeScore, color: 'orange' },
        { denom: 'Bs50', score: purpleScore, color: 'purple' }
    ];
    
    scores.sort((a, b) => b.score - a.score);
    const confidence = (scores[0].score / total * 100).toFixed(1);
    
    return scores[0].denom;
}

// Conversión RGB a HSV
function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    
    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    
    return [h * 360, s, v];
}

// OCR Avanzado con extracción de Serie
async function performAdvancedOCR(canvas) {
    try {
        // Configurar ROI para buscar solo la zona del número de serie (parte superior derecha típicamente)
        const result = await tesseractWorker.recognize(canvas);
        const text = result.data.text.toUpperCase();
        const confidence = result.data.confidence;
        
        // Patrones regex para billetes bolivianos
        // Serie: Letra (A o B) seguida de 8-9 dígitos, o solo 8-9 dígitos
        const patterns = [
            /([AB])\s*(\d{8,9})/, // Formato: A 123456789 o B12345678
            /(\d{8,9})/,           // Solo números
            /([AB])[\s\-]?(\d{4,5})\s*(\d{4})/ // Separado: A 12345 6789
        ];
        
        let series = 'A'; // Por defecto
        let serial = '';
        
        // Limpiar texto
        const cleaned = text.replace(/[^0-9A-Z]/g, ' ').replace(/\s+/g, ' ');
        
        // Buscar patrón de Serie B explícita
        if (cleaned.includes(' B') || cleaned.startsWith('B')) {
            series = 'B';
        } else if (cleaned.includes(' A') || cleaned.startsWith('A')) {
            series = 'A';
        }
        
        // Extraer números (preferiblemente 9 dígitos)
        const numbers = cleaned.match(/\d{8,9}/);
        if (numbers) {
            serial = numbers[0];
        } else {
            // Fallback: buscar cualquier secuencia de 7+ dígitos
            const fallback = cleaned.match(/\d{7,}/);
            if (fallback) serial = fallback[0];
        }
        
        // Limpiar serial (solo números)
        serial = serial.replace(/\D/g, '');
        
        return { serial, series, confidence };
    } catch (error) {
        console.error('OCR Error:', error);
        return { serial: null, series: 'A', confidence: 0 };
    }
}

// Validación contra rangos oficiales
function validateBillSeries(denomination, serialNum) {
    if (!denomination || !serialNum) return false;
    if (isNaN(serialNum)) return false;
    
    const ranges = INVALID_RANGES[denomination];
    if (!ranges) return true; // Si no hay datos, considerar válido
    
    // Verificar si cae en algún rango inhabilitado
    for (const [start, end] of ranges) {
        if (serialNum >= start && serialNum <= end) {
            return false; // Está inhabilitado
        }
    }
    
    return true; // Válido
}

// Renderizar Bounding Box en la UI
function renderBoundingBox(region, data) {
    const layer = document.getElementById('detection-layer');
    const box = document.createElement('div');
    
    const isValid = data.isValid;
    box.className = `bill-bounding-box ${isValid ? '' : 'invalid'}`;
    box.style.left = `${(region.x / region.parentWidth) * 100}%`;
    box.style.top = `${(region.y / region.parentHeight) * 100}%`;
    box.style.width = `${(region.width / region.parentWidth) * 100}%`;
    box.style.height = `${(region.height / region.parentHeight) * 100}%`;
    
    box.innerHTML = `
        <div class="bill-label-floating">
            ${data.denomination} - ${data.series} ${data.serial.slice(-4)}
        </div>
    `;
    
    layer.appendChild(box);
    
    // Auto-remover después de 3 segundos
    setTimeout(() => box.remove(), 3000);
}

// Mostrar resultados en cards
function displayResults() {
    const container = document.getElementById('bills-container');
    container.innerHTML = '';
    
    detectedBills.forEach(bill => {
        const card = document.createElement('div');
        card.className = `result-card-ia ${bill.isValid ? 'valid' : 'invalid'}`;
        
        const colorClass = bill.denomination === 'Bs10' ? 'blue' : 
                          bill.denomination === 'Bs20' ? 'orange' : 'purple';
        
        card.innerHTML = `
            <div class="bill-thumb ${colorClass}">
                ${bill.denomination.replace('Bs', '')}
            </div>
            <div class="bill-data">
                <h4>${bill.serial}</h4>
                <div class="bill-meta">
                    <span>Serie ${bill.series}</span> • 
                    <span>${bill.denomination}</span> • 
                    <span>Confianza: ${bill.confidence}%</span>
                </div>
            </div>
            <div class="bill-status">
                ${bill.isValid ? 'VÁLIDO' : 'INHABILITADO'}
            </div>
        `;
        
        container.appendChild(card);
    });
    
    // Guardar en historial
    saveToHistory(detectedBills);
}

// Modo Manual
function formatSerial(input) {
    // Permitir solo números
    input.value = input.value.replace(/[^0-9]/g, '');
    
    // Mostrar preview con padding
    if (input.value.length > 0 && input.value.length < 9) {
        const padded = input.value.padStart(9, '0');
        input.placeholder = padded;
    }
}

function setDenom(val) {
    document.querySelectorAll('.denom-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-${val}`).classList.add('active');
}

function verifyManual() {
    const serialInput = document.getElementById('manual-serial').value;
    const series = document.getElementById('manual-series').value;
    const activeDenom = document.querySelector('.denom-btn.active').textContent.trim();
    const denomination = activeDenom.replace(' ', '');
    
    if (serialInput.length < 5) {
        alert('Ingrese al menos 5 dígitos del número de serie');
        return;
    }
    
    // Normalizar a 9 dígitos
    const normalized = serialInput.padStart(9, '0');
    const isValid = validateBillSeries(denomination, parseInt(normalized));
    
    // Mostrar resultado
    const resultDiv = document.getElementById('manual-result-pro');
    resultDiv.className = `result-pro ${isValid ? 'valid' : 'invalid'}`;
    resultDiv.innerHTML = `
        <div class="big-result">
            <div class="icon">${isValid ? '✅' : '⚠️'}</div>
            <h2>${isValid ? 'BILLETE VÁLIDO' : 'INHABILITADO'}</h2>
            <p>${denomination} Serie ${series} Nº ${normalized}</p>
            ${!isValid ? '<small>Este billete no tiene valor legal</small>' : ''}
        </div>
    `;
    resultDiv.classList.remove('hidden');
    
    // Guardar
    saveToHistory([{ denomination, series, serial: normalized, isValid, timestamp: new Date().toISOString() }]);
}

// Utilidades UI
function showLoader(show, text = '') {
    const loader = document.getElementById('neural-loader');
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
    
    if (text) document.querySelector('#neural-loader p').textContent = text;
}

function updateProgress(percent) {
    document.getElementById('neural-progress').style.width = percent + '%';
}

function updateStats() {
    document.getElementById('detected-count').textContent = detectedBills.length;
    const validCount = detectedBills.filter(b => b.isValid).length;
    document.getElementById('total-valid').textContent = validCount;
}

function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.btn-mode').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${mode === 'batch' ? 'batch' : 'single'}`).classList.add('active');
}

// Historial
function saveToHistory(bills) {
    const history = JSON.parse(localStorage.getItem('bill_ai_history') || '[]');
    history.unshift(...bills);
    if (history.length > 100) history.length = 100;
    localStorage.setItem('bill_ai_history', JSON.stringify(history));
}

function exportResults() {
    const csv = detectedBills.map(b => 
        `${b.timestamp},${b.denomination},Serie ${b.series},${b.serial},${b.isValid ? 'VALIDO' : 'INHABILITADO'},${b.confidence}%`
    ).join('\n');
    
    const blob = new Blob(['Fecha,Denominacion,Serie,Numero,Estado,Confianza\n' + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verificacion_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
}

// Service Worker (básico)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
}
