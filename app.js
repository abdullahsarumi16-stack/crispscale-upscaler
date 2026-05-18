// ===== CrispScale — Batch AI Image Upscaler =====
const POLL_INTERVAL = 3000;
const MAX_POLLS = 60;

const $ = (id) => document.getElementById(id);
const dropZone = $('drop-zone');
const fileInput = $('file-input');
const addMoreInput = $('add-more-input');
const browseBtn = $('browse-btn');
const uploadSection = $('upload-section');
const queueSection = $('queue-section');
const imageGrid = $('image-grid');
const upscaleAllBtn = $('upscale-all-btn');
const addMoreBtn = $('add-more-btn');
const downloadAllBtn = $('download-all-btn');
const clearBtn = $('clear-btn');
const queueCount = $('queue-count');
const queueStatus = $('queue-status');
const queueText = $('queue-text');
const errorToast = $('error-toast');
const errorMessage = $('error-message');
const successToast = $('success-toast');
const successMessage = $('success-message');

// State
let images = []; // { id, file, previewUrl, status, resultUrl, dims, resultDims, error }
let isProcessing = false;
let idCounter = 0;

// ===== Toast =====
function showError(msg) { errorMessage.textContent = msg; errorToast.classList.remove('hidden'); setTimeout(() => errorToast.classList.add('hidden'), 5000); }
function showSuccess(msg) { successMessage.textContent = msg; successToast.classList.remove('hidden'); setTimeout(() => successToast.classList.add('hidden'), 4000); }

// ===== File Handling =====
function formatBytes(b) { return b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB'; }

function addFiles(files) {
    const valid = ['image/png', 'image/jpeg', 'image/webp'];
    let added = 0;
    for (const file of files) {
        if (!valid.includes(file.type)) { showError(`${file.name}: unsupported format`); continue; }
        if (file.size > 20 * 1024 * 1024) { showError(`${file.name}: exceeds 20MB`); continue; }
        const id = ++idCounter;
        const previewUrl = URL.createObjectURL(file);
        images.push({ id, file, previewUrl, status: 'queued', resultUrl: null, dims: null, resultDims: null, error: null });
        added++;
    }
    if (added > 0) {
        showQueue();
        renderGrid();
    }
}

function removeImage(id) {
    images = images.filter(img => img.id !== id);
    if (images.length === 0) { hideQueue(); }
    else { renderGrid(); }
}

// ===== UI State =====
function showQueue() {
    uploadSection.classList.add('compact');
    queueSection.classList.remove('hidden');
    clearBtn.classList.remove('hidden');
    updateCounts();
}

function hideQueue() {
    uploadSection.classList.remove('compact');
    queueSection.classList.add('hidden');
    clearBtn.classList.add('hidden');
    downloadAllBtn.classList.add('hidden');
    queueStatus.classList.add('hidden');
    images = [];
    renderGrid();
}

function updateCounts() {
    const total = images.length;
    const done = images.filter(i => i.status === 'done').length;
    const failed = images.filter(i => i.status === 'error').length;
    const queued = images.filter(i => i.status === 'queued').length;

    queueCount.textContent = `${total} image${total !== 1 ? 's' : ''} • ${done} done${failed ? ' • ' + failed + ' failed' : ''}`;

    if (done > 0) downloadAllBtn.classList.remove('hidden');
    else downloadAllBtn.classList.add('hidden');

    if (isProcessing) {
        queueStatus.classList.remove('hidden');
        queueText.textContent = `${done} / ${total}`;
    } else {
        queueStatus.classList.add('hidden');
    }

    // Hide/show upscale button based on queue state
    upscaleAllBtn.disabled = isProcessing || queued === 0;
}

// ===== Grid Rendering =====
function renderGrid() {
    imageGrid.innerHTML = images.map(img => {
        const isDone = img.status === 'done';
        const isProc = img.status === 'uploading' || img.status === 'processing';
        const isErr = img.status === 'error';
        const cardClass = isDone ? 'done' : isProc ? 'processing' : isErr ? 'error' : '';
        const displayImg = isDone && img.resultUrl ? img.resultUrl : img.previewUrl;

        return `
        <div class="image-card ${cardClass}" data-id="${img.id}">
            <div class="card-image-container">
                <img src="${displayImg}" alt="${img.file.name}" loading="lazy">
                ${isDone ? '<div class="done-badge">Upscaled</div>' : ''}
                <div class="card-overlay">
                    ${isProc ? '<div class="card-spinner"></div>' : ''}
                    ${isErr ? `<div class="card-error-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>${img.error || 'Failed'}</div>` : ''}
                </div>
            </div>
            <div class="card-info">
                <div class="card-name" title="${img.file.name}">${img.file.name}</div>
                <div class="card-meta">
                    <span class="card-status ${img.status}">${statusLabel(img.status)}</span>
                    <span class="card-dims">${img.resultDims || img.dims || formatBytes(img.file.size)}</span>
                </div>
            </div>
            <div class="card-actions">
                ${isDone ? `
                    <button class="card-btn download" onclick="downloadOne(${img.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</button>
                    <button class="card-btn view" onclick="viewOne(${img.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View</button>
                ` : ''}
                ${isErr ? `<button class="card-btn retry" onclick="retryOne(${img.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Retry</button>` : ''}
                <button class="card-btn remove" onclick="removeImage(${img.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
        </div>`;
    }).join('');
    updateCounts();
}

function statusLabel(s) {
    return { queued: 'Queued', uploading: 'Uploading...', processing: 'Processing...', done: 'Complete', error: 'Failed' }[s] || s;
}

// ===== Upscale All =====
async function upscaleAll() {
    if (isProcessing) return;
    isProcessing = true;
    updateCounts();
    upscaleAllBtn.disabled = true;

    const toProcess = images.filter(i => i.status === 'queued' || i.status === 'error');

    for (const img of toProcess) {
        await upscaleOne(img);
        renderGrid();
    }

    isProcessing = false;
    updateCounts();
    const doneCount = images.filter(i => i.status === 'done').length;
    if (doneCount > 0) showSuccess(`${doneCount} image${doneCount > 1 ? 's' : ''} upscaled!`);
}

async function upscaleOne(img) {
    try {
        // Upload
        img.status = 'uploading';
        renderGrid();

        const formData = new FormData();
        formData.append('file', img.file);
        const uploadResp = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadData = await uploadResp.json();
        if (!uploadData.success || !uploadData.url) throw new Error(uploadData.error || 'Upload failed');

        // Create task
        img.status = 'processing';
        renderGrid();

        const createResp = await fetch('/api/upscale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: uploadData.url })
        });
        const createData = await createResp.json();
        if (createData.code !== 200 || !createData.data?.taskId) throw new Error(createData.msg || createData.error || 'Task creation failed');

        // Poll
        const resultUrl = await pollForResult(createData.data.taskId);
        img.status = 'done';
        img.resultUrl = resultUrl;

        // Get result dimensions
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous';
        tempImg.onload = () => { img.resultDims = `${tempImg.naturalWidth} × ${tempImg.naturalHeight}`; renderGrid(); };
        tempImg.src = resultUrl;

    } catch (err) {
        img.status = 'error';
        img.error = err.message?.substring(0, 50) || 'Failed';
        console.error(`[Error] ${img.file.name}:`, err);
    }
}

async function pollForResult(taskId) {
    for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_INTERVAL);
        const resp = await fetch(`/api/status?taskId=${taskId}`);
        const data = await resp.json();
        if (data.code !== 200) throw new Error(data.msg || data.error || 'Status check failed');

        const task = data.data;
        const state = (task.state || '').toLowerCase();

        if (state === 'success' || state === 'completed') {
            let urls = extractResultUrls(task);
            if (urls.length === 0) throw new Error('No result URL found');
            return urls[0];
        }
        if (state === 'failed' || state === 'fail' || state === 'error') {
            throw new Error(task.failMsg || task.fail_msg || 'Task failed');
        }
    }
    throw new Error('Timed out');
}

function extractResultUrls(task) {
    let urls = [];
    if (task.resultJson) {
        try {
            const p = typeof task.resultJson === 'string' ? JSON.parse(task.resultJson) : task.resultJson;
            if (Array.isArray(p)) urls = p;
            else if (p.resultUrls) urls = p.resultUrls;
            else if (p.result_urls) urls = p.result_urls;
            else if (p.urls) urls = p.urls;
            else if (p.url) urls = [p.url];
            else if (p.resultUrl) urls = [p.resultUrl];
            else if (p.output) urls = [p.output];
            else if (p.image) urls = [p.image];
        } catch { if (typeof task.resultJson === 'string' && task.resultJson.startsWith('http')) urls = [task.resultJson]; }
    }
    if (!urls.length) {
        if (task.resultUrl) urls = [task.resultUrl];
        else if (task.output_url) urls = [task.output_url];
        else if (task.result && typeof task.result === 'string' && task.result.startsWith('http')) urls = [task.result];
    }
    return urls;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== Actions =====
async function downloadOne(id) {
    const img = images.find(i => i.id === id);
    if (!img?.resultUrl) return;
    try {
        const resp = await fetch(img.resultUrl);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
        a.download = `upscaled_${img.file.name.split('.')[0]}.${ext}`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch { window.open(img.resultUrl, '_blank'); }
}

function viewOne(id) {
    const img = images.find(i => i.id === id);
    if (img?.resultUrl) window.open(img.resultUrl, '_blank');
}

async function retryOne(id) {
    const img = images.find(i => i.id === id);
    if (!img) return;
    img.status = 'queued';
    img.error = null;
    renderGrid();
    isProcessing = true;
    updateCounts();
    await upscaleOne(img);
    isProcessing = false;
    renderGrid();
}

async function downloadAll() {
    const doneImages = images.filter(i => i.status === 'done' && i.resultUrl);
    for (const img of doneImages) {
        await downloadOne(img.id);
        await sleep(500); // small delay between downloads
    }
}

// ===== Event Listeners =====
dropZone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', (e) => { addFiles(e.target.files); fileInput.value = ''; });
addMoreInput.addEventListener('change', (e) => { addFiles(e.target.files); addMoreInput.value = ''; });

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); addFiles(e.dataTransfer.files); });

document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) { if (item.type.startsWith('image/')) files.push(item.getAsFile()); }
    if (files.length) addFiles(files);
});

upscaleAllBtn.addEventListener('click', upscaleAll);
addMoreBtn.addEventListener('click', () => addMoreInput.click());
downloadAllBtn.addEventListener('click', downloadAll);
clearBtn.addEventListener('click', hideQueue);

// API Key
$('api-key-btn').addEventListener('click', () => { $('api-key-input').value = localStorage.getItem('kie_api_key') || ''; $('api-modal').classList.remove('hidden'); });
$('modal-close').addEventListener('click', () => $('api-modal').classList.add('hidden'));
$('api-modal').addEventListener('click', (e) => { if (e.target.id === 'api-modal') $('api-modal').classList.add('hidden'); });
$('save-api-key').addEventListener('click', () => {
    const key = $('api-key-input').value.trim();
    if (key) localStorage.setItem('kie_api_key', key);
    $('api-modal').classList.add('hidden');
    showSuccess('API key saved');
});
