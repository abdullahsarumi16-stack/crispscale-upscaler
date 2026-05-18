const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3456;
const API_KEY = '21ec7a6625e2c435b0356d2f905dea73';
const KIE_BASE = 'https://api.kie.ai/api/v1';
const FILE_UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload';

// Serve static files
app.use(express.static(__dirname));
app.use(express.json({ limit: '50mb' }));

// Multer for file uploads (store in memory)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ===== Proxy: Upload file via Base64 to KIE's file hosting =====
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        const base64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        const base64Data = `data:${mimeType};base64,${base64}`;

        console.log(`[Upload] Uploading ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB) via base64...`);

        const uploadResp = await fetch(FILE_UPLOAD_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                base64Data: base64Data,
                uploadPath: 'images/upscaler',
                fileName: req.file.originalname
            })
        });

        const uploadData = await uploadResp.json();
        console.log('[Upload Response]', JSON.stringify(uploadData));

        if (uploadData.code === 200 && uploadData.data) {
            const url = uploadData.data.downloadUrl || uploadData.data.fileUrl || uploadData.data.url;
            if (url) {
                return res.json({ success: true, url });
            }
        }

        // If upload failed, return error
        return res.status(500).json({ error: uploadData.msg || 'File upload failed' });

    } catch (err) {
        console.error('[Upload Error]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ===== Proxy: Create upscale task =====
app.post('/api/upscale', async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) return res.status(400).json({ error: 'No image URL provided' });

        console.log('[Creating Task] Model: recraft/crisp-upscale');
        console.log('[Image URL]', imageUrl.substring(0, 100) + '...');

        const resp = await fetch(`${KIE_BASE}/jobs/createTask`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'recraft/crisp-upscale',
                input: { image: imageUrl }
            })
        });

        const data = await resp.json();
        console.log('[Create Task Response]', JSON.stringify(data));
        res.json(data);

    } catch (err) {
        console.error('[Create Task Error]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ===== Proxy: Check task status =====
app.get('/api/status', async (req, res) => {
    try {
        const { taskId } = req.query;
        if (!taskId) return res.status(400).json({ error: 'No taskId provided' });

        const resp = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        });

        const data = await resp.json();
        const state = data.data?.state || 'unknown';
        console.log('[Status]', taskId, '->', state);

        // Log full response on completion for debugging
        if (state.toLowerCase() === 'success' || state.toLowerCase() === 'completed') {
            console.log('[Full Result]', JSON.stringify(data.data));
        }

        res.json(data);

    } catch (err) {
        console.error('[Status Error]', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║   CrispScale — AI Image Upscaler         ║');
    console.log(`  ║   Running at http://localhost:${PORT}        ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
});
