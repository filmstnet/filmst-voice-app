import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Sparkles, FolderOpen, Layers } from 'lucide-react';

export default function WaveformPlayer({
  originalPath,
  enhancedPath,
  fileName,
  onDragStart,
  onShowInFinder
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrack, setActiveTrack] = useState('enhanced'); // 'enhanced' or 'original'
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [isHoldingA, setIsHoldingA] = useState(false);
  const [peaks, setPeaks] = useState([]);
  const [hasOriginal, setHasOriginal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const enhancedAudioRef = useRef(null);
  const originalAudioRef = useRef(null);
  const enhancedBlobUrlRef = useRef(null);
  const originalBlobUrlRef = useRef(null);
  const canvasRef = useRef(null);

  // Load Enhanced Track (B - newly created output file)
  useEffect(() => {
    let isCancelled = false;

    async function loadEnhanced() {
      if (!enhancedPath || !window.filmstVoice?.readAudioBuffer) return;
      setIsLoading(true);

      if (enhancedAudioRef.current) {
        enhancedAudioRef.current.pause();
        enhancedAudioRef.current = null;
      }
      if (enhancedBlobUrlRef.current) {
        URL.revokeObjectURL(enhancedBlobUrlRef.current);
        enhancedBlobUrlRef.current = null;
      }

      try {
        const uint8 = await window.filmstVoice.readAudioBuffer(enhancedPath);
        if (isCancelled || !uint8 || uint8.byteLength === 0) return;

        const arrayBuffer = uint8.buffer.slice(
          uint8.byteOffset,
          uint8.byteOffset + uint8.byteLength
        );

        const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
        const objectUrl = URL.createObjectURL(blob);
        enhancedBlobUrlRef.current = objectUrl;

        const audio = new Audio(objectUrl);
        audio.preload = 'auto';
        audio.volume = volume;

        audio.onloadedmetadata = () => {
          if (!isCancelled && audio.duration && !isNaN(audio.duration)) {
            setDuration(audio.duration);
          }
        };

        audio.ontimeupdate = () => {
          if (!isCancelled && audio) {
            setCurrentTime(audio.currentTime);
          }
        };

        audio.onended = () => {
          if (!isCancelled) {
            setIsPlaying(false);
            setCurrentTime(0);
          }
        };

        enhancedAudioRef.current = audio;
        setActiveTrack('enhanced');

        // Extract 90 real waveform peak bars
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          const ctx = new AudioCtx();
          const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
          if (!isCancelled) {
            const channel = decoded.getChannelData(0);
            const numBars = 90;
            const step = Math.floor(channel.length / numBars);
            const pList = [];
            for (let i = 0; i < numBars; i++) {
              let max = 0;
              const start = i * step;
              const end = Math.min(start + step, channel.length);
              for (let j = start; j < end; j += 4) {
                const val = Math.abs(channel[j]);
                if (val > max) max = val;
              }
              pList.push(Math.max(0.06, Math.min(1.0, max)));
            }
            setPeaks(pList);
            if (decoded.duration && !isNaN(decoded.duration)) {
              setDuration(decoded.duration);
            }
          }
          ctx.close();
        } catch (decErr) {
          console.warn('Peak extraction fallback:', decErr);
        }
      } catch (err) {
        console.error('Failed to load enhanced audio:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    loadEnhanced();

    return () => {
      isCancelled = true;
      if (enhancedAudioRef.current) {
        enhancedAudioRef.current.pause();
        enhancedAudioRef.current = null;
      }
      if (enhancedBlobUrlRef.current) {
        URL.revokeObjectURL(enhancedBlobUrlRef.current);
      }
    };
  }, [enhancedPath]);

  // Load Original Track (A - if normalized WAV exists for A/B comparison)
  useEffect(() => {
    let isCancelled = false;

    async function loadOriginal() {
      if (!originalPath || !originalPath.endsWith('.wav') || !window.filmstVoice?.readAudioBuffer) {
        setHasOriginal(false);
        return;
      }

      if (originalAudioRef.current) {
        originalAudioRef.current.pause();
        originalAudioRef.current = null;
      }
      if (originalBlobUrlRef.current) {
        URL.revokeObjectURL(originalBlobUrlRef.current);
        originalBlobUrlRef.current = null;
      }

      try {
        const uint8 = await window.filmstVoice.readAudioBuffer(originalPath);
        if (isCancelled || !uint8 || uint8.byteLength === 0) return;

        const arrayBuffer = uint8.buffer.slice(
          uint8.byteOffset,
          uint8.byteOffset + uint8.byteLength
        );

        const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
        const objectUrl = URL.createObjectURL(blob);
        originalBlobUrlRef.current = objectUrl;

        const audio = new Audio(objectUrl);
        audio.preload = 'auto';
        audio.volume = volume;

        audio.ontimeupdate = () => {
          if (!isCancelled && (isHoldingA || activeTrack === 'original')) {
            setCurrentTime(audio.currentTime);
          }
        };

        audio.onended = () => {
          if (!isCancelled) {
            setIsPlaying(false);
            setCurrentTime(0);
          }
        };

        originalAudioRef.current = audio;
        setHasOriginal(true);
      } catch (err) {
        console.warn('Original track not available for A/B:', err);
        setHasOriginal(false);
      }
    }

    loadOriginal();

    return () => {
      isCancelled = true;
      if (originalAudioRef.current) {
        originalAudioRef.current.pause();
        originalAudioRef.current = null;
      }
      if (originalBlobUrlRef.current) {
        URL.revokeObjectURL(originalBlobUrlRef.current);
      }
    };
  }, [originalPath]);

  // Volume sync
  useEffect(() => {
    if (enhancedAudioRef.current) enhancedAudioRef.current.volume = volume;
    if (originalAudioRef.current) originalAudioRef.current.volume = volume;
  }, [volume]);

  // Play / Pause toggle
  const togglePlay = () => {
    const isOrig = isHoldingA || activeTrack === 'original';
    const activeAudio = isOrig && originalAudioRef.current
      ? originalAudioRef.current
      : enhancedAudioRef.current;

    if (!activeAudio) return;

    if (isPlaying) {
      if (enhancedAudioRef.current) enhancedAudioRef.current.pause();
      if (originalAudioRef.current) originalAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      activeAudio.volume = volume;
      activeAudio.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Playback error:', err);
      });
    }
  };

  // Seek
  const handleSeek = (newTime) => {
    const clamped = Math.max(0, Math.min(duration || 0, newTime));
    setCurrentTime(clamped);
    if (enhancedAudioRef.current) enhancedAudioRef.current.currentTime = clamped;
    if (originalAudioRef.current) originalAudioRef.current.currentTime = clamped;
  };

  // Switch between Original (A) and Enhanced (B)
  const switchTrack = (targetTrack) => {
    if (targetTrack === activeTrack) return;
    const wasPlaying = isPlaying;
    const fromAudio = activeTrack === 'enhanced' ? enhancedAudioRef.current : originalAudioRef.current;
    const toAudio = targetTrack === 'enhanced' ? enhancedAudioRef.current : originalAudioRef.current;

    const syncTime = fromAudio ? fromAudio.currentTime : currentTime;

    if (fromAudio) fromAudio.pause();

    if (toAudio) {
      toAudio.currentTime = syncTime;
      toAudio.volume = volume;
      if (wasPlaying) {
        toAudio.play().then(() => setIsPlaying(true)).catch(console.error);
      }
    }
    setActiveTrack(targetTrack);
  };

  // Momentary Hold for Original (A)
  const handleHoldAStart = () => {
    if (!originalAudioRef.current) return;
    setIsHoldingA(true);
    const wasPlaying = isPlaying;
    const syncTime = enhancedAudioRef.current ? enhancedAudioRef.current.currentTime : currentTime;

    if (enhancedAudioRef.current) enhancedAudioRef.current.pause();

    originalAudioRef.current.currentTime = syncTime;
    originalAudioRef.current.volume = volume;
    if (wasPlaying) {
      originalAudioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const handleHoldAEnd = () => {
    if (!isHoldingA) return;
    setIsHoldingA(false);
    const wasPlaying = isPlaying;
    const syncTime = originalAudioRef.current ? originalAudioRef.current.currentTime : currentTime;

    if (originalAudioRef.current) originalAudioRef.current.pause();

    if (enhancedAudioRef.current) {
      enhancedAudioRef.current.currentTime = syncTime;
      enhancedAudioRef.current.volume = volume;
      if (wasPlaying) {
        enhancedAudioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      }
    }
  };

  // Spacebar shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, activeTrack, isHoldingA, volume, duration]);

  // Format time mm:ss
  const formatTime = (sec) => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Render Canvas Waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const isCurrentEnhanced = !(isHoldingA || activeTrack === 'original');
    const barList = peaks.length > 0 ? peaks : Array.from({ length: 80 }, () => 0.22);
    const totalBars = barList.length;
    const barWidth = 4;
    const gap = (w - totalBars * barWidth) / Math.max(1, totalBars - 1);

    for (let i = 0; i < totalBars; i++) {
      const x = i * (barWidth + gap);
      const progress = currentTime / (duration || 1);
      const isPlayed = i / totalBars <= progress;

      const peakVal = barList[i];
      const barHeight = Math.max(4, peakVal * (h - 10));
      const y = (h - barHeight) / 2;

      if (isPlayed) {
        ctx.fillStyle = isCurrentEnhanced ? '#06b6d4' : '#f59e0b';
      } else {
        ctx.fillStyle = isCurrentEnhanced ? 'rgba(6, 182, 212, 0.25)' : 'rgba(245, 158, 11, 0.25)';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }
  }, [currentTime, duration, activeTrack, isHoldingA, peaks]);

  const isCurrentEnhanced = !(isHoldingA || activeTrack === 'original');
  const displayName = fileName || (enhancedPath ? enhancedPath.split('/').pop() : 'Track đã Enhance');

  return (
    <div className="bg-[#121216] border border-cyan-500/30 rounded-xl p-3.5 shadow-2xl flex flex-col gap-3 animate-fadeIn">
      {/* Top Header: Track Status + A/B Switchers + DaVinci Drag Button */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: Play State & Output Filename */}
        <div className="flex items-center gap-2.5 overflow-hidden">
          {isCurrentEnhanced ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shrink-0">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              ĐÃ ENHANCE (B)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
              <Volume2 className="w-3 h-3 text-amber-400" />
              GỐC (A)
            </span>
          )}

          <span className="text-[11px] text-white/60 font-mono truncate max-w-[260px]" title={enhancedPath}>
            {displayName}
          </span>
        </div>

        {/* Center: A/B comparison buttons */}
        {hasOriginal && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onMouseDown={handleHoldAStart}
              onMouseUp={handleHoldAEnd}
              onMouseLeave={handleHoldAEnd}
              onTouchStart={handleHoldAStart}
              onTouchEnd={handleHoldAEnd}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all select-none ${
                isHoldingA
                  ? 'bg-amber-500 text-black border-amber-400 font-bold scale-95 shadow-lg'
                  : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
              }`}
              title="Nhấn và giữ chuột để nghe tiếng gốc, thả ra để nghe tiếng đã enhance"
            >
              Giữ nghe Gốc (A)
            </button>

            <div className="bg-black/40 p-0.5 rounded-lg border border-white/10 flex items-center gap-0.5">
              <button
                onClick={() => switchTrack('original')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  !isCurrentEnhanced
                    ? 'bg-amber-500 text-black font-semibold'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Gốc
              </button>
              <button
                onClick={() => switchTrack('enhanced')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  isCurrentEnhanced
                    ? 'bg-cyan-500 text-black font-semibold'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Enhance
              </button>
            </div>
          </div>
        )}

        {/* Right: Show In Finder & Drag to DaVinci Resolve */}
        <div className="flex items-center gap-2 shrink-0">
          {onShowInFinder && (
            <button
              onClick={() => onShowInFinder(enhancedPath)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition-all"
              title="Mở thư mục chứa file trong Finder"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          )}

          {onDragStart && (
            <div
              draggable
              onDragStart={(e) => onDragStart(e, enhancedPath)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-white text-black hover:bg-white/90 shadow-md cursor-grab active:cursor-grabbing flex items-center gap-1.5 select-none transition-all active:scale-95"
              title="Kéo trực tiếp vào timeline hoặc Media Pool của DaVinci Resolve"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Kéo vào DaVinci Resolve</span>
            </div>
          )}
        </div>
      </div>

      {/* Waveform Canvas */}
      <div
        className="relative h-20 bg-black/50 rounded-xl overflow-hidden border border-white/5 cursor-pointer flex items-center justify-center group"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, clickX / rect.width));
          handleSeek(ratio * duration);
        }}
      >
        <canvas ref={canvasRef} width={800} height={80} className="w-full h-full" />

        {/* Glowing Progress Playhead Line */}
        <div
          className={`absolute top-0 bottom-0 w-[2px] transition-all pointer-events-none ${
            isCurrentEnhanced
              ? 'bg-cyan-400 shadow-[0_0_10px_#06b6d4]'
              : 'bg-amber-400 shadow-[0_0_10px_#f59e0b]'
          }`}
          style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
        />
      </div>

      {/* Playback Controls Bar */}
      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-2.5">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            disabled={isLoading || !enhancedPath}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              isPlaying
                ? 'bg-white text-black shadow-lg scale-95'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-cyan-500/20 shadow-md hover:scale-105'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title="Phát / Tạm dừng (Phím Space)"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          {/* Reset to Start */}
          <button
            onClick={() => handleSeek(0)}
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-all"
            title="Về đầu file"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Time Counter */}
          <span className="text-xs font-mono text-white/80 ml-1">
            {formatTime(currentTime)} <span className="text-white/30">/</span> {formatTime(duration)}
          </span>

          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-white/40 border border-white/5 hidden sm:inline-block">
            48kHz 24-bit Mono • -16 LUFS
          </span>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-2">
          {volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-white/40" /> : <Volume2 className="w-3.5 h-3.5 text-white/60" />}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 accent-cyan-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
            title={`Âm lượng: ${Math.round(volume * 100)}%`}
          />
        </div>
      </div>
    </div>
  );
}
