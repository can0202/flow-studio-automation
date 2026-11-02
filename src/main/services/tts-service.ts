import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { BrowserWindow } from 'electron';

export interface TTSVoice {
  id: string;
  name: string;
  label: string;
  desc?: string;
  gender: 'male' | 'female';
  region?: string;
}

export interface TTSGenerateOptions {
  text: string;
  voice: string;
  speed?: number;
  outputName?: string;
  refAudioPath?: string; // Optional for instant voice cloning
}

export interface TTSGenerateResult {
  success: boolean;
  filePath?: string;
  duration?: number;
  error?: string;
}

class TTSService {
  private serverProcess: ChildProcess | null = null;
  private port = 58231;
  private isStarting = false;
  private isReady = false;

  private getLocalCatalogVoices(): TTSVoice[] {
    const candidates = [
      path.join(__dirname, 'assets', 'voices_all_catalog.json'),
      path.join(__dirname, '..', 'assets', 'voices_all_catalog.json'),
      path.join(process.cwd(), 'dist', 'main', 'assets', 'voices_all_catalog.json'),
      path.join(process.cwd(), 'src', 'main', 'assets', 'voices_all_catalog.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data) && data.length > 0) {
            return data;
          }
        } catch (e) {
          console.warn('[TTSService] Error reading local voices catalog:', e);
        }
      }
    }
    return [];
  }

  public async getVoices(): Promise<{ voices: TTSVoice[]; hasGpu: boolean }> {
    // 1. Kích hoạt Python server ngầm (không block luồng trả về danh sách giọng)
    if (!this.isReady && !this.isStarting) {
      this.ensureServerStarted().catch((err) => {
        console.warn('[TTSService] Background server startup notification:', err.message);
      });
    }

    // 2. Nếu server đã sẵn sàng, lấy danh sách cập nhật từ server
    if (this.isReady) {
      try {
        const res = await this.httpRequest('/voices');
        if (res && Array.isArray(res.voices) && res.voices.length > 0) {
          return res;
        }
      } catch (err: any) {
        console.warn('[TTSService] Failed to get voices from active server, using local catalog:', err.message);
      }
    }

    // 3. Phản hồi tức thì (<5ms) từ Catalog tĩnh đã chuẩn hóa sẵn
    const localVoices = this.getLocalCatalogVoices();
    return {
      voices: localVoices,
      hasGpu: false,
    };
  }

  public async generateAudio(options: TTSGenerateOptions, outputDir: string): Promise<TTSGenerateResult> {
    await this.ensureServerStarted();
    try {
      const res = await this.httpRequest('/generate', 'POST', {
        ...options,
        outputDir,
      });
      return res;
    } catch (err: any) {
      console.error('[TTSService] Generate failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  
  public async previewVoice(voice: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    await this.ensureServerStarted();
    try {
      const res = await this.httpRequest('/preview', 'POST', { voice });
      return res;
    } catch (err: any) {
      console.error('[TTSService] Preview failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  public async addVoice(options: {
    name: string;
    audioPath: string;
    gender: 'male' | 'female';
    region?: string;
    style?: string;
  }): Promise<{ success: boolean; name?: string; desc?: string; error?: string }> {
    await this.ensureServerStarted();
    try {
      const res = await this.httpRequest('/voices/add', 'POST', options);
      return res;
    } catch (err: any) {
      console.error('[TTSService] Add voice failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  public async checkHealth(): Promise<{ running: boolean; hasGpu: boolean }> {
    try {
      const res = await this.httpRequest('/health');
      return { running: res.status === 'ok', hasGpu: res.hasGpu || false };
    } catch {
      return { running: false, hasGpu: false };
    }
  }

  private async ensureServerStarted(): Promise<void> {
    if (this.isReady) {
      const health = await this.checkHealth();
      if (health.running) return;
      this.isReady = false;
    }

    if (this.isStarting) {
      // Wait for it to become ready
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (this.isReady) return;
      }
    }

    this.isStarting = true;
    const scriptPath = path.join(__dirname, 'vieneu_server.py');
    console.log('[TTSService] Starting VieNeu Python server:', scriptPath);

    this.serverProcess = spawn('python', ['-u', scriptPath, '--port', String(this.port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', HF_HUB_OFFLINE: '1' },
    });

    // ── Parse [PROGRESS] lines from stdout and emit to all renderer windows ──
    this.serverProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const progressMatch = trimmed.match(/^\[PROGRESS\]\s*(\d+)\/(\d+)/);
        if (progressMatch) {
          const done = parseInt(progressMatch[1], 10);
          const total = parseInt(progressMatch[2], 10);
          const percent = total > 0 ? Math.round((done / total) * 100) : 0;
          // Broadcast to all focused/open renderer windows
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('tts:progress', { done, total, percent });
            }
          });
        } else {
          console.log(`[VieNeu-Server] ${trimmed}`);
        }
      }
    });

    this.serverProcess.stderr?.on('data', (data) => {
      console.warn(`[VieNeu-Server] ${data.toString().trim()}`);
    });

    this.serverProcess.on('exit', (code) => {
      console.log(`[VieNeu-Server] Exited with code ${code}`);
      this.isReady = false;
      this.isStarting = false;
      this.serverProcess = null;
    });

    // Poll until ready (up to 60s)
    const startTime = Date.now();
    while (Date.now() - startTime < 60000) {
      await new Promise((r) => setTimeout(r, 800));
      const health = await this.checkHealth();
      if (health.running) {
        this.isReady = true;
        this.isStarting = false;
        console.log('[TTSService] VieNeu server is ready on port', this.port);
        return;
      }
    }

    this.isStarting = false;
    throw new Error('VieNeu Python server không thể khởi động sau 60 giây.');
  }

  private httpRequest(endpoint: string, method = 'GET', body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : '';
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path: endpoint,
          method,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 120000, // 2 minutes max for long speech synthesis
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ text: data });
            }
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Yêu cầu xử lý âm thanh quá thời gian (timeout 2 phút).'));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  public stop(): void {
    if (this.serverProcess) {
      try {
        this.serverProcess.kill();
      } catch {}
      this.serverProcess = null;
      this.isReady = false;
    }
  }
}

export const ttsService = new TTSService();

