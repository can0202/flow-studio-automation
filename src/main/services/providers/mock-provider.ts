import path from 'path';
import fs from 'fs';
import type { Job, Session } from '../../../shared/types.ts';
import type { FlowProvider, GenerationProgress, GenerationResult } from './provider.interface.ts';
import type { OutputManager } from '../output-manager.ts';

export class MockProvider implements FlowProvider {
  public name = 'Mock Provider (Simulation)';
  private outputManager: OutputManager;

  constructor(outputManager: OutputManager) {
    this.outputManager = outputManager;
  }

  public async generate(
    job: Job,
    session: Session,
    onProgress: (progress: GenerationProgress) => void
  ): Promise<GenerationResult> {
    const projectName = (job.metadata?.projectName as string) || 'FlowStudioProject';
    const { imagesDir, videosDir } = this.outputManager.getProjectDirs(projectName);

    onProgress({ progress: 10, stage: 'starting', message: `Khởi tạo worker giả lập cho ${session.name}...` });
    await this.delay(400);

    // Test quota scenario
    if (job.prompt.includes('[TEST_QUOTA]')) {
      return {
        success: false,
        error: 'Hết hạn ngạch quota cho phiên ' + session.name + '. (Lỗi giả lập để kiểm thử)',
        isQuotaExhausted: true,
      };
    }

    // Test auth scenario
    if (job.prompt.includes('[TEST_AUTH]')) {
      return {
        success: false,
        error: 'Yêu cầu xác thực đăng nhập Google cho phiên ' + session.name + '. (Lỗi giả lập để kiểm thử)',
        isAuthRequired: true,
      };
    }

    // Test transient failure & retry scenario
    if (job.prompt.includes('[TEST_RETRY]') && job.retryCount === 0) {
      await this.delay(500);
      return {
        success: false,
        error: 'Sự cố kết nối mạng tạm thời trong lúc tải lên. (Sẽ tự động thử lại)',
        isTransient: true,
      };
    }

    // Test permanent failure scenario
    if (job.prompt.includes('[TEST_FAIL]')) {
      await this.delay(500);
      return {
        success: false,
        error: 'Tạo thất bại do tham số prompt không hợp lệ. (Lỗi nghiêm trọng giả lập)',
        isTransient: false,
      };
    }

    onProgress({ progress: 30, stage: 'submitting', message: 'Đang gửi prompt đến công cụ tạo...' });
    await this.delay(600);

    onProgress({ progress: 65, stage: 'generating', message: `Đang render ${job.type === 'image' ? 'ảnh Nano Banana' : 'video Veo 3'}...` });
    await this.delay(800);

    onProgress({ progress: 90, stage: 'downloading', message: 'Đang tải file phương tiện về máy...' });
    await this.delay(400);

    // Generate output file
    let outputFile = '';
    let thumbnailFile = '';

    if (job.type === 'image') {
      const fileName = `${job.id}.svg`;
      outputFile = path.join(imagesDir, fileName);
      thumbnailFile = outputFile;

      const svgContent = this.createMockImageSvg(job, session);
      fs.writeFileSync(outputFile, svgContent, 'utf-8');
    } else {
      const fileName = `${job.id}.mp4`;
      const thumbName = `${job.id}_thumb.svg`;
      outputFile = path.join(videosDir, fileName);
      thumbnailFile = path.join(videosDir, thumbName);

      // Create a valid mini MP4 binary placeholder or simulated video container
      const videoBuffer = this.createMockVideoFile(job);
      fs.writeFileSync(outputFile, videoBuffer);

      // Create thumbnail svg
      const svgThumb = this.createMockImageSvg(job, session, true);
      fs.writeFileSync(thumbnailFile, svgThumb, 'utf-8');
    }

    // Verify file actually exists before completing
    if (!fs.existsSync(outputFile)) {
      return {
        success: false,
        error: 'Xác minh thất bại: Không thể ghi file kết quả vào ổ đĩa.',
      };
    }

    // Save metadata
    this.outputManager.saveMetadata(job, outputFile, projectName);

    onProgress({ progress: 100, stage: 'completed', message: 'File kết quả đã được lưu và xác minh thành công.' });

    return {
      success: true,
      outputFile,
      thumbnailFile,
      metadata: {
        engine: 'Simulation Mode (Mock)',
        generationTimeMs: 2200,
        fileSize: fs.statSync(outputFile).size,
      },
    };
  }

  private createMockImageSvg(job: Job, session: Session, isVideoThumb = false): string {
    const isImage = job.type === 'image';
    const tag = isVideoThumb ? 'VEO 3 VIDEO FRAME' : 'NANO BANANA GENERATION';
    const colorA = isImage ? '#1e1b4b' : '#311042';
    const colorB = isImage ? '#312e81' : '#581c87';
    const accent = isImage ? '#6366f1' : '#a855f7';

    // Aspect ratio dimensions
    let width = 800;
    let height = 800;
    if (job.aspectRatio === '16:9') {
      width = 960;
      height = 540;
    } else if (job.aspectRatio === '9:16') {
      width = 540;
      height = 960;
    } else if (job.aspectRatio === '4:3') {
      width = 800;
      height = 600;
    }

    const cleanPrompt = job.prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const refInfo = job.referenceImageUrl ? `Ref Image: ${path.basename(job.referenceImageUrl)}` : 'No reference';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${colorA}" />
      <stop offset="100%" stop-color="${colorB}" />
    </linearGradient>
    <linearGradient id="card" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.85" />
      <stop offset="100%" stop-color="#1e293b" stop-opacity="0.85" />
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)" />

  <!-- Ambient glowing orb -->
  <circle cx="${width * 0.8}" cy="${height * 0.2}" r="160" fill="${accent}" opacity="0.25" filter="blur(40px)" />
  <circle cx="${width * 0.2}" cy="${height * 0.8}" r="120" fill="${accent}" opacity="0.18" filter="blur(30px)" />

  <!-- Card container -->
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" rx="16" fill="url(#card)" stroke="${accent}" stroke-width="1.5" />

  <!-- Header badge -->
  <rect x="70" y="70" width="220" height="34" rx="17" fill="${accent}" fill-opacity="0.25" stroke="${accent}" />
  <text x="180" y="92" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700" text-anchor="middle" letter-spacing="1">${tag}</text>

  <!-- Job Name -->
  <text x="70" y="150" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="24" font-weight="700">${job.name}</text>
  
  <!-- Prompt Box -->
  <rect x="70" y="175" width="${width - 140}" height="110" rx="10" fill="#020617" fill-opacity="0.6" stroke="#334155" />
  <text x="90" y="205" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12">PROMPT</text>
  <foreignObject x="90" y="215" width="${width - 180}" height="65">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color: #e2e8f0; font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis;">
      ${cleanPrompt}
    </div>
  </foreignObject>

  <!-- Details Grid -->
  <g fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13">
    <text x="70" y="325">Model: <tspan fill="#f1f5f9" font-weight="600">${job.model || (isImage ? 'Nano Banana' : 'Veo 3')}</tspan></text>
    <text x="70" y="355">Aspect Ratio: <tspan fill="#f1f5f9" font-weight="600">${job.aspectRatio}</tspan></text>
    <text x="70" y="385">Session: <tspan fill="#f1f5f9" font-weight="600">${session.name}</tspan></text>
    <text x="70" y="415">Reference: <tspan fill="#f1f5f9" font-weight="600">${refInfo}</tspan></text>
    <text x="70" y="445">Generated At: <tspan fill="#f1f5f9" font-weight="600">${new Date().toLocaleTimeString()}</tspan></text>
  </g>

  <!-- Simulation Watermark -->
  <g transform="translate(${width - 240}, ${height - 90})">
    <rect width="180" height="30" rx="6" fill="#f59e0b" fill-opacity="0.2" stroke="#f59e0b" stroke-width="1" />
    <text x="90" y="20" fill="#f59e0b" font-family="system-ui, sans-serif" font-size="11" font-weight="700" text-anchor="middle">⚡ SIMULATION MODE</text>
  </g>
</svg>`;
  }

  private createMockVideoFile(job: Job): Buffer {
    // Generate minimal valid MP4 header/container buffer with metadata
    // This allows local video playback or file recognition without errors
    const header = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp box size 32
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // isom
      0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, // isom iso2
      0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31, // avc1 mp41
      0x00, 0x00, 0x00, 0x08, 0x66, 0x72, 0x65, 0x65, // free box
    ]);

    const promptData = Buffer.from(`Simulated Veo 3 Video: ${job.name} - ${job.prompt}`, 'utf-8');
    return Buffer.concat([header, promptData]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
