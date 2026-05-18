// ===== CrispScale — AI Image Upscaler =====
// Frontend — talks to local proxy server to avoid CORS

const POLL_INTERVAL = 3000;
const MAX_POLLS = 60;

// ===== DOM Elements =====
const $ = (id) => document.getElementById(id);
const dropZone = $('drop-zone');
const fileInput = $('file-input');
const browseBtn = $('browse-btn');
const uploadSection = $('upload-section');
const heroSection = $('hero-section');
const previewSection = $('preview-section');
const originalImage = $('original-image');
const originalDims = $('original-dims');
const fileInfo = $('file-info');
const upscaleBtn = $('upscale-btn');
const resultImage = $('result-image');
const resultDims = $('result-dims');
const resultPlaceholder = $('result-placeholder');
const downloadBtn = $('download-btn');
const newUploadBtn = $('new-upload-btn');
const processingIndicator = $('processing-indicator');
const processingText = $('processing-text');
const errorToast = $('error-toast');
const errorMessage = $('error-message');
const successToast = $('success-toast');
const successMessage = $('success-message');
const apiModal = $('api-modal');
const apiKeyBtn = $('api-key-btn');
const apiKeyInput = $('api-key-input');
const saveApiKeyBtn = $('save-api-key');
const modalCloseBtn = $('modal-close');
const toggleVisibility = $('toggle-visibility');
const historyBtn = $('history-btn');
const historyPanel = $('history-panel');
const historyClose = $('history-close');
const historyList = $('history-list');

let currentFile = null;
let currentImageUrl = null;

// ===== Toast Notifications =====
function showError(msg) {
    errorMessage.textContent = msg;
    errorToast.classList.remove('hidden');
    setTimeout(() => errorToast.classList.add('hidden'), 5000);
}

function showSuccess(msg) {
    successMessage.textContent = msg;
    successToast.classList.remove('hidden');
    setTimeout(() => successToast.classList.add('hidden'), 4000);
}

// ===== File Handling =====
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function handleFile(file) {
    if (!file) return;
    const valid = ['image/png', 'image/jpeg', 'image/webp'];
    if (!valid.includes(file.type)) {
        showError('Please upload a PNG, JPG, or WEBP image');
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        showError('File size must be under 20MB');
        return;
    }
    currentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            originalImage.src = e.target.result;
            originalDims.textContent = `${img.width} × ${img.height}`;
            fileInfo.textContent = `${file.name} • ${formatBytes(file.size)}`;
            showPreview();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function showPreview() {
    heroSection.classList.add('hidden');
    uploadSection.classList.add('hidden');
    previewSection.classList.remove('hidden');
    resultImage.classList.add('hidden');
    resultPlaceholder.classList.remove('hidden');
    downloadBtn.classList.add('hidden');
    newUploadBtn.classList.add('hidden');
    resultDims.textContent = '';
    upscaleBtn.disabled = false;
}

function resetToUpload() {
    heroSection.classList.remove('hidden');
    uploadSection.classList.remove('hidden');
    previewSection.classList.add('hidden');
    currentFile = null;
    currentImageUrl = null;
    fileInput.value = '';
}

// ===== Step Indicators =====
function setStep(stepName, state) {
    const el = $(`step-${stepName}`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (state) el.classList.add(state);
}

// ===== Upscale Process =====
async function startUpscale() {
    if (!currentFile) return;

    upscaleBtn.disabled = true;
    processingIndicator.classList.remove('hidden');
    processingText.textContent = 'Uploading image...';
    setStep('upload', 'active');
    setStep('process', '');
    setStep('complete', '');

    try {
        // Step 1: Upload file to server proxy
        const formData = new FormData();
        formData.append('file', currentFile);

        const uploadResp = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const uploadData = await uploadResp.json();

        if (!uploadData.success || !uploadData.url) {
            throw new Error(uploadData.error || 'Failed to upload image');
        }

        const imageUrl = uploadData.url;
        setStep('upload', 'done');
        setStep('process', 'active');
        processingText.textContent = 'Creating upscale task...';

        // Step 2: Create upscale task via proxy
        const createResp = await fetch('/api/upscale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl })
        });
        const createData = await createResp.json();

        if (createData.code !== 200 || !createData.data?.taskId) {
            throw new Error(createData.msg || createData.message || createData.error || 'Failed to create task');
        }

        const taskId = createData.data.taskId;
        processingText.textContent = 'Processing upscale...';

        // Step 3: Poll for result via proxy
        const result = await pollForResult(taskId);

        setStep('process', 'done');
        setStep('complete', 'done');
        processingText.textContent = 'Complete!';

        // Display result
        displayResult(result);
        saveToHistory(currentFile.name, result);
        showSuccess('Image upscaled successfully!');

    } catch (err) {
        console.error('Upscale error:', err);
        showError(err.message || 'Upscale failed. Please try again.');
        upscaleBtn.disabled = false;
    } finally {
        setTimeout(() => {
            processingIndicator.classList.add('hidden');
        }, 1500);
    }
}

async function pollForResult(taskId) {
    for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_INTERVAL);

        const resp = await fetch(`/api/status?taskId=${taskId}`);
        const data = await resp.json();

        if (data.code !== 200) {
            throw new Error(data.msg || data.error || 'Failed to check task status');
        }

        const task = data.data;
        const state = (task.state || '').toLowerCase();

        if (state === 'success' || state === 'completed') {
            let resultUrls = [];

            if (task.resultJson) {
                try {
                    const parsed = typeof task.resultJson === 'string'
                        ? JSON.parse(task.resultJson) : task.resultJson;

                    if (Array.isArray(parsed)) resultUrls = parsed;
                    else if (parsed.resultUrls) resultUrls = parsed.resultUrls;
                    else if (parsed.result_urls) resultUrls = parsed.result_urls;
                    else if (parsed.urls) resultUrls = parsed.urls;
                    else if (parsed.url) resultUrls = [parsed.url];
                    else if (parsed.resultUrl) resultUrls = [parsed.resultUrl];
                    else if (parsed.output) resultUrls = [parsed.output];
                    else if (parsed.image) resultUrls = [parsed.image];
                } catch (e) {
                    if (typeof task.resultJson === 'string' && task.resultJson.startsWith('http')) {
                        resultUrls = [task.resultJson];
                    }
                }
            }

            if (resultUrls.length === 0) {
                if (task.resultUrl) resultUrls = [task.resultUrl];
                else if (task.output_url) resultUrls = [task.output_url];
                else if (task.result && typeof task.result === 'string' && task.result.startsWith('http'))
                    resultUrls = [task.result];
            }

            if (resultUrls.length === 0) {
                console.log('Full task response:', JSON.stringify(task));
                throw new Error('No result URL found in response');
            }
            return resultUrls[0];
        }

        if (state === 'failed' || state === 'fail' || state === 'error') {
            throw new Error(task.failMsg || task.fail_msg || 'Upscale task failed');
        }

        const elapsed = (i + 1) * POLL_INTERVAL / 1000;
        processingText.textContent = `Processing... (${Math.round(elapsed)}s)`;
    }

    throw new Error('Upscale timed out. Please try again.');
}

function displayResult(imageUrl) {
    currentImageUrl = imageUrl;
    resultImage.src = imageUrl;
    resultImage.classList.remove('hidden');
    resultPlaceholder.classList.add('hidden');
    downloadBtn.classList.remove('hidden');
    newUploadBtn.classList.remove('hidden');

    resultImage.onload = () => {
        resultDims.textContent = `${resultImage.naturalWidth} × ${resultImage.naturalHeight}`;
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== Download =====
async function downloadResult() {
    if (!currentImageUrl) return;
    try {
        const resp = await fetch(currentImageUrl);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
        a.download = `upscaled_${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch {
        window.open(currentImageUrl, '_blank');
    }
}

// ===== History =====
function getHistory() {
    try { return JSON.parse(localStorage.getItem('upscale_history') || '[]'); }
    catch { return []; }
}

function saveToHistory(name, resultUrl) {
    const history = getHistory();
    history.unshift({ name, resultUrl, date: new Date().toISOString() });
    if (history.length > 20) history.length = 20;
    localStorage.setItem('upscale_history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const history = getHistory();
    if (history.length === 0) {
        historyList.innerHTML = `
            <div class="history-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                    <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
                </svg>
                <span>No upscales yet</span>
            </div>`;
        return;
    }
    historyList.innerHTML = history.map((item, i) => `
        <div class="history-item" data-url="${item.resultUrl}" data-index="${i}">
            <img class="history-thumb" src="${item.resultUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
            <div class="history-info">
                <div class="history-name">${item.name}</div>
                <div class="history-date">${new Date(item.date).toLocaleString()}</div>
            </div>
        </div>`).join('');

    historyList.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', () => {
            const url = el.dataset.url;
            if (url) window.open(url, '_blank');
        });
    });
}

// ===== Event Listeners =====
dropZone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
});

// Clipboard paste support
document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) { handleFile(item.getAsFile()); break; }
    }
});

upscaleBtn.addEventListener('click', startUpscale);
downloadBtn.addEventListener('click', downloadResult);
newUploadBtn.addEventListener('click', resetToUpload);

// API Key Modal (optional override)
apiKeyBtn.addEventListener('click', () => {
    apiKeyInput.value = localStorage.getItem('kie_api_key') || '';
    apiModal.classList.remove('hidden');
});
modalCloseBtn.addEventListener('click', () => apiModal.classList.add('hidden'));
apiModal.addEventListener('click', (e) => { if (e.target === apiModal) apiModal.classList.add('hidden'); });
saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) localStorage.setItem('kie_api_key', key);
    apiModal.classList.add('hidden');
    showSuccess('API key saved (restart server to apply)');
});
toggleVisibility.addEventListener('click', () => {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

// History Panel
historyBtn.addEventListener('click', () => {
    renderHistory();
    historyPanel.classList.remove('hidden');
    requestAnimationFrame(() => historyPanel.classList.add('show'));
});
historyClose.addEventListener('click', () => {
    historyPanel.classList.remove('show');
    setTimeout(() => historyPanel.classList.add('hidden'), 300);
});

// Init
renderHistory();
