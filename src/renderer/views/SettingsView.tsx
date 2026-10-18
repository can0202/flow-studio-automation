import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/app-store.ts';
import {
  Sliders,
  Folder,
  Zap,
  RotateCw,
  Globe,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, addNotification } = useAppStore();

  const [concurrency, setConcurrency] = useState(1);
  const [maxRetries, setMaxRetries] = useState(3);
  const [outputDir, setOutputDir] = useState('');
  const [projectName, setProjectName] = useState('FlowStudioProject');
  const [flowUrl, setFlowUrl] = useState('');
  const [simulationMode, setSimulationMode] = useState(true);

  useEffect(() => {
    if (settings) {
      setConcurrency(settings.concurrencyLimit);
      setMaxRetries(settings.defaultMaxRetries);
      setOutputDir(settings.outputDir);
      setProjectName(settings.defaultProjectName);
      setFlowUrl(settings.flowUrl);
      setSimulationMode(settings.simulationMode);
    }
  }, [settings]);

  const handleSave = async () => {
    await updateSettings({
      concurrencyLimit: concurrency,
      defaultMaxRetries: maxRetries,
      outputDir: outputDir.trim(),
      defaultProjectName: projectName.trim(),
      flowUrl: flowUrl.trim(),
      simulationMode,
    });
  };

  const handleBrowseFolder = async () => {
    const selected = await window.api.selectFolder();
    if (selected) {
      setOutputDir(selected);
    }
  };

  return (
    <div className="p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)] max-w-4xl">
      {/* Simulation Mode Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-950/30 via-slate-900 to-indigo-950/30 border border-amber-500/30 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
              <Zap className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Chế độ giả lập (Simulation Mode)</h3>
              <p className="text-xs text-slate-400">
                Sử dụng Mock Provider để kiểm thử queue, concurrency, retry, dependency và phục hồi sau crash mà không cần gửi request tới Google Flow.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={simulationMode}
              onChange={(e) => setSimulationMode(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>
      </div>

      {/* Main Settings Form */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-6">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span>Cấu hình Hệ thống & Queue</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Output Directory */}
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              Thư mục lưu Output (Local Output Directory)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleBrowseFolder}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 shrink-0"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Chọn Thư Mục</span>
              </button>
            </div>
          </div>

          {/* Concurrency Limit */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              Giới hạn số job chạy song song (Concurrency Limit)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              Mặc định mỗi session chỉ chạy 1 job tại một thời điểm.
            </span>
          </div>

          {/* Default Max Retries */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              Số lần thử lại tối đa (Max Retries)
            </label>
            <input
              type="number"
              min={0}
              max={10}
              value={maxRetries}
              onChange={(e) => setMaxRetries(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              Thử lại với exponential backoff khi gặp lỗi tạm thời (mạng, timeout).
            </span>
          </div>

          {/* Default Project Name */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">Tên Project Mặc Định</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Google Flow URL */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">Google Flow URL</label>
            <input
              type="text"
              value={flowUrl}
              onChange={(e) => setFlowUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Lưu Cài Đặt</span>
          </button>
        </div>
      </div>

      {/* Safety & Architecture Summary */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Local MVP Architecture & Compliance</span>
        </h3>
        <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
          <li>Chạy hoàn toàn local trên Windows, dữ liệu lưu trong SQLite và thư mục máy tính của bạn.</li>
          <li>Preload an toàn với Context Isolation, không để renderer can thiệp Node.js.</li>
          <li>Không lưu mật khẩu Google, không bypass CAPTCHA/2FA, không xuất cookie tùy tiện.</li>
          <li>Tự động ngắt worker khi tài khoản chạm ngưỡng quota để bảo vệ tài khoản.</li>
        </ul>
      </div>
    </div>
  );
};
