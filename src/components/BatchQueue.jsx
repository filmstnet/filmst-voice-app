import React from 'react';
import { FileAudio, Video, CheckCircle2, Clock, Trash2, Plus, Sparkles } from 'lucide-react';

export default function BatchQueue({
  items,
  selectedId,
  onSelect,
  onAddFiles,
  onRemoveItem,
  onClearAll,
  isProcessing
}) {
  const formatSize = (bytes) => {
    if (!bytes) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-[#121216] border border-white/10 rounded-2xl p-4 flex flex-col h-full shadow-xl">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider font-semibold text-white/50">Danh sách file</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-white/10 text-white/70">
            {items.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onAddFiles}
            disabled={isProcessing}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-all disabled:opacity-40"
            title="Thêm file"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {items.length > 0 && (
            <button
              onClick={onClearAll}
              disabled={isProcessing}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 border border-white/10 transition-all disabled:opacity-40"
              title="Xóa danh sách"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto space-y-2 pt-3 pr-1">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-white/30">
            <p className="text-xs">Chưa có file nào.</p>
            <p className="text-[11px] mt-1 text-white/20">Kéo thả file MP4, MOV, WAV vào đây</p>
          </div>
        ) : (
          items.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <div
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1.5 ${
                  isSelected
                    ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                    : 'bg-black/30 border-white/5 hover:border-white/15 hover:bg-white/5'
                }`}
              >
                {/* Title & Icon */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {item.isVideo ? (
                      <Video className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    ) : (
                      <FileAudio className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    )}
                    <span className="text-xs font-medium text-white/90 truncate max-w-[150px]">
                      {item.fileName}
                    </span>
                  </div>

                  {item.status === 'done' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  ) : item.status === 'processing' ? (
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin flex-shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                  )}
                </div>

                {/* Sub info */}
                <div className="flex items-center justify-between text-[10px] text-white/40">
                  <span>{formatSize(item.fileSize)}</span>
                  {item.stats?.primary_case ? (
                    <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/60 truncate max-w-[120px]">
                      {item.stats.primary_case}
                    </span>
                  ) : (
                    <span className="uppercase">{item.extension}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
