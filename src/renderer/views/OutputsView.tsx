import React, { useEffect, useState } from 'react';
import { useOutputStore } from '../store/output-store.ts';
import type { OutputFileItem } from '../../shared/types.ts';
import {
  FolderDown,
  FolderOpen,
  ExternalLink,
  Search,
  Filter,
  Image as ImageIcon,
  Video as VideoIcon,
  RefreshCw,
  X,
  FileCode,
  HardDrive,
} from 'lucide-react';

export const OutputsView: React.FC = () => {
  const {
    outputs,
    loadOutputs,
    openFile,
    revealInExplorer,
    filterType,
    setFilterType,
    searchQuery,
    setSearchQuery,
    isLoading,
  } = useOutputStore();

  const [selectedItem, setSelectedItem] = useState<OutputFileItem | null>(null);

  useEffect(() => {
    loadOutputs();
  }, []);

  const filteredOutputs = outputs.filter((item) => {
    const matchesType = filterType === 'all' || item.type === filterType;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.projectName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d1322] border border-slate-800">
        <div className="flex items-center gap-2">
          {/* Filter Type Pills */}
          {(['all', 'image', 'video'] as const).map((t) => {
            const isActive = filterType === t;
            return (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {t === 'all' ? 'Tất cả' : t === 'image' ? 'Ảnh' : 'Video'}
              </button>
            );
          })}

          <button
            onClick={() => loadOutputs()}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo prompt, tên file..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Media Grid */}
      {filteredOutputs.length === 0 ? (
        <div className="py-20 text-center text-slate-500 text-xs rounded-2xl border border-dashed border-slate-800">
          Chưa có file output nào được tải về máy. Hãy chạy một job tạo ảnh hoặc video.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredOutputs.map((item) => {
            const isImage = item.type === 'image';
            return (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="group rounded-2xl border border-slate-800 bg-[#0d1322] overflow-hidden hover:border-slate-700 hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between"
              >
                {/* Media Preview Box */}
                <div className="aspect-video bg-slate-950 relative overflow-hidden flex items-center justify-center border-b border-slate-800/80">
                  {isImage ? (
                    <img
                      src={`file://${item.path.replace(/\\/g, '/')}`}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-violet-950/40 to-slate-900 text-violet-400 gap-2">
                      <VideoIcon className="w-8 h-8 opacity-80 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-mono font-bold tracking-wider">MP4 VIDEO</span>
                    </div>
                  )}

                  <span
                    className={`absolute top-2 left-2 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider backdrop-blur-md ${
                      isImage
                        ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/30'
                        : 'bg-violet-950/80 text-violet-300 border border-violet-500/30'
                    }`}
                  >
                    {item.type}
                  </span>
                </div>

                {/* Info & Metadata */}
                <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-200 truncate">{item.name}</p>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {item.prompt || 'Không có prompt'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>{formatFileSize(item.size)}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openFile(item.path)}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Mở File</span>
                    </button>
                    <button
                      onClick={() => revealInExplorer(item.path)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                      title="Hiện trong File Explorer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Media Detail & Preview Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-3xl bg-[#0d1322] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded uppercase font-extrabold ${
                    selectedItem.type === 'video'
                      ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                      : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  }`}
                >
                  {selectedItem.type}
                </span>
                <h3 className="text-sm font-bold text-white truncate max-w-md">{selectedItem.name}</h3>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Preview Element */}
              <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center max-h-[420px]">
                {selectedItem.type === 'image' ? (
                  <img
                    src={`file://${selectedItem.path.replace(/\\/g, '/')}`}
                    alt={selectedItem.name}
                    className="max-h-[400px] w-auto object-contain"
                  />
                ) : (
                  <video
                    src={`file://${selectedItem.path.replace(/\\/g, '/')}`}
                    controls
                    className="max-h-[400px] w-full"
                  />
                )}
              </div>

              {/* Prompt box */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">PROMPT</span>
                <p className="text-xs text-slate-200 leading-relaxed">{selectedItem.prompt}</p>
              </div>

              {/* Path & Metadata info */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Dung lượng:</span>
                  <span className="font-semibold text-slate-200">{formatFileSize(selectedItem.size)}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Dự án:</span>
                  <span className="font-semibold text-slate-200">{selectedItem.projectName}</span>
                </div>
                <div className="col-span-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-400 truncate">
                  <span className="text-[10px] text-slate-500 block font-sans">Đường dẫn tệp:</span>
                  {selectedItem.path}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-3">
              <button
                onClick={() => revealInExplorer(selectedItem.path)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Mở trong Thư mục</span>
              </button>
              <button
                onClick={() => openFile(selectedItem.path)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở tệp ngoài</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
