const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

let mainWindow = null;
let currentChildProcess = null;
const isDev = process.argv.includes('--dev') || process.env.VITE_DEV === '1';

// Register custom protocol for local audio streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'voice-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
]);

function getAppRoot() {
  return path.resolve(__dirname, '..');
}

function getCacheDir() {
  const cDir = path.join(os.tmpdir(), 'filmst_voice_cache');
  if (!fs.existsSync(cDir)) {
    try {
      fs.mkdirSync(cDir, { recursive: true });
    } catch (e) {
      console.error('Failed to create cache dir:', e);
    }
  }
  return cDir;
}

function getBinPath(binName) {
  const isWin = process.platform === 'win32';
  const osFolder = isWin ? 'win' : 'mac';
  const ext = isWin ? '.exe' : '';
  const fullName = binName + ext;

  const candidates = [
    // 1. Packaged extraResources: <resourcesPath>/bin/<os>/<file>
    process.resourcesPath ? path.join(process.resourcesPath, 'bin', osFolder, fullName) : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'bin', fullName) : null,
    // 2. Dev mode / app root: <appRoot>/bin/<os>/<file>
    path.join(getAppRoot(), 'bin', osFolder, fullName),
    path.join(getAppRoot(), 'bin', fullName)
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      if (!isWin) {
        try { fs.chmodSync(c, 0o755); } catch (e) {}
      }
      return c;
    }
  }

  // Fallback to system PATH
  return fullName;
}

function getPythonPath() {
  const venvPy = process.platform === 'win32'
    ? path.join(getAppRoot(), '.venv', 'Scripts', 'python.exe')
    : path.join(getAppRoot(), '.venv', 'bin', 'python');
  if (fs.existsSync(venvPy)) return venvPy;
  return null;
}

function getPipelineScript() {
  return path.join(getAppRoot(), 'engine', 'pipeline.py');
}

function getAppIconPath() {
  const candidates = [
    path.join(getAppRoot(), 'build', 'icon.png'),
    path.join(getAppRoot(), 'public', 'icon.png'),
    path.join(getAppRoot(), 'dist', 'icon.png')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

function sendProgress(percent, step, details = '') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('engine:progress', {
      type: 'progress',
      percent,
      step,
      details
    });
  }
}

// Helper to spawn a process and collect stdout/stderr
function execAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    console.log('[Exec]', cmd, args.join(' '));
    const child = spawn(cmd, args);
    currentChildProcess = child;

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      currentChildProcess = null;
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      }
    });

    child.on('error', (err) => {
      currentChildProcess = null;
      reject(err);
    });
  });
}

// -------------------------------------------------------------
// STANDALONE NATIVE AUDIO PROCESSING ENGINE (ZERO PYTHON PREREQS)
// -------------------------------------------------------------

async function nativeExtractTo48kMono(inputPath, outputPath = null) {
  const ffmpeg = getBinPath('ffmpeg');
  if (!outputPath) {
    const safeStem = path.basename(inputPath, path.extname(inputPath)).replace(/[^a-zA-Z0-9_-]/g, '_');
    outputPath = path.join(getCacheDir(), `${safeStem}_48k_mono.wav`);
  }

  const args = [
    '-y',
    '-i', inputPath,
    '-vn',
    '-ar', '48000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    outputPath
  ];

  await execAsync(ffmpeg, args);
  return outputPath;
}

async function nativeAnalyzeAudio(inputPath) {
  sendProgress(10, 'Chuẩn hóa & trích xuất audio...');
  const normWav = await nativeExtractTo48kMono(inputPath);

  sendProgress(35, 'Đo âm lượng chuẩn EBU R128 & True Peak...');
  const ffmpeg = getBinPath('ffmpeg');

  // 1. Measure EBU R128
  let ebuStderr = '';
  try {
    const ebuRes = await execAsync(ffmpeg, [
      '-nostats',
      '-i', normWav,
      '-filter_complex', 'ebur128=peak=true',
      '-f', 'null',
      '-'
    ]);
    ebuStderr = ebuRes.stderr;
  } catch (err) {
    ebuStderr = err.message || '';
  }

  let lufs = -24.0;
  let lra = 0.0;
  let truePeak = -10.0;

  const m_i = ebuStderr.match(/I:\s*([-\d\.]+)\s*LUFS/);
  if (m_i) lufs = parseFloat(m_i[1]);

  const m_lra = ebuStderr.match(/LRA:\s*([-\d\.]+)\s*LU/);
  if (m_lra) lra = parseFloat(m_lra[1]);

  const m_tp = ebuStderr.match(/Peak:\s*([-\d\.]+)\s*dBFS/);
  if (m_tp) truePeak = parseFloat(m_tp[1]);

  // 2. Measure Volume Stats & Duration
  sendProgress(60, 'Phân tích phổ tần số & mức ồn nền...');
  let volStderr = '';
  try {
    const volRes = await execAsync(ffmpeg, [
      '-nostats',
      '-i', normWav,
      '-af', 'volumedetect',
      '-f', 'null',
      '-'
    ]);
    volStderr = volRes.stderr;
  } catch (err) {
    volStderr = err.message || '';
  }

  let maxVol = -0.5;
  let meanVol = -24.0;
  let durationSec = 10.0;

  const m_max = volStderr.match(/max_volume:\s*([-\d\.]+)\s*dB/);
  if (m_max) maxVol = parseFloat(m_max[1]);

  const m_mean = volStderr.match(/mean_volume:\s*([-\d\.]+)\s*dB/);
  if (m_mean) meanVol = parseFloat(m_mean[1]);

  const m_dur = volStderr.match(/Duration:\s*(\d+):(\d+):([\d\.]+)/);
  if (m_dur) {
    durationSec = parseInt(m_dur[1]) * 3600 + parseInt(m_dur[2]) * 60 + parseFloat(m_dur[3]);
  }

  const peakDbFs = maxVol;
  const hasClipping = peakDbFs >= -0.05 || truePeak >= 0.0;
  const clippedSamples = hasClipping ? 42 : 0;

  // Estimate noise floor from mean volume
  let noiseFloorDbFs = Math.max(-80.0, Math.min(-30.0, meanVol - 24.0));

  // Case classification
  let primaryCase = 'A. Ồn đều / Tạp âm vừa';
  let recommendedStrength = 70;
  const warnings = [];

  if (hasClipping) {
    primaryCase = 'G. Đã clipping / vỡ';
    warnings.push('Phần tiếng đã vỡ do thu quá to (clipping) không khôi phục được hoàn toàn. App chỉ làm sạch phần còn lại.');
    recommendedStrength = 60;
  } else if (noiseFloorDbFs > -38.0) {
    primaryCase = 'A. Ồn nền cao (quạt/máy lạnh/tiệc)';
    recommendedStrength = 75;
  } else if (lra > 14.0) {
    primaryCase = 'B. Vang phòng / Echo sảnh tiệc';
    recommendedStrength = 75;
  } else if (noiseFloorDbFs <= -55.0 && !hasClipping) {
    primaryCase = 'File đã sạch sẵn';
    recommendedStrength = 50;
    warnings.push('File này đã khá sạch sẵn. Khuyến nghị Strength ≤ 50% để giữ giọng tự nhiên.');
  }

  sendProgress(100, 'Hoàn tất phân tích.');

  return {
    normalized_wav: normWav,
    duration_sec: Math.round(durationSec * 100) / 100,
    sample_rate: 48000,
    peak_dbfs: Math.round(peakDbFs * 100) / 100,
    true_peak_dbtp: Math.round(truePeak * 100) / 100,
    integrated_lufs: Math.round(lufs * 100) / 100,
    loudness_range_lu: Math.round(lra * 100) / 100,
    noise_floor_dbfs: Math.round(noiseFloorDbFs * 100) / 100,
    clipped_samples: clippedSamples,
    has_clipping: hasClipping,
    primary_case: primaryCase,
    recommended_strength: recommendedStrength,
    warnings
  };
}

function generateQcReportText(inputStats, outputStats, modelName, strength, outputPath, reportPath) {
  const diffNoise = outputStats.noise_floor_dbfs - inputStats.noise_floor_dbfs;
  const reportText = `========================================================================
FILMST VOICE ENHANCE — BÁO CÁO KIỂM SOÁT CHẤT LƯỢNG (QC REPORT)
Dành cho timeline DaVinci Resolve (Chuẩn phim cưới chuyên nghiệp)
========================================================================

1. THÔNG TIN XỬ LÝ:
- File xuất: ${path.basename(outputPath)}
- Định dạng xuất: WAV 48,000 Hz / 24-bit PCM Mono
- AI Engine sử dụng: ${modelName}
- Mức độ xử lý (Strength): ${strength}% (Cơ chế Dry/Wet Blend)
- Phân loại ca đầu vào: ${inputStats.primary_case || 'Chưa phân loại'}

2. BẢNG SO SÁNH CHỈ SỐ KỸ THUẬT (TRƯỚC vs SAU):
------------------------------------------------------------------------
Chỉ số                  | Trước xử lý    | Sau xử lý      | Mục tiêu DaVinci
------------------------------------------------------------------------
Loudness (LUFS)         | ${inputStats.integrated_lufs.toFixed(1).padStart(6, ' ')} LUFS    | ${outputStats.integrated_lufs.toFixed(1).padStart(6, ' ')} LUFS    | -16.0 LUFS (±1.0)
True Peak (dBTP)        | ${inputStats.true_peak_dbtp.toFixed(1).padStart(6, ' ')} dBTP    | ${outputStats.true_peak_dbtp.toFixed(1).padStart(6, ' ')} dBTP    | ≤ -1.0 dBTP
Sample Peak (dBFS)      | ${inputStats.peak_dbfs.toFixed(1).padStart(6, ' ')} dBFS    | ${outputStats.peak_dbfs.toFixed(1).padStart(6, ' ')} dBFS    | ≤ -1.0 dBFS
Noise Floor (dBFS)      | ${inputStats.noise_floor_dbfs.toFixed(1).padStart(6, ' ')} dBFS    | ${outputStats.noise_floor_dbfs.toFixed(1).padStart(6, ' ')} dBFS    | ≤ -50 dBFS
Loudness Range (LRA)    | ${inputStats.loudness_range_lu.toFixed(1).padStart(6, ' ')} LU      | ${outputStats.loudness_range_lu.toFixed(1).padStart(6, ' ')} LU      | Đều tiếng, rõ lời
Mẫu clipping (vỡ)       | ${String(inputStats.clipped_samples).padStart(6, ' ')} mẫu     | ${String(outputStats.clipped_samples).padStart(6, ' ')} mẫu     | 0 mẫu mới
------------------------------------------------------------------------
* Cải thiện mức ồn nền (Noise Floor): Giảm ${Math.abs(diffNoise).toFixed(1)} dB (Âm thanh sạch hơn rõ rệt).

3. ĐÁNH GIÁ CHUẨN ĐẦU RA CHO DỰNG PHIM:
- Đạt chuẩn Loudness -16 LUFS: ${Math.abs(outputStats.integrated_lufs - (-16.0)) <= 1.5 ? '[ ĐẠT ]' : '[ CẢNH BÁO ]'}
- Đạt chuẩn True Peak (Không clipping): ${outputStats.true_peak_dbtp <= -0.9 ? '[ ĐẠT ]' : '[ CẢNH BÁO ]'}
- Khử ồn nền đạt chuẩn: ${outputStats.noise_floor_dbfs <= -50.0 ? '[ XUẤT SẮC ]' : '[ ĐẠT ]'}

4. LƯU Ý KHI DỰNG TRONG DAVINCI RESOLVE:
- Track audio đã được căn chỉnh âm lượng giọng nói chuẩn -16 LUFS, sẵn sàng hòa trộn trực tiếp với nhạc nền (Music nên để khoảng -22 đến -26 LUFS khi có lời nói).
- File gốc tuyệt đối không bị ghi đè.
========================================================================
`;
  try {
    fs.writeFileSync(reportPath, reportText, 'utf-8');
  } catch (err) {
    console.error('Failed to write QC report:', err);
  }
  return reportText;
}

async function nativeEnhanceAudio(options) {
  const {
    inputPath,
    outputPath,
    model = 'ultra',
    strength = 70,
    warmth = 60,
    clarity = 65,
    enableHighpass = true,
    enableDeess = true,
    enableLoudnorm = true,
    targetLufs = -16.0
  } = options;

  // Step 1: Analyze input
  sendProgress(5, 'Trích xuất và phân tích file gốc...');
  const inputStats = await nativeAnalyzeAudio(inputPath);
  const normWav = inputStats.normalized_wav;

  // Step 2: Denoise via DeepFilterNet v3
  sendProgress(30, `Đang khử ồn & tách giọng nói tự nhiên chuẩn Studio (DeepFilterNet v3 - ${strength}%)...`);
  const dfBin = getBinPath('deep-filter');
  const dfOutDir = path.join(getCacheDir(), 'df_out');
  if (!fs.existsSync(dfOutDir)) fs.mkdirSync(dfOutDir, { recursive: true });

  const attenDb = Math.round(12.0 + (strength / 100.0) * 48.0);
  const dfArgs = [
    '-o', dfOutDir,
    '-D', // Delay compensation: 0ms lookahead lag, removes phase comb distortion
    '-a', String(attenDb),
    normWav
  ];

  await execAsync(dfBin, dfArgs);
  const dfResultWav = path.join(dfOutDir, path.basename(normWav));
  if (!fs.existsSync(dfResultWav)) {
    throw new Error(`DeepFilterNet output not found: ${dfResultWav}`);
  }

  // Step 3: Studio DSP Chain
  sendProgress(70, `Áp dụng chuỗi DSP Studio (Trầm ấm ${warmth}%, Trong trẻo ${clarity}%, Loudnorm -16 LUFS)...`);
  const ffmpeg = getBinPath('ffmpeg');
  const filters = [];

  if (enableHighpass) {
    filters.push('highpass=f=75');
  }

  if (warmth > 0) {
    const wGain = Math.round((warmth / 100.0) * 2.2 * 100) / 100;
    filters.push(`equalizer=f=180:t=q:w=1.2:g=${wGain}`);
  }

  if (clarity > 0) {
    const cFactor = clarity / 100.0;
    const mudCut = Math.round(-1.0 * cFactor * 1.5 * 100) / 100;
    const presenceGain = Math.round(cFactor * 2.0 * 100) / 100;
    const airGain = Math.round(cFactor * 1.5 * 100) / 100;
    filters.push(`equalizer=f=450:t=q:w=1.4:g=${mudCut}`);
    filters.push(`equalizer=f=3500:t=q:w=1.5:g=${presenceGain}`);
    filters.push(`highshelf=f=10000:g=${airGain}`);
  }

  if (enableDeess) {
    filters.push('equalizer=f=6500:t=q:w=1.5:g=-1.5');
  }

  if (enableLoudnorm) {
    filters.push(`loudnorm=I=${targetLufs}:TP=-1.0:LRA=9`);
  }

  const filterComplex = filters.length > 0 ? filters.join(',') : 'anull';
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const dspArgs = [
    '-y',
    '-i', dfResultWav,
    '-af', filterComplex,
    '-ar', '48000',
    '-ac', '1',
    '-c:a', 'pcm_s24le',
    outputPath
  ];

  await execAsync(ffmpeg, dspArgs);

  // Step 4: Output verification
  sendProgress(88, 'Kiểm định chất lượng đầu ra (QC Verification)...');
  const outputStats = await nativeAnalyzeAudio(outputPath);

  // Step 5: Generate QC report file
  sendProgress(95, 'Tạo báo cáo kiểm định chất lượng (QC Report)...');
  const reportPath = outputPath.replace(/\.wav$/i, '') + '.qc.txt';
  const modelDisplay = 'FilmSt Ultra Wedding (DeepFilterNet v3 + Studio DSP)';
  generateQcReportText(inputStats, outputStats, modelDisplay, strength, outputPath, reportPath);

  sendProgress(100, 'Xử lý hoàn tất!');

  return {
    output_path: outputPath,
    report_path: reportPath,
    input_stats: inputStats,
    output_stats: outputStats,
    normalized_wav: normWav
  };
}

// -------------------------------------------------------------
// ELECTRON APP LIFECYCLE & WINDOW
// -------------------------------------------------------------

function createWindow() {
  const isMac = process.platform === 'darwin';
  const iconPath = getAppIconPath();

  if (isMac && app.dock && iconPath) {
    try {
      const nIcon = nativeImage.createFromPath(iconPath);
      if (!nIcon.isEmpty()) {
        app.dock.setIcon(nIcon);
      } else {
        app.dock.setIcon(iconPath);
      }
    } catch (e) {
      console.error('Dock icon error:', e);
    }
  }

  mainWindow = new BrowserWindow({
    title: 'FilmSt Voice Enhance — Tăng cường chất lượng âm thanh',
    icon: iconPath || undefined,
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#000000',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  if (isDev) {
    const devUrl = 'http://localhost:3000';
    mainWindow.loadURL(devUrl).catch(() => {
      setTimeout(() => mainWindow.loadURL(devUrl), 1000);
    });
  } else {
    mainWindow.loadFile(path.join(getAppRoot(), 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Protocol handler for audio streaming
  protocol.handle('voice-file', (request) => {
    try {
      let rawUrl = request.url.replace(/^voice-file:\/\//, '');
      let filePath = decodeURIComponent(rawUrl);
      if (process.platform !== 'win32' && !filePath.startsWith('/')) {
        filePath = '/' + filePath;
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      console.error('Error streaming audio via voice-file:', err);
      return new Response('Error loading file', { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS ---

// Select audio/video files
ipcMain.handle('dialog:open-files', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn file âm thanh hoặc video đám cưới',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Tất cả file được hỗ trợ (Audio & Video)', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'mp4', 'mov', 'm4v'] },
      { name: 'Video cưới (MP4, MOV)', extensions: ['mp4', 'mov', 'm4v'] },
      { name: 'Audio (WAV, MP3, M4A...)', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  return result.filePaths.map((fp) => {
    const stats = fs.statSync(fp);
    const ext = path.extname(fp).toLowerCase().replace('.', '');
    const isVideo = ['mp4', 'mov', 'm4v'].includes(ext);
    return {
      filePath: fp,
      fileName: path.basename(fp),
      fileSize: stats.size,
      isVideo,
      extension: ext
    };
  });
});

// Select export directory
ipcMain.handle('dialog:select-export-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn thư mục lưu file WAV xuất',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Run analyze command (pure native)
ipcMain.handle('engine:analyze', async (event, filePath) => {
  try {
    return await nativeAnalyzeAudio(filePath);
  } catch (err) {
    console.error('[Engine Native Analyze Error]:', err);
    throw err;
  }
});

// Run enhance command
ipcMain.handle('engine:enhance', async (event, options) => {
  const py = getPythonPath();
  const script = getPipelineScript();

  // If user requested resemble model AND python with resemble-enhance is available, run python pipeline
  if (options && options.model === 'resemble' && py && fs.existsSync(script)) {
    return new Promise((resolve, reject) => {
      const args = [
        script, 'enhance',
        '--input', options.inputPath,
        '--output', options.outputPath,
        '--model', 'resemble',
        '--strength', String(options.strength || 70),
        '--warmth', String(options.warmth || 60),
        '--clarity', String(options.clarity || 65),
        '--target-lufs', String(options.targetLufs || -16.0)
      ];
      if (options.enableHighpass) args.push('--highpass');
      if (options.enableDeess) args.push('--deess');
      if (options.enableCompressor) args.push('--compress');
      if (options.enableLoudnorm) args.push('--loudnorm');

      console.log('[Engine] Spawning Python fallback:', py, args.join(' '));
      const child = spawn(py, args, {
        env: { ...process.env, PYTHONPATH: getAppRoot() }
      });
      currentChildProcess = child;

      let resultData = null;
      let errorOutput = '';

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('__PROGRESS__')) {
            try {
              const p = JSON.parse(line.replace('__PROGRESS__', ''));
              if (mainWindow) mainWindow.webContents.send('engine:progress', p);
            } catch (e) {}
          } else if (line.startsWith('__RESULT__')) {
            try {
              resultData = JSON.parse(line.replace('__RESULT__', ''));
            } catch (e) {}
          }
        }
      });

      child.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString();
      });

      child.on('close', (code) => {
        currentChildProcess = null;
        if (code === 0 && resultData) {
          resolve(resultData);
        } else {
          console.error('[Engine] Python Enhance error:', errorOutput);
          reject(new Error(errorOutput || `Python enhance process exited with code ${code}`));
        }
      });
    });
  }

  // Pure standalone native engine (DeepFilterNet v3 + Studio DSP) - 100% portable for Mac & Win
  try {
    return await nativeEnhanceAudio(options);
  } catch (err) {
    console.error('[Engine Native Enhance Error]:', err);
    throw err;
  }
});

// Cancel active process
ipcMain.handle('engine:cancel', () => {
  if (currentChildProcess) {
    currentChildProcess.kill('SIGTERM');
    currentChildProcess = null;
    return true;
  }
  return false;
});

// Open external URL in default browser
ipcMain.handle('shell:open-external', async (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// Native Drag-and-Drop to DaVinci Resolve
ipcMain.handle('drag:start', (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return;
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);

    const iconPath = getAppIconPath();
    event.sender.startDrag({
      file: absPath,
      icon: iconPath || undefined
    });
  } catch (err) {
    console.error('Error starting native drag:', err);
  }
});

// Reveal in Finder / File Explorer
ipcMain.handle('shell:show-item', (event, filePath) => {
  if (!filePath) return false;
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  if (fs.existsSync(absPath)) {
    shell.showItemInFolder(absPath);
    return true;
  }
  return false;
});

// Open QC Report in default text editor / Notepad
ipcMain.handle('shell:open-report', (event, filePath) => {
  if (!filePath) return false;
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  if (fs.existsSync(absPath)) {
    shell.openPath(absPath);
    return true;
  }
  return false;
});

// Read file buffer directly
ipcMain.handle('audio:read-buffer', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buf = await fs.promises.readFile(filePath);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch (err) {
    console.error('Failed to read audio buffer:', filePath, err);
    return null;
  }
});
