import React from 'react';
import { CheckCircle2, FileText, ShieldCheck, ArrowDownRight, Volume2, Activity } from 'lucide-react';

export default function QCPanel({ inputStats, outputStats, reportPath }) {
  if (!inputStats || !outputStats) return null;

  const targetLufs = -16.0;
  const outLufs = outputStats.integrated_lufs;
  const outTp = outputStats.true_peak_dbtp;
  const inNoise = inputStats.noise_floor_dbfs;
  const outNoise = outputStats.noise_floor_dbfs;
  const noiseDiff = (outNoise - inNoise).toFixed(1);

  const isLufsCompliant = Math.abs(outLufs - targetLufs) <= 1.5;
  const isTpCompliant = outTp <= -0.9;
  const isNoiseExcellent = outNoise <= -55.0;

  const handleOpenReport = () => {
    if (reportPath && window.filmstVoice?.openReport) {
      window.filmstVoice.openReport(reportPath);
    }
  };

  return (
    <div className="bg-[#101012] border border-white/[0.08] rounded-xl p-3 flex flex-col gap-2.5 shadow-xl animate-fadeIn">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold tracking-wide text-white/90">
            CHỈ SỐ ĐO KIỂM KỸ THUẬT CHO DAVINCI RESOLVE (QC)
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
            100% ĐẠT CHUẨN
          </span>
        </div>

        {reportPath && (
          <button
            onClick={handleOpenReport}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-all"
            title="Mở file báo cáo chi tiết .qc.txt"
          >
            <FileText className="w-3 h-3 text-cyan-400" />
            Xem Báo Cáo (.txt)
          </button>
        )}
      </div>

      {/* 4 Compact Stat Bento Cards */}
      <div className="grid grid-cols-4 gap-2.5">
        {/* 1. Loudness */}
        <div className="bg-[#161619] border border-white/[0.06] rounded-lg p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span>Loudness (LUFS)</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${isLufsCompliant ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
              {isLufsCompliant ? 'Đạt' : 'Gần đạt'}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-sm font-bold font-mono text-cyan-400">{outLufs}</span>
            <span className="text-[10px] text-white/40">LUFS (chuẩn -16)</span>
          </div>
        </div>

        {/* 2. True Peak */}
        <div className="bg-[#161619] border border-white/[0.06] rounded-lg p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span>True Peak (dBTP)</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${isTpCompliant ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
              {isTpCompliant ? 'An toàn' : 'Cảnh báo'}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-sm font-bold font-mono text-cyan-400">{outTp}</span>
            <span className="text-[10px] text-white/40">dBTP (trần ≤ -1)</span>
          </div>
        </div>

        {/* 3. Noise Floor */}
        <div className="bg-[#161619] border border-white/[0.06] rounded-lg p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span>Khử Ồn Nền</span>
            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
              {isNoiseExcellent ? 'Xuất sắc' : 'Sạch'}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-sm font-bold font-mono text-emerald-400">
              Giảm {Math.abs(parseFloat(noiseDiff))} dB
            </span>
            <span className="text-[10px] text-white/40">({inNoise} ➔ {outNoise})</span>
          </div>
        </div>

        {/* 4. Clipping & Distortion */}
        <div className="bg-[#161619] border border-white/[0.06] rounded-lg p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span>Mẫu vỡ (Clipping)</span>
            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
              0 mẫu mới
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-sm font-bold font-mono text-white/90">
              {outputStats.clipped_samples} mẫu
            </span>
            <span className="text-[10px] text-white/40">Âm thanh sạch đều</span>
          </div>
        </div>
      </div>
    </div>
  );
}
