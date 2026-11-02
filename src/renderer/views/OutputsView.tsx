import React, { useEffect, useState, useMemo } from 'react';
import { useOutputStore } from '../store/output-store.ts';
import { useAppStore } from '../store/app-store.ts';
import type { OutputFileItem, Session, BatchNamingConfig, SyncProgress, DiscoveredProject } from '../../shared/types.ts';
import {
  FolderOpen,
  ExternalLink,
  Search,
  Image as ImageIcon,
  Video as VideoIcon,
  RefreshCw,
  X,
  CloudDownload,
  Tag,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sliders,
  Check,
  FolderSync,
  Layers,
  LayoutGrid,
  List,
  Trash2,
  Film,
} from 'lucide-react';

const toMediaUrl = (filePath: string) => {
  return `app-media://file?path=${encodeURIComponent(filePath)}`;
};

const SafeImage: React.FC<{
  path: string;
  alt: string;
  className?: string;
}> = ({ path, alt, className }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const handleError = async () => {
    try {
      const fallback = await window.api.readAsDataUrl(path);
      if (fallback) {
        setDataUrl(fallback);
      } else {
        setHasError(true);
      }
    } catch {
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-white text-[#8B85B8] p-2 text-center text-[10px]">
        <ImageIcon className="w-6 h-6 mb-1 opacity-40 text-red-400" />
        <span>Không thể tải ảnh</span>
      </div>
    );
  }

  return (
    <img
      src={dataUrl || toMediaUrl(path)}
      alt={alt}
      onError={handleError}
      className={className}
    />
  );
};

export const OutputsView: React.FC = () => {
  const {
    outputs,
    loadOutputs,
    openFile,
    revealInExplorer,
    deleteOutput,
    deleteOutputs,
    filterType,
    setFilterType,
    filterProject,
    setFilterProject,
    searchQuery,
    setSearchQuery,
    isLoading,
  } = useOutputStore();

  const { addNotification } = useAppStore();
  const [selectedItem, setSelectedItem] = useState<OutputFileItem | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync Modal State
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [syncScope, setSyncScope] = useState<'all_projects' | 'current_project'>('all_projects');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  // Project discovery state
  const [discoveredProjects, setDiscoveredProjects] = useState<DiscoveredProject[]>([]);
  const [selectedProjectNames, setSelectedProjectNames] = useState<Set<string>>(new Set());
  const [isScanningProjects, setIsScanningProjects] = useState(false);
  const [projectScanError, setProjectScanError] = useState<string | null>(null);
  const [hasScannedProjects, setHasScannedProjects] = useState(false);

  // Batch Rename Modal State
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTargetProject, setRenameTargetProject] = useState<string>('all');

  // Shared Naming Config
  const [namingConfig, setNamingConfig] = useState<BatchNamingConfig>({
    prefix: 'Flow',
    pattern: 'prefix_date_index',
    startNumber: 1,
    digits: 3,
    separator: '_',
  });

  // Load outputs and sessions on mount
  useEffect(() => {
    loadOutputs();
    window.api.getSessions().then((sessList) => {
      setSessions(sessList);
      if (sessList.length > 0) {
        // Prioritize a session that is ready
        const readySess = sessList.find((s) => s.status === 'ready');
        setSelectedSessionId(readySess ? readySess.id : sessList[sessList.length - 1].id);
      }
    });

    // Listen to sync progress
    const unsubscribe = window.api.onSyncProgress((progress) => {
      setSyncProgress(progress);
      if (progress.status === 'completed' || progress.status === 'error' || progress.status === 'cancelled') {
        setIsSyncing(false);
        loadOutputs();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Refresh session list whenever the sync modal is opened
  useEffect(() => {
    if (isSyncModalOpen) {
      window.api.getSessions().then((sessList) => {
        setSessions(sessList);
        setSelectedSessionId((prev) => {
          // If current selectedSession is already 'ready', keep it
          const current = sessList.find((s) => s.id === prev);
          if (current && current.status === 'ready') return prev;
          // Otherwise pick a ready session
          const readySess = sessList.find((s) => s.status === 'ready');
          if (readySess) return readySess.id;
          // If previous selection still exists, keep it
          if (current) return prev;
          // Fallback to most recent session
          return sessList.length > 0 ? sessList[sessList.length - 1].id : '';
        });
      });
    }
  }, [isSyncModalOpen]);

  // Unique project list from outputs
  const uniqueProjects = useMemo(() => {
    const set = new Set<string>();
    outputs.forEach((item) => {
      if (item.projectName) set.add(item.projectName);
    });
    return Array.from(set);
  }, [outputs]);

  const [sortBy, setSortBy] = useState<'index_asc' | 'date_desc' | 'date_asc' | 'name_asc'>('index_asc');

  // Filtered & Sorted Outputs
  const filteredOutputs = useMemo(() => {
    const list = outputs.filter((item) => {
      const matchesType = filterType === 'all' || item.type === filterType;
      const matchesProject = filterProject === 'all' || item.projectName === filterProject;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.projectName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesProject && matchesSearch;
    });

    return list.sort((a, b) => {
      if (sortBy === 'index_asc') {
        if (a.batchIndex !== undefined && b.batchIndex !== undefined) {
          if (a.projectName === b.projectName) return a.batchIndex - b.batchIndex;
        }
        if (a.batchIndex !== undefined && a.projectName === b.projectName) return -1;
        if (b.batchIndex !== undefined && a.projectName === b.projectName) return 1;

        const timeA = new Date(a.originalCreatedAt || a.createdAt).getTime();
        const timeB = new Date(b.originalCreatedAt || b.createdAt).getTime();
        if (timeA !== timeB) return timeA - timeB;

        return a.name.localeCompare(b.name, undefined, { numeric: true });
      }
      if (sortBy === 'date_desc') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'date_asc') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      }
      return 0;
    });
  }, [outputs, filterType, filterProject, searchQuery, sortBy]);

  // Preview Formatted Filename
  const getPreviewNames = (count: number = 3) => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    const sep = namingConfig.separator || '_';
    const cleanPrefix = namingConfig.prefix?.trim() || 'Image';
    const sampleProject = 'DuAnFlow';

    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const numStr = String(namingConfig.startNumber + i).padStart(namingConfig.digits, '0');
      let base = '';
      switch (namingConfig.pattern) {
        case 'prefix_index':
          base = `${cleanPrefix}${sep}${numStr}`;
          break;
        case 'project_index':
          base = `${sampleProject}${sep}${numStr}`;
          break;
        case 'prefix_date_index':
          base = `${cleanPrefix}${sep}${dateStr}${sep}${numStr}`;
          break;
        case 'date_index':
          base = `${dateStr}${sep}${numStr}`;
          break;
        default:
          base = `${cleanPrefix}${sep}${numStr}`;
      }
      names.push(`${base}.png`);
    }
    return names;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // Scan projects from Google Flow
  const handleScanProjects = async () => {
    setIsScanningProjects(true);
    setProjectScanError(null);
    setDiscoveredProjects([]);
    setSelectedProjectNames(new Set());
    setHasScannedProjects(false);
    try {
      const res = await window.api.scanProjects(selectedSessionId || undefined);
      if (res.success && res.projects.length > 0) {
        setDiscoveredProjects(res.projects);
        // Auto-select all by default
        setSelectedProjectNames(new Set(res.projects.map((p) => p.name)));
        setHasScannedProjects(true);
      } else {
        setProjectScanError(res.message || 'Không tìm thấy dự án nào.');
        setHasScannedProjects(true);
      }
    } catch (err: any) {
      setProjectScanError(`Lỗi quét: ${err.message || String(err)}`);
      setHasScannedProjects(true);
    } finally {
      setIsScanningProjects(false);
    }
  };

  // Toggle project selection
  const toggleProjectSelection = (name: string) => {
    setSelectedProjectNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Trigger Google Flow Media Sync
  const handleStartSync = async () => {
    setIsSyncing(true);
    setSyncProgress({
      status: 'scanning',
      downloadedCount: 0,
      skippedCount: 0,
      totalFound: 0,
      message: 'Đang kết nối tới Google Flow để kiểm tra dự án...',
    });

    try {
      const res = await window.api.startMediaSync({
        sessionId: selectedSessionId,
        scope: syncScope,
        namingConfig,
        // Pass selected project names for targeted sync
        selectedProjectNames:
          syncScope === 'all_projects' && selectedProjectNames.size > 0 && selectedProjectNames.size < discoveredProjects.length
            ? Array.from(selectedProjectNames)
            : undefined,
      });

      if (!res.success && syncProgress?.status !== 'cancelled') {
        alert(res.message);
      }
    } catch (err: any) {
      alert(`Lỗi đồng bộ: ${err.message || String(err)}`);
    } finally {
      setIsSyncing(false);
      loadOutputs();
    }
  };

  const handleCancelSync = async () => {
    await window.api.cancelMediaSync();
    setIsSyncing(false);
  };

  // Trigger Batch Rename
  const handleApplyBatchRename = async () => {
    if (!confirm('Bạn có chắc chắn muốn đổi tên hàng loạt các file theo quy tắc đã chọn? Thao tác này sẽ đồng bộ cả metadata.')) {
      return;
    }

    setIsRenaming(true);
    try {
      const res = await window.api.batchRenameOutputs({
        projectName: renameTargetProject === 'all' ? undefined : renameTargetProject,
        namingConfig,
      });

      alert(res.message);
      setIsRenameModalOpen(false);
      loadOutputs();
    } catch (err: any) {
      alert(`Lỗi đổi tên: ${err.message || String(err)}`);
    } finally {
      setIsRenaming(false);
    }
  };

  // Delete a single file
  const handleDeleteSingle = async (item: OutputFileItem) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa file "${item.name}"?\nThao tác này sẽ xóa vĩnh viễn tệp trên ổ đĩa.`)) {
      return;
    }

    try {
      const ok = await deleteOutput(item.path);
      if (ok) {
        addNotification({
          type: 'success',
          message: `Đã xóa file ${item.name}`,
        });
        if (selectedItem?.path === item.path) {
          setSelectedItem(null);
        }
      } else {
        addNotification({
          type: 'error',
          message: `Không thể xóa file ${item.name}`,
        });
      }
    } catch (err: any) {
      addNotification({
        type: 'error',
        message: `Lỗi: ${err.message || String(err)}`,
      });
    }
  };

  // Delete all filtered files
  const handleDeleteAll = async () => {
    const count = filteredOutputs.length;
    if (count === 0) return;

    const isFiltered = filterType !== 'all' || filterProject !== 'all' || searchQuery.trim().length > 0;
    const confirmMsg = isFiltered
      ? `Bạn có chắc chắn muốn xóa tất cả ${count} file đang lọc không?\nThao tác này sẽ xóa vĩnh viễn các file trên đĩa cứng và không thể khôi phục!`
      : `CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ ${count} file đầu ra trong thư viện không?\nThao tác này sẽ xóa vĩnh viễn các file trên đĩa cứng và không thể khôi phục!`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsDeleting(true);
    try {
      const filePaths = filteredOutputs.map((item) => item.path);
      const res = await deleteOutputs(filePaths);
      if (res.success) {
        addNotification({
          type: 'success',
          message: `Đã xóa thành công ${res.deletedCount} file!`,
        });
        setSelectedItem(null);
      } else {
        addNotification({
          type: 'error',
          message: 'Không thể xóa các file đã chọn.',
        });
      }
    } catch (err: any) {
      addNotification({
        type: 'error',
        message: `Lỗi xóa file: ${err.message || String(err)}`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#1A0A4A] tracking-tight flex items-center gap-2">
            <span>Thư viện Media &amp; Ảnh đã xuất</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#5F2CFF]/10 text-[#5F2CFF] border border-[#5F2CFF]/20">
              {filteredOutputs.length} file
            </span>
          </h1>
          <p className="text-xs text-[#4A4070] mt-0.5">
            Xem toàn bộ ảnh đã tạo hoặc đồng bộ từ web Google Flow về máy tính với quy tắc đặt tên tự động.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Delete All Button */}
          <button
            onClick={handleDeleteAll}
            disabled={filteredOutputs.length === 0 || isDeleting}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 hover:border-red-500/50 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title="Xóa toàn bộ các file đang hiển thị"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            )}
            <span>Xóa tất cả {filteredOutputs.length > 0 ? `(${filteredOutputs.length})` : ''}</span>
          </button>

          {/* Batch Rename Button */}
          <button
            onClick={() => setIsRenameModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#F0F3FF] text-[#1A0A4A] border border-[#C4CEFF] hover:border-[#8B7AB8] transition-all flex items-center gap-2 shadow-sm"
          >
            <Tag className="w-3.5 h-3.5 text-sky-700" />
            <span>Đặt tên hàng loạt</span>
          </button>

          {/* CapCut Export Button */}
          <button
            onClick={() => {
              const imagePaths = filteredOutputs.filter(o => o.type === 'image').map(o => o.path);
              useAppStore.getState().openCapCutModal({
                initialMediaPaths: imagePaths.length > 0 ? imagePaths : undefined,
                initialDraftName: filterProject !== 'all' ? filterProject : 'FlowStudio_Draft',
              });
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#F0F3FF] text-[#1A0A4A] border border-[#C4CEFF] hover:border-[#5F2CFF] transition-all flex items-center gap-2 shadow-sm"
            title="Tạo bản nháp CapCut từ các ảnh trong danh sách hiện tại"
          >
            <Film className="w-3.5 h-3.5 text-[#5F2CFF]" />
            <span>Tạo CapCut Draft</span>
          </button>

          {/* Sync from Google Flow Button */}
          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#5F2CFF] via-[#7B52FF] to-[#9B7AFF] hover:from-[#7B52FF] hover:to-[#9B7AFF] text-white shadow-lg shadow-[#5F2CFF]/20 transition-all flex items-center gap-2"
          >
            <CloudDownload className="w-4 h-4 animate-bounce" />
            <span>Đồng bộ từ Google Flow</span>
          </button>
        </div>
      </div>

      {/* Top Controls & Filtering Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-[#E2E6FF] shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter Type Pills */}
          {(['all', 'image', 'video'] as const).map((t) => {
            const isActive = filterType === t;
            return (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${isActive
                    ? 'bg-[#5F2CFF] text-white shadow-sm'
                    : 'bg-white text-[#4A4070] hover:text-[#1A0A4A] border border-[#E2E6FF]'
                  }`}
              >
                {t === 'all' ? 'Tất cả' : t === 'image' ? 'Ảnh' : 'Video'}
              </button>
            );
          })}

          {/* Filter Project Dropdown */}
          {uniqueProjects.length > 0 && (
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-[#4A4070] border border-[#E2E6FF] focus:outline-none focus:border-[#5F2CFF]"
            >
              <option value="all">📁 Tất cả dự án ({uniqueProjects.length})</option>
              {uniqueProjects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-[#4A4070] border border-[#E2E6FF] focus:outline-none focus:border-[#5F2CFF]"
            title="Thứ tự hiển thị ảnh"
          >
            <option value="index_asc">🔢 Thứ tự dự án (#1 → #160)</option>
            <option value="date_desc">🕒 Mới nhất trước</option>
            <option value="date_asc">🕒 Cũ nhất trước</option>
            <option value="name_asc">🔤 Tên file (A → Z)</option>
          </select>

          <button
            onClick={() => loadOutputs()}
            className="p-1.5 rounded-lg bg-white border border-[#E2E6FF] shadow-sm text-[#4A4070] hover:text-[#1A0A4A] transition-colors"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#5F2CFF]' : ''}`} />
          </button>

          {/* View Mode Toggle (Grid / List) */}
          <div className="flex items-center p-0.5 rounded-lg bg-white border border-[#E2E6FF] shadow-sm">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid'
                  ? 'bg-[#5F2CFF] text-white shadow-sm'
                  : 'text-[#4A4070] hover:text-[#1A0A4A]'
                }`}
              title="Chế độ Lưới (Grid)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list'
                  ? 'bg-[#5F2CFF] text-white shadow-sm'
                  : 'text-[#4A4070] hover:text-[#1A0A4A]'
                }`}
              title="Chế độ Danh sách (List)"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[260px]">
          <Search className="w-3.5 h-3.5 text-[#8B85B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo prompt, tên file, dự án..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-xs text-[#1A0A4A] placeholder:text-[#8B85B8] focus:outline-none focus:border-[#5F2CFF]"
          />
        </div>
      </div>

      {/* Media Grid or List */}
      {filteredOutputs.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center text-[#8B85B8] text-xs rounded-2xl border border-dashed border-[#E2E6FF] space-y-3">
          <ImageIcon className="w-10 h-10 text-[#4A4070] opacity-60" />
          <div className="space-y-1">
            <p className="font-semibold text-[#4A4070]">Chưa có file output nào trong thư viện.</p>
            <p className="text-[11px] text-[#8B85B8]">
              Hãy tạo ảnh mới hoặc bấm <span className="text-[#5F2CFF] font-bold">"Đồng bộ từ Google Flow"</span> để tải tất cả ảnh từ tài khoản web về máy!
            </p>
          </div>
          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#5F2CFF]/15 hover:bg-[#5F2CFF]/20 text-[#7B52FF] border border-[#5F2CFF]/25 transition-all flex items-center gap-1.5"
          >
            <CloudDownload className="w-3.5 h-3.5" />
            <span>Mở tính năng đồng bộ</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredOutputs.map((item) => {
            const isImage = item.type === 'image';
            return (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="group rounded-2xl border border-[#E2E6FF] bg-white overflow-hidden hover:border-[#C4CEFF] hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between"
              >
                {/* Media Preview Box */}
                <div className="aspect-video bg-[#F4F6FF] relative overflow-hidden flex items-center justify-center border-b border-[#E2E6FF]">
                  {isImage ? (
                    <SafeImage
                      path={item.path}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-[#EDF9FF] to-white text-[#7B52FF] gap-2">
                      <VideoIcon className="w-8 h-8 opacity-80 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-mono font-bold tracking-wider">MP4 VIDEO</span>
                    </div>
                  )}

                  <span
                    className={`absolute top-2 left-2 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider backdrop-blur-md ${isImage
                        ? 'bg-[#F0F3FF]/80 text-[#7B52FF] border border-[#5F2CFF]/25'
                        : 'bg-[#F0F3FF]/80 text-[#9B7AFF] border border-[#7B52FF]/25'
                      }`}
                  >
                    {item.type}
                  </span>

                  {item.batchIndex !== undefined && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 border border-emerald-200 backdrop-blur-md">
                      #{item.batchIndex}
                    </span>
                  )}

                  {item.projectName && (
                    <span className="absolute bottom-2 left-2 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#F4F6FF]/80 text-[#4A4070] border border-[#E2E6FF] backdrop-blur-md truncate max-w-[140px]">
                      📁 {item.projectName}
                    </span>
                  )}

                  {item.size < 1024 && (
                    <span
                      className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 backdrop-blur-md"
                      title="File nhỏ (<1KB)"
                    >
                      ⚠️ &lt;1KB
                    </span>
                  )}
                </div>

                {/* Info & Metadata */}
                <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[#1A0A4A] truncate" title={item.name}>
                      {item.name}
                    </p>
                    <p className="text-[11px] text-[#4A4070] line-clamp-2 leading-relaxed">
                      {item.prompt || 'Không có prompt'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#E2E6FF]/60 flex items-center justify-between text-[10px] text-[#8B85B8] font-mono">
                    <span>{formatFileSize(item.size)}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openFile(item.path)}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#5F2CFF]/15 hover:bg-[#5F2CFF]/20 text-[#7B52FF] border border-[#5F2CFF]/25 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Mở File</span>
                    </button>
                    <button
                      onClick={() => revealInExplorer(item.path)}
                      className="p-1.5 rounded-lg bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#4A4070] hover:text-[#1A0A4A] border border-[#C4CEFF] transition-colors"
                      title="Hiện trong File Explorer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSingle(item)}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 transition-colors"
                      title="Xóa file này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="rounded-2xl border border-[#E2E6FF] bg-white overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E6FF] bg-white/80 text-[11px] font-bold text-[#4A4070] uppercase tracking-wider">
                  <th className="py-3 px-4 w-16 text-center">Xem</th>
                  <th className="py-3 px-4 min-w-[200px]">Tên tệp & Dự án</th>
                  <th className="py-3 px-4 w-24">Loại</th>
                  <th className="py-3 px-4 min-w-[280px]">Prompt</th>
                  <th className="py-3 px-4 w-28">Kích thước</th>
                  <th className="py-3 px-4 w-28">Ngày tạo</th>
                  <th className="py-3 px-4 w-32 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E6FF] text-xs text-[#4A4070]">
                {filteredOutputs.map((item) => {
                  const isImage = item.type === 'image';
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="hover:bg-[#F0F3FF]/40 transition-colors cursor-pointer group"
                    >
                      {/* Thumbnail */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="w-12 h-9 mx-auto rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] overflow-hidden flex items-center justify-center shrink-0">
                          {isImage ? (
                            <SafeImage
                              path={item.path}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <VideoIcon className="w-4 h-4 text-[#7B52FF]" />
                          )}
                        </div>
                      </td>

                      {/* Name & Project */}
                      <td className="py-2.5 px-4">
                        <div className="space-y-1">
                          <div className="font-semibold text-[#1A0A4A] truncate max-w-xs group-hover:text-[#7B52FF] transition-colors" title={item.name}>
                            {item.name}
                          </div>
                          {item.projectName && (
                            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.2 rounded bg-[#F4F6FF] text-[#4A4070] border border-[#E2E6FF]">
                              📁 {item.projectName}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-2.5 px-4">
                        <span
                          className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${isImage
                              ? 'bg-[#F0F3FF]/80 text-[#7B52FF] border border-[#5F2CFF]/25'
                              : 'bg-[#F0F3FF]/80 text-[#9B7AFF] border border-[#7B52FF]/25'
                            }`}
                        >
                          {item.type}
                        </span>
                      </td>

                      {/* Prompt */}
                      <td className="py-2.5 px-4 max-w-md">
                        <p className="text-[11px] text-[#4A4070] line-clamp-2 leading-relaxed" title={item.prompt}>
                          {item.prompt || <span className="italic text-[#4A4070]">Không có prompt</span>}
                        </p>
                      </td>

                      {/* Size */}
                      <td className="py-2.5 px-4 font-mono text-[11px] text-[#4A4070]">
                        <div className="flex items-center gap-1.5">
                          <span>{formatFileSize(item.size)}</span>
                          {item.size < 1024 && (
                            <span className="text-[9px] font-bold px-1 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              &lt;1KB
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-2.5 px-4 font-mono text-[11px] text-[#4A4070]">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openFile(item.path)}
                            className="p-1.5 rounded-lg bg-[#5F2CFF]/15 hover:bg-[#5F2CFF]/20 text-[#7B52FF] border border-[#5F2CFF]/25 transition-colors"
                            title="Mở file ngoài"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => revealInExplorer(item.path)}
                            className="p-1.5 rounded-lg bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#4A4070] hover:text-[#1A0A4A] border border-[#C4CEFF] transition-colors"
                            title="Hiện trong File Explorer"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSingle(item)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 transition-colors"
                            title="Xóa file này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 1: ĐỒNG BỘ TỪ GOOGLE FLOW (SYNC WEB MEDIA)               */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-white border border-[#E2E6FF] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#E2E6FF] flex items-center justify-between bg-gradient-to-r from-[#EDF9FF]/40 via-[#EDF9FF]/30 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#5F2CFF]/15 border border-[#5F2CFF]/25 text-[#5F2CFF]">
                  <CloudDownload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1A0A4A] flex items-center gap-2">
                    Đồng bộ ảnh từ Google Flow về máy
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-500/20">
                      Tự động chống trùng
                    </span>
                  </h3>
                  <p className="text-xs text-[#4A4070]">
                    Tải toàn bộ hình ảnh trong tài khoản web về máy và áp dụng quy tắc đặt tên tự động.
                  </p>
                </div>
              </div>
              {!isSyncing && (
                <button
                  onClick={() => setIsSyncModalOpen(false)}
                  className="text-[#4A4070] hover:text-[#1A0A4A] p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Session Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#4A4070] flex items-center justify-between">
                  <span>Phiên làm việc (Session) đã đăng nhập Google:</span>
                  <span className="text-[11px] text-[#8B85B8]">Dùng cookie để tải ảnh gốc</span>
                </label>
                <select
                  disabled={isSyncing}
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF] disabled:opacity-50"
                >
                  {sessions.map((s) => {
                    const statusText =
                      s.status === 'ready'
                        ? '🟢 Sẵn sàng (Đã đăng nhập)'
                        : s.status === 'paused'
                          ? '⏸️ Đã tạm dừng'
                          : s.status === 'auth_required'
                            ? '⚠️ Cần đăng nhập'
                            : s.status;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} — {statusText}
                      </option>
                    );
                  })}
                </select>
                {(() => {
                  const curr = sessions.find((s) => s.id === selectedSessionId);
                  if (curr && curr.status !== 'ready') {
                    return (
                      <p className="text-[11px] text-amber-700/90 flex items-center gap-1 mt-1">
                        ⚠️ Phiên "{curr.name}" chưa ở trạng thái Sẵn sàng ({curr.status}). Nếu quét không thấy dự án, hãy vào tab Cài đặt mở trình duyệt và đăng nhập.
                      </p>
                    );
                  }
                  if (curr) {
                    return (
                      <p className="text-[11px] text-emerald-600/80 flex items-center gap-1 mt-1">
                        ✓ Đang sử dụng tài khoản: <b>{curr.name}</b>
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Scope Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#4A4070]">Phạm vi quét ảnh:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={isSyncing}
                    onClick={() => setSyncScope('all_projects')}
                    className={`p-3 rounded-xl border text-left transition-all ${syncScope === 'all_projects'
                        ? 'bg-[#5F2CFF]/10 border-[#5F2CFF]/50 text-[#7B52FF]'
                        : 'bg-white border-[#E2E6FF] text-[#4A4070] hover:text-[#1A0A4A]'
                      }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#5F2CFF]" />
                      <span>Tất cả các Dự án trên Web</span>
                    </div>
                    <p className="text-[10px] text-[#8B85B8] mt-1">
                      Quét và tải ảnh từ tất cả project trong tài khoản Google Flow.
                    </p>
                  </button>

                  <button
                    disabled={isSyncing}
                    onClick={() => setSyncScope('current_project')}
                    className={`p-3 rounded-xl border text-left transition-all ${syncScope === 'current_project'
                        ? 'bg-[#5F2CFF]/10 border-[#5F2CFF]/50 text-[#7B52FF]'
                        : 'bg-white border-[#E2E6FF] text-[#4A4070] hover:text-[#1A0A4A]'
                      }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <FolderSync className="w-3.5 h-3.5 text-[#5F2CFF]" />
                      <span>Dự án hiện tại</span>
                    </div>
                    <p className="text-[10px] text-[#8B85B8] mt-1">
                      Chỉ quét và tải ảnh trong trang dự án đang mở hiện tại.
                    </p>
                  </button>
                </div>
              </div>

              {/* Project Picker (only when scope = all_projects) */}
              {syncScope === 'all_projects' && !isSyncing && (
                <div className="rounded-xl border border-[#E2E6FF] bg-white/50 overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-2.5 border-b border-[#E2E6FF] flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A0A4A] flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#5F2CFF]" />
                      Danh sách dự án trên web
                    </span>
                    <button
                      onClick={handleScanProjects}
                      disabled={isScanningProjects}
                      className="px-3 py-1 rounded-lg text-[11px] font-bold bg-[#5F2CFF]/15 hover:bg-[#5F2CFF]/20 text-[#7B52FF] border border-[#5F2CFF]/25 transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isScanningProjects ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Search className="w-3 h-3" />
                      )}
                      <span>{isScanningProjects ? 'Đang quét...' : hasScannedProjects ? 'Quét lại' : 'Quét dự án'}</span>
                    </button>
                  </div>

                  {/* Project list body */}
                  <div className="p-3">
                    {!hasScannedProjects && !isScanningProjects && (
                      <div className="py-4 text-center text-[11px] text-[#8B85B8]">
                        <Layers className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                        <p>Nhấn <b className="text-[#5F2CFF]">Quét dự án</b> để tải danh sách từ Google Flow.</p>
                        <p className="text-[10px] mt-0.5 text-[#4A4070]">Trình duyệt sẽ mở lên trong vài giây.</p>
                      </div>
                    )}

                    {isScanningProjects && (
                      <div className="py-4 text-center text-[11px] text-[#7B52FF] flex flex-col items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Đang mở trình duyệt và quét danh sách dự án...</span>
                      </div>
                    )}

                    {projectScanError && (
                      <div className="py-2.5 px-3 rounded-lg bg-red-950/30 border border-red-500/20 text-[11px] text-red-300 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{projectScanError}</span>
                      </div>
                    )}

                    {discoveredProjects.length === 1 && (
                      /* Single project — show info only */
                      <div className="flex items-center gap-2 py-2 px-1 text-xs text-[#4A4070]">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>Tìm thấy <b className="text-[#1A0A4A]">1 dự án</b>: {discoveredProjects[0].name}</span>
                        <span className="ml-auto text-[10px] text-emerald-600 font-semibold">Sẽ đồng bộ toàn bộ</span>
                      </div>
                    )}

                    {discoveredProjects.length > 1 && (
                      <div className="space-y-1.5">
                        {/* Select all / deselect all */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-[#E2E6FF]">
                          <span className="text-[11px] text-[#4A4070]">
                            Đã chọn <b className="text-[#1A0A4A]">{selectedProjectNames.size}</b> / {discoveredProjects.length} dự án
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSelectedProjectNames(new Set(discoveredProjects.map((p) => p.name)))}
                              className="text-[10px] px-2 py-0.5 rounded bg-[#5F2CFF]/15 hover:bg-[#5F2CFF]/20 text-[#7B52FF] border border-[#5F2CFF]/20 transition-all"
                            >
                              Chọn tất cả
                            </button>
                            <button
                              onClick={() => setSelectedProjectNames(new Set())}
                              className="text-[10px] px-2 py-0.5 rounded bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#4A4070] border border-[#C4CEFF] transition-all"
                            >
                              Bỏ chọn
                            </button>
                          </div>
                        </div>

                        {/* Project checkboxes */}
                        <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
                          {discoveredProjects.map((proj) => {
                            const isSelected = selectedProjectNames.has(proj.name);
                            return (
                              <button
                                key={proj.name}
                                onClick={() => toggleProjectSelection(proj.name)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left ${isSelected
                                    ? 'bg-[#5F2CFF]/15 border border-[#5F2CFF]/25 text-[#7B52FF]'
                                    : 'bg-[#F4F6FF]/50 border border-[#E2E6FF]/60 text-[#4A4070] hover:text-[#1A0A4A] hover:border-[#C4CEFF]'
                                  }`}
                              >
                                <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-all ${isSelected
                                    ? 'bg-[#5F2CFF] border-[#5F2CFF]'
                                    : 'border-[#8B7AB8] bg-transparent'
                                  }`}>
                                  {isSelected && <Check className="w-2.5 h-2.5 text-[#1A0A4A]" />}
                                </div>
                                <span className="text-xs font-medium truncate flex-1">{proj.name}</span>
                                {isSelected && (
                                  <span className="text-[9px] font-bold text-[#5F2CFF] uppercase tracking-wide flex-shrink-0">✓ Chọn</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Batch Naming Pattern Box */}
              <div className="p-4 rounded-xl bg-[#F0F3FF]/80 border border-[#E2E6FF] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A0A4A] flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[#5F2CFF]" />
                    <span>Quy tắc đặt tên file tự động (Batch Naming Pattern)</span>
                  </span>
                  <span className="text-[10px] text-emerald-600 font-mono font-semibold">Tự đánh số tránh trùng</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Pattern select */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4A4070]">Định dạng mẫu:</label>
                    <select
                      disabled={isSyncing}
                      value={namingConfig.pattern}
                      onChange={(e) => setNamingConfig({ ...namingConfig, pattern: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                    >
                      <option value="prefix_date_index">&#123;Tiền_tố&#125;_&#123;Ngày&#125;_&#123;Số&#125;</option>
                      <option value="prefix_index">&#123;Tiền_tố&#125;_&#123;Số&#125;</option>
                      <option value="project_index">&#123;Dự_án&#125;_&#123;Số&#125;</option>
                      <option value="date_index">&#123;Ngày&#125;_&#123;Số&#125;</option>
                    </select>
                  </div>

                  {/* Prefix input */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4A4070]">Tiền tố (Prefix):</label>
                    <input
                      disabled={isSyncing}
                      type="text"
                      value={namingConfig.prefix || ''}
                      onChange={(e) => setNamingConfig({ ...namingConfig, prefix: e.target.value })}
                      placeholder="vd: Chibi, Anime, Flow..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                    />
                  </div>

                  {/* Start Number */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4A4070]">Số bắt đầu:</label>
                    <input
                      disabled={isSyncing}
                      type="number"
                      min={1}
                      value={namingConfig.startNumber}
                      onChange={(e) => setNamingConfig({ ...namingConfig, startNumber: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                    />
                  </div>

                  {/* Digits Padding */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4A4070]">Định dạng số chữ số:</label>
                    <select
                      disabled={isSyncing}
                      value={namingConfig.digits}
                      onChange={(e) => setNamingConfig({ ...namingConfig, digits: parseInt(e.target.value) || 3 })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                    >
                      <option value={2}>2 chữ số (01, 02...)</option>
                      <option value={3}>3 chữ số (001, 002...)</option>
                      <option value={4}>4 chữ số (0001, 0002...)</option>
                    </select>
                  </div>
                </div>

                {/* Live Preview Bar */}
                <div className="p-2.5 rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] flex items-center gap-2 text-xs">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Xem trước mẫu:</span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-600 overflow-x-auto">
                    {getPreviewNames(3).map((name, i) => (
                      <span key={i} className="bg-white px-1.5 py-0.5 rounded border border-[#E2E6FF]">
                        {name}
                      </span>
                    ))}
                    <span className="text-[#4A4070] font-sans">...</span>
                  </div>
                </div>
              </div>

              {/* Progress Box (When syncing) */}
              {isSyncing && syncProgress && (
                <div className="p-4 rounded-xl bg-[#F0F3FF]/30 border border-[#5F2CFF]/25 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-[#5F2CFF] animate-spin" />
                      <span className="font-bold text-[#7B52FF]">{syncProgress.message}</span>
                    </div>
                    <span className="font-mono text-[#7B52FF] font-bold">
                      Đã tải: {syncProgress.downloadedCount} | Bỏ qua: {syncProgress.skippedCount}
                    </span>
                  </div>

                  {syncProgress.currentProject && (
                    <div className="text-[11px] text-[#4A4070] flex items-center gap-2">
                      <span>Dự án: <b className="text-[#1A0A4A]">{syncProgress.currentProject}</b></span>
                      {syncProgress.currentFile && <span>• Tệp: <b className="text-[#1A0A4A] font-mono">{syncProgress.currentFile}</b></span>}
                    </div>
                  )}
                </div>
              )}

              {/* Completed Message */}
              {!isSyncing && syncProgress && syncProgress.status === 'completed' && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-700">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <span>{syncProgress.message}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#E2E6FF] bg-white/50 flex items-center justify-between">
              <span className="text-[11px] text-[#8B85B8]">
                ⚡ Tải nền nhanh (~100ms/ảnh), tự động bỏ qua các ảnh đã có trên máy.
              </span>

              <div className="flex items-center gap-2">
                {isSyncing ? (
                  <button
                    onClick={handleCancelSync}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-200"
                  >
                    Dừng đồng bộ
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setIsSyncModalOpen(false);
                        // Reset scan state when closing
                        setDiscoveredProjects([]);
                        setSelectedProjectNames(new Set());
                        setHasScannedProjects(false);
                        setProjectScanError(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#4A4070] border border-[#C4CEFF]"
                    >
                      Đóng
                    </button>
                    <button
                      onClick={handleStartSync}
                      disabled={
                        syncScope === 'all_projects' &&
                        discoveredProjects.length > 1 &&
                        selectedProjectNames.size === 0
                      }
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-[#5F2CFF] hover:bg-[#7B52FF] disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-md flex items-center gap-1.5 transition-all"
                    >
                      <CloudDownload className="w-3.5 h-3.5" />
                      <span>
                        {syncScope === 'all_projects' && discoveredProjects.length > 1 && selectedProjectNames.size > 0
                          ? `Đồng bộ ${selectedProjectNames.size} dự án`
                          : 'Bắt đầu Đồng bộ'}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 2: ĐẶT TÊN HÀNG LOẠT (BATCH RENAME EXISTING OUTPUTS)    */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-xl bg-white border border-[#E2E6FF] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[#E2E6FF] flex items-center justify-between bg-gradient-to-r from-sky-50 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-700">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1A0A4A]">Đổi tên hàng loạt các ảnh đã có</h3>
                  <p className="text-xs text-[#4A4070]">
                    Chuẩn hóa tên toàn bộ file trong thư mục output theo quy tắc và tự tăng số để tránh trùng.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsRenameModalOpen(false)} className="text-[#4A4070] hover:text-[#1A0A4A] p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Target Project */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#4A4070]">Áp dụng cho dự án:</label>
                <select
                  value={renameTargetProject}
                  onChange={(e) => setRenameTargetProject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                >
                  <option value="all">📁 Tất cả các dự án ({outputs.length} file)</option>
                  {uniqueProjects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Naming configuration */}
              <div className="p-4 rounded-xl bg-[#F0F3FF]/80 border border-[#E2E6FF] space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4A4070]">Định dạng mẫu:</label>
                    <select
                      value={namingConfig.pattern}
                      onChange={(e) => setNamingConfig({ ...namingConfig, pattern: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                    >
                      <option value="prefix_date_index">&#123;Tiền_tố&#125;_&#123;Ngày&#125;_&#123;Số&#125;</option>
                      <option value="prefix_index">&#123;Tiền_tố&#125;_&#123;Số&#125;</option>
                      <option value="project_index">&#123;Dự_án&#125;_&#123;Số&#125;</option>
                      <option value="date_index">&#123;Ngày&#125;_&#123;Số&#125;</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4A4070]">Tiền tố (Prefix):</label>
                    <input
                      type="text"
                      value={namingConfig.prefix || ''}
                      onChange={(e) => setNamingConfig({ ...namingConfig, prefix: e.target.value })}
                      placeholder="vd: Chibi, Product..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4A4070]">Số bắt đầu:</label>
                    <input
                      type="number"
                      min={1}
                      value={namingConfig.startNumber}
                      onChange={(e) => setNamingConfig({ ...namingConfig, startNumber: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4A4070]">Độ dài số:</label>
                    <select
                      value={namingConfig.digits}
                      onChange={(e) => setNamingConfig({ ...namingConfig, digits: parseInt(e.target.value) || 3 })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                    >
                      <option value={2}>2 chữ số (01, 02...)</option>
                      <option value={3}>3 chữ số (001, 002...)</option>
                      <option value={4}>4 chữ số (0001, 0002...)</option>
                    </select>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#F4F6FF] border border-[#E2E6FF] flex items-center gap-2 text-xs">
                  <span className="text-[10px] font-bold text-sky-700 uppercase">Mẫu sau đổi tên:</span>
                  <span className="font-mono text-emerald-600 text-[11px]">
                    {getPreviewNames(1)[0]}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#E2E6FF] bg-white/50 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsRenameModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#4A4070] border border-[#C4CEFF]"
              >
                Hủy
              </button>
              <button
                disabled={isRenaming}
                onClick={handleApplyBatchRename}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-[#1A0A4A] shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isRenaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Áp dụng đổi tên</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 3: XEM CHI TIẾT 1 FILE MEDIA                            */}
      {/* ───────────────────────────────────────────────────────────── */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-3xl bg-white border border-[#E2E6FF] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-[#E2E6FF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded uppercase font-extrabold ${selectedItem.type === 'video'
                      ? 'bg-[#7B52FF]/10 text-[#7B52FF] border border-[#7B52FF]/20'
                      : 'bg-[#5F2CFF]/10 text-[#5F2CFF] border border-[#5F2CFF]/20'
                    }`}
                >
                  {selectedItem.type}
                </span>
                <h3 className="text-sm font-bold text-[#1A0A4A] truncate max-w-md">{selectedItem.name}</h3>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-[#4A4070] hover:text-[#1A0A4A] p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="rounded-xl bg-[#F4F6FF] border border-[#E2E6FF] overflow-hidden flex items-center justify-center max-h-[420px]">
                {selectedItem.type === 'image' ? (
                  <SafeImage
                    path={selectedItem.path}
                    alt={selectedItem.name}
                    className="max-h-[400px] w-auto object-contain"
                  />
                ) : (
                  <video
                    src={toMediaUrl(selectedItem.path)}
                    controls
                    className="max-h-[400px] w-full"
                  />
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-[#E2E6FF] shadow-sm space-y-1">
                <span className="text-[10px] font-bold text-[#8B85B8] uppercase">PROMPT</span>
                <p className="text-xs text-[#1A0A4A] leading-relaxed">{selectedItem.prompt}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-white border border-[#E2E6FF] shadow-sm">
                  <span className="text-[10px] text-[#8B85B8] block">Dung lượng:</span>
                  <span className="font-semibold text-[#1A0A4A]">{formatFileSize(selectedItem.size)}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-[#E2E6FF] shadow-sm">
                  <span className="text-[10px] text-[#8B85B8] block">Dự án:</span>
                  <span className="font-semibold text-[#1A0A4A]">{selectedItem.projectName}</span>
                </div>
                <div className="col-span-2 p-2.5 rounded-lg bg-white border border-[#E2E6FF] shadow-sm font-mono text-[10px] text-[#4A4070] truncate">
                  <span className="text-[10px] text-[#8B85B8] block font-sans">Đường dẫn tệp:</span>
                  {selectedItem.path}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#E2E6FF] bg-white/50 flex items-center justify-between gap-3">
              <button
                onClick={() => handleDeleteSingle(selectedItem)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/25 flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa file này</span>
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => revealInExplorer(selectedItem.path)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#1A0A4A] border border-[#C4CEFF] flex items-center gap-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Mở trong Thư mục</span>
                </button>
                <button
                  onClick={() => openFile(selectedItem.path)}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#5F2CFF] hover:bg-[#7B52FF] text-white shadow-md flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mở tệp ngoài</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
