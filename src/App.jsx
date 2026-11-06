import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  UploadCloud,
  FileAudio,
  Video,
  FolderOpen,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Zap,
  Layers,
  Heart,
  Sun,
  Shield,
  Volume2,
  ExternalLink
} from 'lucide-react';
import WaveformPlayer from './components/WaveformPlayer';
import QCPanel from './components/QCPanel';
import BatchQueue from './components/BatchQueue';

export default function App() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedModel, setSelectedModel] = useState('ultra'); // 'ultra', 'deepfilter', 'resemble'

  // Audio Processing Controls
  const [noiseReduction, setNoiseReduction] = useState(80); // 0-100%
  const [warmth, setWarmth] = useState(65); // 0-100%
  const [clarity, setClarity] = useState(70); // 0-100%

  // DSP Switches
  const [enableHighpass, setEnableHighpass] = useState(true);
  const [enableDeess, setEnableDeess] = useState(true);
  const [enableCompressor, setEnableCompressor] = useState(true);
  const [enableLoudnorm, setEnableLoudnorm] = useState(true);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressInfo, setProgressInfo] = useState({ percent: 0, step: '', details: '' });
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Active item
  const activeItem = items.find((it) => it.id === selectedId) || null;

  // Listen to progress updates from Electron
  useEffect(() => {
    if (window.filmstVoice?.onProgress) {
      const cleanup = window.filmstVoice.onProgress((data) => {
        setProgressInfo(data);
      });
      return cleanup;
    }
  }, []);

  // Handle open files dialog
  const handleOpenFiles = async () => {
    if (!window.filmstVoice?.openFileDialog) return;
    try {
      const files = await window.filmstVoice.openFileDialog();
      if (!files || files.length === 0) return;
      addFilesToQueue(files);
    } catch (err) {
      console.error('Error opening files:', err);
    }
  };

  // Drag and drop files from Finder
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (!droppedFiles || droppedFiles.length === 0) return;

    const formatted = droppedFiles
      .filter((f) => {
        const ext = f.name.split('.').pop().toLowerCase();
        return ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'mp4', 'mov', 'm4v'].includes(ext);
      })
      .map((f) => {
        const ext = f.name.split('.').pop().toLowerCase();
        return {
          filePath: f.path,
          fileName: f.name,
          fileSize: f.size,
          isVideo: ['mp4', 'mov', 'm4v'].includes(ext),
          extension: ext
        };
      });

    if (formatted.length > 0) {
      addFilesToQueue(formatted);
    }
  };

  const addFilesToQueue = (newFiles) => {
    const newItems = newFiles.map((f) => ({
      ...f,
      id: `${f.filePath}-${Date.now()}-${Math.random()}`,
      status: 'pending',
      stats: null,
      enhancedPath: null,
      outputStats: null,
      reportPath: null
    }));

    setItems((prev) => [...prev, ...newItems]);
    if (!selectedId && newItems.length > 0) {
      setSelectedId(newItems[0].id);
      triggerAnalyze(newItems[0]);
    }
  };

  // Trigger analysis for an item
  const triggerAnalyze = async (item) => {
    if (!item || !window.filmstVoice?.analyzeFile) return;

    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: 'analyzing' } : it))
    );

    try {
      const result = await window.filmstVoice.analyzeFile(item.filePath);
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: 'ready',
                stats: result,
                normalizedWav: result.normalized_wav
              }
            : it
        )
      );

      // Auto-set recommended noise reduction
      if (result.recommended_strength) {
        setNoiseReduction(result.recommended_strength);
      }
    } catch (err) {
      console.error('Analyze failed:', err);
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'error', error: err.message } : it))
      );
    }
  };

  // Switch selected item
  const handleSelectItem = (id) => {
    setSelectedId(id);
    const item = items.find((it) => it.id === id);
    if (item && item.status === 'pending') {
      triggerAnalyze(item);
    }
  };

  // Apply quick sound presets
  const applyPreset = (presetName) => {
    if (presetName === 'wedding_standard') {
      setNoiseReduction(80);
      setWarmth(65);
      setClarity(70);
    } else if (presetName === 'warm_rich') {
      setNoiseReduction(75);
      setWarmth(85);
      setClarity(50);
    } else if (presetName === 'bright_clear') {
      setNoiseReduction(85);
      setWarmth(45);
      setClarity(85);
    } else if (presetName === 'rescue_distant') {
      setNoiseReduction(95);
      setWarmth(75);
      setClarity(90);
    }
  };

  // Run 1-Click Enhance
  const handleEnhance = async () => {
    if (!activeItem || isProcessing || !window.filmstVoice?.enhanceFile) return;

    setIsProcessing(true);
    setProgressInfo({ percent: 5, step: 'Khởi động AI Engine...' });

    const lastSlash = Math.max(activeItem.filePath.lastIndexOf('/'), activeItem.filePath.lastIndexOf('\\'));
    const dir = lastSlash !== -1 ? activeItem.filePath.substring(0, lastSlash) : '';
    const sep = activeItem.filePath.includes('\\') ? '\\' : '/';
    const lastDot = activeItem.fileName.lastIndexOf('.');
    const safeStem = lastDot !== -1 ? activeItem.fileName.substring(0, lastDot) : activeItem.fileName;
    const outputPath = dir ? `${dir}${sep}${safeStem}_FilmSt_Enhanced.wav` : `${safeStem}_FilmSt_Enhanced.wav`;

    setItems((prev) =>
      prev.map((it) => (it.id === activeItem.id ? { ...it, status: 'processing' } : it))
    );

    try {
      const result = await window.filmstVoice.enhanceFile({
        inputPath: activeItem.filePath,
        outputPath,
        model: selectedModel,
        strength: noiseReduction,
        warmth,
        clarity,
        enableHighpass,
        enableDeess,
        enableCompressor,
        enableLoudnorm,
        targetLufs: -16.0
      });

      setItems((prev) =>
        prev.map((it) =>
          it.id === activeItem.id
            ? {
                ...it,
                status: 'done',
                enhancedPath: result.output_path,
                normalizedWav: result.normalized_wav || result.input_stats?.normalized_wav || it.normalizedWav,
                outputStats: result.output_stats,
                reportPath: result.report_path
              }
            : it
        )
      );
    } catch (err) {
      console.error('Enhance failed:', err);
      setItems((prev) =>
        prev.map((it) =>
          it.id === activeItem.id ? { ...it, status: 'error', error: err.message } : it
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Cancel processing
  const handleCancel = async () => {
    if (window.filmstVoice?.cancelProcessing) {
      await window.filmstVoice.cancelProcessing();
      setIsProcessing(false);
    }
  };

  // Reveal in Finder
  const handleShowInFinder = (path) => {
    if (path && window.filmstVoice?.showInFinder) {
      window.filmstVoice.showInFinder(path);
    }
  };

  // Open Facebook author profile
  const handleOpenAuthorFacebook = () => {
    if (window.filmstVoice?.openExternal) {
      window.filmstVoice.openExternal('https://www.facebook.com/trinhcamop');
    }
  };

  // Start native drag into DaVinci Resolve
  const handleDragStart = (e, filePath) => {
    if (filePath && window.filmstVoice?.startDrag) {
      e.preventDefault();
      window.filmstVoice.startDrag(filePath);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
      className={`h-screen w-screen flex flex-col bg-[#000000] text-[#f5f5f7] select-none font-sans ${
        isDraggingOver ? 'ring-2 ring-cyan-500/50' : ''
      }`}
    >
      {/* Top Apple-Style Navigation Bar */}
      {/* pl-[88px] gives ample clearance for macOS Red/Yellow/Green traffic lights */}
      <header
        className="h-16 border-b border-white/[0.08] pl-[88px] pr-6 flex items-center justify-between bg-[#101012]/80 backdrop-blur-2xl z-30 select-none shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.04)]"
        style={{ WebkitAppRegion: 'drag' }}
      >
        {/* App Title & FS Logo */}
        <div className="flex items-center gap-3.5" style={{ WebkitAppRegion: 'no-drag' }}>
          <img
            src="icon.png"
            alt="FilmSt"
            className="w-8 h-8 rounded-xl object-cover shadow-lg border border-amber-500/30"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-white">
                FilmSt Voice Enhance
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold tracking-wide">
                STUDIO PRO
              </span>
            </div>
            <p className="text-[11px] text-white/45 tracking-tight">Tăng cường chất lượng âm thanh</p>
          </div>
        </div>

        {/* Center: Engine Switcher (Apple Segmented Style) */}
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
          <div className="bg-[#18181b]/90 p-1 rounded-xl border border-white/[0.08] flex items-center gap-1 shadow-inner">
            <button
              onClick={() => setSelectedModel('ultra')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                selectedModel === 'ultra'
                  ? 'bg-white text-black font-semibold shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
              title="Khuyên dùng cho quay cưới: Khử sạch 100% tiếng ồn/quạt/tiệc + Khử vang phòng + Làm ấm & rõ lời"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              Ultra Wedding (Khử Ồn + Vang)
            </button>
            <button
              onClick={() => setSelectedModel('deepfilter')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                selectedModel === 'deepfilter'
                  ? 'bg-white text-black font-semibold shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
              title="DeepFilterNet v3: Khử ồn đều, quạt, điều hòa, gió siêu tốc (<0.1s)"
            >
              <Zap className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
              DeepFilterNet (Siêu Tốc)
            </button>
            <button
              onClick={() => setSelectedModel('resemble')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                selectedModel === 'resemble'
                  ? 'bg-white text-black font-semibold shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
              title="Resemble Studio: Khử vang sảnh tiệc, nhà thờ"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Resemble Studio
            </button>
          </div>

          {/* Author Credit & Facebook Link (Apple Capsule Style) */}
          <button
            onClick={handleOpenAuthorFacebook}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-white/70 hover:text-white transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] group"
            title="Xem trang Facebook của tác giả Trịnh David"
          >
            <span className="text-white/40 text-[11px]">Tác giả:</span>
            <span className="font-semibold text-white tracking-wide group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
              TRỊNH DAVID
              <ExternalLink className="w-3 h-3 text-white/40 group-hover:text-amber-400 transition-colors" />
            </span>
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4 bg-[#000000]">
        {/* Left Sidebar: Batch Queue */}
        <div className="w-64 flex-shrink-0 h-full">
          <BatchQueue
            items={items}
            selectedId={selectedId}
            onSelect={handleSelectItem}
            onAddFiles={handleOpenFiles}
            onRemoveItem={(id) => setItems((prev) => prev.filter((it) => it.id !== id))}
            onClearAll={() => {
              setItems([]);
              setSelectedId(null);
            }}
            isProcessing={isProcessing}
          />
        </div>

        {/* Right Area: Main Workstation */}
        <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-1">
          {items.length === 0 ? (
            /* Empty State: Apple-Style Big Dropzone */
            <div
              onClick={handleOpenFiles}
              className="flex-1 border border-white/[0.1] hover:border-white/[0.25] rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-[#0d0d10] hover:bg-[#121216] group shadow-2xl relative overflow-hidden"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center mb-5 group-hover:scale-105 transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)]">
                <UploadCloud className="w-9 h-9 text-white/80 group-hover:text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2 tracking-tight">
                Kéo thả file Video hoặc Audio đám cưới vào đây
              </h2>
              <p className="text-sm text-white/50 max-w-md mb-6 leading-relaxed font-normal">
                Tự động tách âm thanh từ file quay <strong>MP4, MOV</strong> và nhận trực tiếp{' '}
                <strong>WAV, MP3, M4A</strong>. File gốc của anh tuyệt đối không bị đụng chạm.
              </p>
              <button className="px-6 py-2.5 rounded-full text-xs font-semibold bg-white text-black hover:bg-white/90 shadow-xl transition-all">
                Chọn file từ máy tính
              </button>
            </div>
          ) : (
            /* Active Working Area */
            <>
              {/* File Title & Case Badge (Compact Streamlined Toolbar) */}
              <div className="flex items-center justify-between bg-[#101012] border border-white/[0.08] rounded-xl px-3.5 py-2.5 shadow-md">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  {activeItem?.isVideo ? (
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                      <Video className="w-4 h-4 text-blue-400" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                      <FileAudio className="w-4 h-4 text-cyan-400" />
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <h2 className="text-xs font-semibold text-white tracking-tight truncate max-w-[420px]">
                      {activeItem?.fileName}
                    </h2>
                    <div className="flex items-center gap-2 text-[10px] text-white/45 font-mono">
                      {activeItem?.stats?.duration_sec && (
                        <span>Thời lượng: {activeItem.stats.duration_sec}s</span>
                      )}
                      <span>•</span>
                      <span>Định dạng: {activeItem?.extension?.toUpperCase()}</span>
                      {activeItem?.isVideo && (
                        <span className="text-cyan-400 font-sans">(Tự tách track audio)</span>
                      )}
                    </div>
                  </div>
                </div>

                {activeItem?.stats?.primary_case && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-white/40">Ca:</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {activeItem.stats.primary_case}
                    </span>
                  </div>
                )}
              </div>

              {/* Sound Character & EQ Controls (Compact Studio Bar) */}
              <div className="bg-[#101012] border border-white/[0.08] rounded-xl p-3.5 shadow-xl flex flex-col gap-3">
                {/* Preset Chips */}
                <div className="flex items-center justify-between border-b border-white/[0.05] pb-2.5">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-white/50 flex items-center gap-1.5">
                    <Sliders className="w-3 h-3 text-amber-400" />
                    Preset phim cưới:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => applyPreset('wedding_standard')}
                      className="px-2.5 py-0.5 rounded-full text-[11px] bg-white/[0.05] hover:bg-white/[0.1] text-white/80 hover:text-white border border-white/[0.08] transition-all"
                    >
                      🌟 Chuẩn Cưới
                    </button>
                    <button
                      onClick={() => applyPreset('warm_rich')}
                      className="px-2.5 py-0.5 rounded-full text-[11px] bg-white/[0.05] hover:bg-white/[0.1] text-white/80 hover:text-white border border-white/[0.08] transition-all"
                    >
                      🎙️ Trầm Ấm
                    </button>
                    <button
                      onClick={() => applyPreset('bright_clear')}
                      className="px-2.5 py-0.5 rounded-full text-[11px] bg-white/[0.05] hover:bg-white/[0.1] text-white/80 hover:text-white border border-white/[0.08] transition-all"
                    >
                      ✨ Trong Trẻo
                    </button>
                    <button
                      onClick={() => applyPreset('rescue_distant')}
                      className="px-2.5 py-0.5 rounded-full text-[11px] bg-white/[0.05] hover:bg-white/[0.1] text-white/80 hover:text-white border border-white/[0.08] transition-all"
                    >
                      🎯 Cứu Mic Xa
                    </button>
                  </div>
                </div>

                {/* 3 Main Sliders: Khử ồn + Trầm ấm + Trong trẻo */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* 1. Khử ồn */}
                  <div className="flex flex-col gap-1.5 bg-[#161619] p-2.5 rounded-lg border border-white/[0.06] shadow-sm">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-white/90 flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-cyan-400" />
                        1. Khử Ồn & Vang
                      </label>
                      <span className="text-[11px] font-mono font-bold text-cyan-400">{noiseReduction}%</span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={noiseReduction}
                      onChange={(e) => setNoiseReduction(parseInt(e.target.value, 10))}
                      disabled={isProcessing}
                      className="w-full h-1 bg-white/10 rounded-lg accent-cyan-400 cursor-pointer"
                    />

                    {/* Mức chọn nhanh */}
                    <div className="flex items-center justify-between pt-0.5">
                      <button
                        onClick={() => setNoiseReduction(0)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${noiseReduction === 0 ? 'bg-cyan-500 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Tắt
                      </button>
                      <button
                        onClick={() => setNoiseReduction(35)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${noiseReduction === 35 ? 'bg-cyan-500 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Nhẹ
                      </button>
                      <button
                        onClick={() => setNoiseReduction(80)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${noiseReduction === 80 ? 'bg-cyan-500 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Vừa
                      </button>
                      <button
                        onClick={() => setNoiseReduction(90)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${noiseReduction === 90 ? 'bg-cyan-500 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Mạnh
                      </button>
                      <button
                        onClick={() => setNoiseReduction(100)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${noiseReduction === 100 ? 'bg-cyan-500 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  {/* 2. Độ Trầm Ấm */}
                  <div className="flex flex-col gap-1.5 bg-[#161619] p-2.5 rounded-lg border border-white/[0.06] shadow-sm">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-white/90 flex items-center gap-1.5">
                        <Heart className="w-3 h-3 text-amber-400" />
                        2. Trầm Ấm (Warmth)
                      </label>
                      <span className="text-[11px] font-mono font-bold text-amber-400">{warmth}%</span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={warmth}
                      onChange={(e) => setWarmth(parseInt(e.target.value, 10))}
                      disabled={isProcessing}
                      className="w-full h-1 bg-white/10 rounded-lg accent-amber-400 cursor-pointer"
                    />

                    <div className="flex items-center justify-between pt-0.5">
                      <button
                        onClick={() => setWarmth(0)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${warmth === 0 ? 'bg-amber-400 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Tắt
                      </button>
                      <button
                        onClick={() => setWarmth(45)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${warmth === 45 ? 'bg-amber-400 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Tự nhiên
                      </button>
                      <button
                        onClick={() => setWarmth(65)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${warmth === 65 ? 'bg-amber-400 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Chuẩn
                      </button>
                      <button
                        onClick={() => setWarmth(85)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${warmth === 85 ? 'bg-amber-400 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Dày giọng
                      </button>
                    </div>
                  </div>

                  {/* 3. Độ Trong Trẻo */}
                  <div className="flex flex-col gap-1.5 bg-[#161619] p-2.5 rounded-lg border border-white/[0.06] shadow-sm">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-white/90 flex items-center gap-1.5">
                        <Sun className="w-3 h-3 text-blue-400" />
                        3. Trong Trẻo (Clarity)
                      </label>
                      <span className="text-[11px] font-mono font-bold text-blue-400">{clarity}%</span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={clarity}
                      onChange={(e) => setClarity(parseInt(e.target.value, 10))}
                      disabled={isProcessing}
                      className="w-full h-1 bg-white/10 rounded-lg accent-blue-400 cursor-pointer"
                    />

                    <div className="flex items-center justify-between pt-0.5">
                      <button
                        onClick={() => setClarity(0)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${clarity === 0 ? 'bg-blue-400 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Tắt
                      </button>
                      <button
                        onClick={() => setClarity(50)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${clarity === 50 ? 'bg-blue-400 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Vừa
                      </button>
                      <button
                        onClick={() => setClarity(70)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${clarity === 70 ? 'bg-blue-400 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Sáng chữ
                      </button>
                      <button
                        onClick={() => setClarity(90)}
                        className={`text-[10px] px-1.5 py-0.2 rounded ${clarity === 90 ? 'bg-blue-400 text-black font-semibold' : 'text-white/40 hover:text-white'}`}
                      >
                        Siêu trong
                      </button>
                    </div>
                  </div>
                </div>

                {/* Enhance Action Bar */}
                <div className="flex items-center justify-between pt-1">
                  <div className="text-[11px] text-white/40 tracking-tight">
                    Mục tiêu DaVinci: <span className="font-mono text-white/80 font-medium">-16 LUFS</span> • True Peak{' '}
                    <span className="font-mono text-white/80 font-medium">≤ -1 dBTP</span> (WAV 48kHz / 24-bit Mono)
                  </div>

                  <div className="flex items-center gap-2.5">
                    {isProcessing && (
                      <button
                        onClick={handleCancel}
                        className="px-4 py-2 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 text-xs font-semibold transition-all"
                      >
                        Hủy
                      </button>
                    )}

                    <button
                      onClick={handleEnhance}
                      disabled={isProcessing || !activeItem}
                      className={`px-6 py-2.5 rounded-full text-xs font-bold tracking-wide transition-all shadow-xl flex items-center gap-2 ${
                        isProcessing
                          ? 'bg-white/10 text-white/40 cursor-wait'
                          : 'bg-white hover:bg-white/90 text-black shadow-white/15 hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-black fill-black" />
                      <span>{isProcessing ? 'ĐANG XỬ LÝ ÂM THANH...' : 'BẤM ENHANCE (1 NÚT)'}</span>
                    </button>
                  </div>
                </div>

                {/* Progress Bar when processing */}
                {isProcessing && (
                  <div className="pt-2 border-t border-white/[0.06] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/80 font-medium flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                        {progressInfo.step || 'Đang xử lý âm thanh...'}
                      </span>
                      <span className="font-mono text-white/60">{progressInfo.percent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white transition-all duration-300"
                        style={{ width: `${progressInfo.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Waveform Player (Only shown AFTER enhancement completes & output file is created) */}
              {!isProcessing && activeItem?.status === 'done' && activeItem?.enhancedPath && (
                <WaveformPlayer
                  originalPath={activeItem?.normalizedWav}
                  enhancedPath={activeItem?.enhancedPath}
                  fileName={activeItem?.enhancedPath?.split('/').pop()}
                  onDragStart={handleDragStart}
                  onShowInFinder={handleShowInFinder}
                />
              )}

              {/* QC Metrics Panel (Compact 4-Bento Strip) */}
              {!isProcessing && activeItem?.status === 'done' && activeItem?.outputStats && (
                <QCPanel
                  inputStats={activeItem?.stats}
                  outputStats={activeItem?.outputStats}
                  reportPath={activeItem?.reportPath}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
