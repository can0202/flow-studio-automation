import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';

export interface SrtCue {
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  startUs: number;
  durationUs: number;
  text: string;
}

export interface CreateCapCutDraftOptions {
  draftName?: string;
  audioPath?: string;
  srtContent?: string;
  srtPath?: string;
  mediaPaths?: string[];
  mediaFolder?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  subtitleFontSize?: number;
  copyMediaToDraft?: boolean;
  openCapCut?: boolean;
}

export interface CapCutDraftResult {
  success: boolean;
  draftName: string;
  draftPath: string;
  cueCount: number;
  mediaCount: number;
  totalDurationSec: number;
  message: string;
  error?: string;
}

export interface CapCutDetectResult {
  installed: boolean;
  draftsPath: string;
  executablePath?: string;
  version?: string;
}

export class CapCutDraftService {
  /**
   * Detect CapCut / JianYing installation & project draft folders
   */
  public static detect(): CapCutDetectResult {
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';

    const candidates = [
      path.join(localAppData, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'),
      path.join(localAppData, 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft'),
      path.join(userProfile, 'AppData', 'Local', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'),
    ];

    let draftsPath = '';
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        draftsPath = p;
        break;
      }
    }

    if (!draftsPath && localAppData) {
      // Default to CapCut standard path even if not yet created
      draftsPath = path.join(localAppData, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
    }

    // Check executable
    const exeCandidates = [
      path.join(localAppData, 'CapCut', 'Apps', 'CapCut.exe'),
      path.join(localAppData, 'CapCut', 'CapCut.exe'),
      path.join(localAppData, 'Programs', 'CapCut', 'CapCut.exe'),
    ];

    // Also look inside Apps subdirectories if present (e.g. Apps/9.5.0.4050/CapCut.exe)
    const appsDir = path.join(localAppData, 'CapCut', 'Apps');
    if (fs.existsSync(appsDir)) {
      try {
        const subdirs = fs.readdirSync(appsDir);
        for (const sub of subdirs) {
          const exe = path.join(appsDir, sub, 'CapCut.exe');
          if (fs.existsSync(exe)) {
            exeCandidates.unshift(exe);
            break;
          }
        }
      } catch {
        // ignore
      }
    }

    let executablePath: string | undefined;
    for (const exe of exeCandidates) {
      if (fs.existsSync(exe)) {
        executablePath = exe;
        break;
      }
    }

    return {
      installed: fs.existsSync(draftsPath) || Boolean(executablePath),
      draftsPath,
      executablePath,
    };
  }

  /**
   * Parse SRT subtitle content into structured cues with microsecond timings
   */
  public static parseSrt(srtContent: string): SrtCue[] {
    const cues: SrtCue[] = [];
    const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;

      let timeIndex = 0;
      let rawIndex = 1;
      if (/^\d+$/.test(lines[0].trim())) {
        rawIndex = parseInt(lines[0].trim(), 10);
        timeIndex = 1;
      }

      const timeLine = lines[timeIndex];
      if (!timeLine || !timeLine.includes('-->')) continue;

      const [startStr, endStr] = timeLine.split('-->').map((s) => s.trim());
      const startMs = this.timecodeToMs(startStr);
      const endMs = this.timecodeToMs(endStr);
      const durationMs = Math.max(100, endMs - startMs);

      const text = lines.slice(timeIndex + 1).join('\n').trim();
      if (!text) continue;

      cues.push({
        index: rawIndex,
        startMs,
        endMs,
        durationMs,
        startUs: startMs * 1000,
        durationUs: durationMs * 1000,
        text,
      });
    }

    // Sort by startMs
    cues.sort((a, b) => a.startMs - b.startMs);
    return cues;
  }

  private static timecodeToMs(timecode: string): number {
    // Format: 00:00:01,234 or 00:00:01.234
    const match = timecode.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!match) return 0;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const ms = parseInt(match[4].padEnd(3, '0').slice(0, 3), 10);
    return hours * 3600000 + minutes * 60000 + seconds * 1000 + ms;
  }

  /**
   * Get audio duration in microseconds from WAV/MP3 file
   */
  public static getAudioDurationUs(audioPath: string): number {
    try {
      if (!fs.existsSync(audioPath)) return 0;
      const buffer = fs.readFileSync(audioPath);

      // Check if WAV
      if (buffer.length >= 44 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
        let offset = 12;
        let byteRate = 0;
        let dataSize = 0;

        while (offset < buffer.length - 8) {
          const chunkId = buffer.toString('ascii', offset, offset + 4);
          const chunkSize = buffer.readUInt32LE(offset + 4);

          if (chunkId === 'fmt ') {
            byteRate = buffer.readUInt32LE(offset + 16);
          } else if (chunkId === 'data') {
            dataSize = chunkSize;
            break;
          }
          offset += 8 + chunkSize;
        }

        if (byteRate > 0 && dataSize > 0) {
          const sec = dataSize / byteRate;
          return Math.round(sec * 1000000);
        }
      }

      // Fallback estimate based on file size (assuming ~128kbps for mp3/pcm)
      const stat = fs.statSync(audioPath);
      const estSec = stat.size / 16000;
      return Math.round(estSec * 1000000);
    } catch {
      return 0;
    }
  }

  /**
   * Collect media files from explicit list or directory
   */
  public static collectMediaFiles(mediaPaths?: string[], mediaFolder?: string): string[] {
    const list: string[] = [];

    if (mediaPaths && mediaPaths.length > 0) {
      for (const p of mediaPaths) {
        if (fs.existsSync(p)) list.push(p);
      }
    }

    if (list.length === 0 && mediaFolder && fs.existsSync(mediaFolder)) {
      const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov']);
      try {
        const files = fs.readdirSync(mediaFolder);
        // Sort numerically if numbered (e.g. 1.png, 2.png, prompt_1.png)
        files.sort((a, b) => {
          const numA = a.match(/\d+/);
          const numB = b.match(/\d+/);
          if (numA && numB) {
            return parseInt(numA[0], 10) - parseInt(numB[0], 10);
          }
          return a.localeCompare(b);
        });

        for (const f of files) {
          const ext = path.extname(f).toLowerCase();
          if (allowedExts.has(ext)) {
            list.push(path.join(mediaFolder, f));
          }
        }
      } catch {
        // ignore
      }
    }

    return list;
  }

  /**
   * Main method: Build and write complete CapCut draft
   */
  public static async createDraft(options: CreateCapCutDraftOptions): Promise<CapCutDraftResult> {
    const detection = this.detect();
    const draftsBase = detection.draftsPath;

    if (!fs.existsSync(draftsBase)) {
      fs.mkdirSync(draftsBase, { recursive: true });
    }

    // 1. Parse SRT
    let srtText = options.srtContent || '';
    if (!srtText && options.srtPath && fs.existsSync(options.srtPath)) {
      srtText = fs.readFileSync(options.srtPath, 'utf-8');
    }

    const cues = this.parseSrt(srtText);
    if (cues.length === 0) {
      return {
        success: false,
        draftName: '',
        draftPath: '',
        cueCount: 0,
        mediaCount: 0,
        totalDurationSec: 0,
        message: 'Không tìm thấy dữ liệu phụ đề SRT hợp lệ.',
        error: 'No valid SRT cues found',
      };
    }

    // 2. Audio duration
    let audioDurationUs = 0;
    let audioPath = options.audioPath || '';
    if (audioPath && fs.existsSync(audioPath)) {
      audioDurationUs = this.getAudioDurationUs(audioPath);
    }

    // Calculate total duration: max of last cue end and audio duration
    const lastCueEndUs = cues[cues.length - 1].startUs + cues[cues.length - 1].durationUs;
    const totalDurationUs = Math.max(audioDurationUs, lastCueEndUs);

    // 3. Collect media
    const mediaFiles = this.collectMediaFiles(options.mediaPaths, options.mediaFolder);

    // 4. Draft paths & IDs
    const nowUs = Date.now() * 1000;
    const randHex = crypto.randomBytes(4).toString('hex');
    const safeName = (options.draftName || `FlowStudio_${randHex}`).replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF ]/g, '_').trim();
    const draftFolderName = `AutoDraft_${safeName}_${randHex}`;
    const draftDir = path.join(draftsBase, draftFolderName);
    const materialsDir = path.join(draftDir, 'materials');
    const timelinesDir = path.join(draftDir, 'Timelines');

    fs.mkdirSync(materialsDir, { recursive: true });
    fs.mkdirSync(timelinesDir, { recursive: true });

    const draftId = crypto.randomUUID().toUpperCase();
    const timelineId = crypto.randomUUID().toUpperCase();

    // 5. Canvas resolution based on aspect ratio
    let canvasWidth = 1920;
    let canvasHeight = 1080;
    let ratio = '16:9';
    if (options.aspectRatio === '9:16') {
      canvasWidth = 1080;
      canvasHeight = 1920;
      ratio = '9:16';
    } else if (options.aspectRatio === '1:1') {
      canvasWidth = 1080;
      canvasHeight = 1080;
      ratio = '1:1';
    }

    // 6. Materials data structures
    const materials: Record<string, any[]> = {
      videos: [],
      audios: [],
      texts: [],
      canvases: [],
      speeds: [],
      material_colors: [],
      sound_channel_mappings: [],
      placeholder_infos: [],
      loudnesses: [],
      vocal_separations: [],
      ai_translates: [],
      audio_balances: [],
      audio_effects: [],
      audio_fades: [],
      audio_pannings: [],
      audio_pitch_shifts: [],
      audio_track_indexes: [],
      beats: [],
      chromas: [],
      color_curves: [],
      digital_human_model_dressing: [],
      digital_humans: [],
      drafts: [],
      effects: [],
      flowers: [],
      green_screens: [],
      handwrites: [],
      hsl: [],
      hsl_curves: [],
      images: [],
      log_color_wheels: [],
      lyrics_effects: [],
      manual_beautys: [],
      manual_deformations: [],
      material_animations: [],
      multi_language_refs: [],
      placeholders: [],
      plugin_effects: [],
      primary_color_wheels: [],
      realtime_denoises: [],
      shapes: [],
      smart_crops: [],
      smart_relights: [],
      stickers: [],
      tail_leaders: [],
      text_templates: [],
      time_marks: [],
      transitions: [],
      video_effects: [],
      video_radius: [],
      video_shadows: [],
      video_strokes: [],
      video_trackings: [],
      vocal_beautifys: [],
    };

    const tracks: any[] = [];

    // ── Track 0: Video/Images (Aligned with SRT cues) ──
    const videoSegments: any[] = [];
    if (mediaFiles.length > 0) {
      // Align media items with cues
      // If media count == cues count, 1-to-1
      // If media count < cues count, distribute across cues
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        // Calculate timing: start at cue.startUs, end at next cue start (or totalDurationUs for last)
        const segStartUs = cue.startUs;
        const nextCueStartUs = (i < cues.length - 1) ? cues[i + 1].startUs : totalDurationUs;
        const segDurationUs = Math.max(100000, nextCueStartUs - segStartUs);

        // Select media index
        let mediaIdx = 0;
        if (mediaFiles.length >= cues.length) {
          mediaIdx = i;
        } else {
          // Proportional distribution
          mediaIdx = Math.min(mediaFiles.length - 1, Math.floor((i / cues.length) * mediaFiles.length));
        }

        const sourceFile = mediaFiles[mediaIdx];
        const isVideo = ['.mp4', '.mov'].includes(path.extname(sourceFile).toLowerCase());

        // Copy media into materials folder for safety
        const targetFilename = `${i + 1}_${path.basename(sourceFile)}`;
        const targetPath = path.join(materialsDir, targetFilename);
        try {
          if (!fs.existsSync(targetPath)) {
            fs.copyFileSync(sourceFile, targetPath);
          }
        } catch {
          // fallback to original source path
        }
        const finalMediaPath = fs.existsSync(targetPath) ? targetPath : sourceFile;

        const videoMatId = crypto.randomUUID().replace(/-/g, '');
        const speedMatId = crypto.randomUUID().replace(/-/g, '');
        const canvasMatId = crypto.randomUUID().toUpperCase();

        materials.videos.push({
          id: videoMatId,
          type: isVideo ? 'video' : 'photo',
          duration: 10800000000, // 10800s max
          path: finalMediaPath.replace(/\\/g, '/'),
          material_name: path.basename(finalMediaPath),
          width: canvasWidth,
          height: canvasHeight,
          category_name: 'local',
          has_audio: isVideo,
          check_flag: 63487,
        });

        materials.speeds.push({
          id: speedMatId,
          type: 'speed',
          mode: 0,
          speed: 1.0,
          curve_speed: null,
        });

        materials.canvases.push({
          id: canvasMatId,
          type: 'canvas_color',
          color: '',
          blur: 0.0,
          image: '',
          album_image: '',
          image_id: '',
          image_name: '',
          source_platform: 0,
          team_id: '',
        });

        videoSegments.push({
          id: crypto.randomUUID().toUpperCase(),
          source_timerange: { start: 0, duration: segDurationUs },
          target_timerange: { start: segStartUs, duration: segDurationUs },
          render_timerange: { start: 0, duration: 0 },
          desc: '',
          state: 0,
          speed: 1.0,
          is_loop: false,
          is_tone_modify: false,
          reverse: false,
          intensifies_audio: false,
          cartoon: false,
          volume: 1.0,
          last_nonzero_volume: 1.0,
          clip: {
            scale: { x: 1.0, y: 1.0 },
            rotation: 0.0,
            transform: { x: 0.0, y: 0.0 },
            flip: { vertical: false, horizontal: false },
            alpha: 1.0,
          },
          uniform_scale: { on: true, value: 1.0 },
          material_id: videoMatId,
          extra_material_refs: [speedMatId, canvasMatId],
          render_index: 1000 + i,
          visible: true,
          track_render_index: 0,
        });
      }

      tracks.push({
        id: crypto.randomUUID().toUpperCase(),
        type: 'video',
        attribute: 0,
        flag: 0,
        segments: videoSegments,
      });
    }

    // ── Track 1: Audio (Voiceover) ──
    if (audioPath && fs.existsSync(audioPath)) {
      const audioMatId = crypto.randomUUID().replace(/-/g, '');
      const audioTargetFilename = `voiceover${path.extname(audioPath)}`;
      const audioTargetPath = path.join(materialsDir, audioTargetFilename);
      try {
        if (!fs.existsSync(audioTargetPath)) {
          fs.copyFileSync(audioPath, audioTargetPath);
        }
      } catch {
        // ignore
      }
      const finalAudioPath = fs.existsSync(audioTargetPath) ? audioTargetPath : audioPath;
      const finalAudioDurationUs = audioDurationUs || totalDurationUs;

      materials.audios.push({
        id: audioMatId,
        type: 'extract_music',
        name: path.basename(finalAudioPath),
        duration: finalAudioDurationUs,
        path: finalAudioPath.replace(/\\/g, '/'),
        category_name: 'local',
        music_id: audioMatId,
        check_flag: 3,
      });

      tracks.push({
        id: crypto.randomUUID().toUpperCase(),
        type: 'audio',
        attribute: 0,
        flag: 0,
        segments: [
          {
            id: crypto.randomUUID().toUpperCase(),
            source_timerange: { start: 0, duration: finalAudioDurationUs },
            target_timerange: { start: 0, duration: finalAudioDurationUs },
            render_timerange: { start: 0, duration: 0 },
            desc: '',
            state: 0,
            speed: 1.0,
            is_loop: false,
            is_tone_modify: false,
            reverse: false,
            intensifies_audio: false,
            cartoon: false,
            volume: 1.0,
            last_nonzero_volume: 1.0,
            material_id: audioMatId,
            extra_material_refs: [],
            render_index: 2000,
            visible: true,
            track_render_index: 0,
          },
        ],
      });
    }

    // ── Track 2: Subtitles (SRT Text) ──
    const textSegments: any[] = [];
    const fontSize = options.subtitleFontSize || 10.0;

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const textMatId = crypto.randomUUID().toUpperCase();

      const textPayload = {
        text: cue.text,
        styles: [
          {
            fill: {
              content: {
                render_type: 'solid',
                solid: { color: [1.0, 1.0, 1.0] },
              },
            },
            size: fontSize,
            range: [0, cue.text.length],
          },
        ],
      };

      materials.texts.push({
        id: textMatId,
        type: 'text',
        content: JSON.stringify(textPayload),
        font_size: fontSize,
        text_color: '#FFFFFF',
        border_color: '#000000',
        border_width: 0.08,
        border_alpha: 1.0,
        alignment: 1, // centered
        typesetting: 0,
        sub_type: 0,
        check_flag: 7,
        text_size: 30,
        has_shadow: true,
        shadow_color: '#000000',
        shadow_alpha: 0.8,
        shadow_smoothing: 0.45,
        shadow_distance: 5.0,
        words: { start_time: [], end_time: [], text: [] },
        current_words: { start_time: [], end_time: [], text: [] },
      });

      textSegments.push({
        id: crypto.randomUUID().toUpperCase(),
        source_timerange: null,
        target_timerange: {
          start: cue.startUs,
          duration: cue.durationUs,
        },
        render_timerange: { start: 0, duration: 0 },
        desc: '',
        state: 0,
        speed: 1.0,
        is_loop: false,
        is_tone_modify: false,
        reverse: false,
        intensifies_audio: false,
        cartoon: false,
        volume: 1.0,
        last_nonzero_volume: 1.0,
        clip: {
          scale: { x: 1.0, y: 1.0 },
          rotation: 0.0,
          transform: { x: 0.0, y: -0.72 }, // bottom center
          flip: { vertical: false, horizontal: false },
          alpha: 1.0,
        },
        uniform_scale: { on: true, value: 1.0 },
        material_id: textMatId,
        extra_material_refs: [],
        render_index: 14000 + i,
        visible: true,
        track_render_index: 1,
      });
    }

    tracks.push({
      id: crypto.randomUUID().toUpperCase(),
      type: 'text',
      attribute: 0,
      flag: 0,
      segments: textSegments,
    });

    // 7. Write draft_content.json
    const draftContent = {
      id: timelineId,
      version: 360000,
      new_version: '189.0.0',
      name: safeName,
      duration: totalDurationUs,
      fps: 30.0,
      color_space: 0,
      create_time: nowUs,
      update_time: nowUs,
      is_drop_frame_timecode: false,
      canvas_config: {
        ratio,
        width: canvasWidth,
        height: canvasHeight,
        background: null,
      },
      config: {
        adjust_max_index: 1,
        attachment_info: [],
        combination_max_index: 1,
        export_range: null,
        extract_audio_last_index: 1,
        lyrics_recognition_id: '',
        lyrics_sync: true,
        lyrics_taskinfo: [],
        maintrack_adsorb: true,
        material_save_mode: 0,
        original_sound_last_index: 1,
        record_audio_last_index: 1,
        sticker_max_index: 1,
        subtitle_keywords_config: null,
        subtitle_recognition_id: '',
        subtitle_sync: true,
        subtitle_taskinfo: [],
        system_font_list: [],
        video_mute: false,
        zoom_info_params: null,
      },
      materials,
      tracks,
      keyframes: {
        adjusts: [],
        audios: [],
        effects: [],
        filters: [],
        handwrites: [],
        stickers: [],
        texts: [],
        videos: [],
      },
      keyframe_graph_list: [],
      platform: { app_id: 3704, app_source: 'ea', app_version: '9.5.0', os: 'windows' },
      last_modified_platform: { app_id: 3704, app_source: 'ea', app_version: '9.5.0', os: 'windows' },
    };

    fs.writeFileSync(path.join(draftDir, 'draft_content.json'), JSON.stringify(draftContent, null, 2), 'utf-8');

    // 8. Write draft_cover.jpg from first media if available
    let coverPath = '';
    if (mediaFiles.length > 0 && fs.existsSync(mediaFiles[0])) {
      try {
        const coverTarget = path.join(draftDir, 'draft_cover.jpg');
        fs.copyFileSync(mediaFiles[0], coverTarget);
        coverPath = coverTarget.replace(/\\/g, '/');
      } catch {
        // ignore
      }
    }

    // 9. Write draft_meta_info.json
    const draftMeta = {
      cloud_draft_cover: false,
      cloud_draft_sync: false,
      draft_cloud_last_action_download: false,
      draft_cover: coverPath,
      draft_fold_path: draftDir.replace(/\\/g, '/'),
      draft_id: draftId,
      draft_materials: [],
      draft_materials_copied_info: [],
      draft_name: safeName,
      draft_new_version: '189.0.0',
      draft_root_path: draftsBase.replace(/\\/g, '/'),
      draft_timeline_materials_size_: 0,
      tm_draft_create: nowUs,
      tm_draft_modified: nowUs,
      tm_draft_removed: 0,
      tm_duration: totalDurationUs,
    };

    fs.writeFileSync(path.join(draftDir, 'draft_meta_info.json'), JSON.stringify(draftMeta, null, 2), 'utf-8');

    // 10. Write Timelines/project.json
    const proj = {
      config: {
        color_space: 0,
        hdr_vivid: false,
        mixed_track_mode_on: false,
        render_index_track_mode_on: false,
        use_float_render: false,
      },
      create_time: nowUs,
      id: timelineId,
      main_timeline_id: timelineId,
      timelines: [
        {
          create_time: nowUs,
          id: timelineId,
          is_marked_delete: false,
          name: 'Timeline 01',
          update_time: nowUs,
        },
      ],
      update_time: nowUs,
      version: 0,
    };

    fs.writeFileSync(path.join(timelinesDir, 'project.json'), JSON.stringify(proj, null, 2), 'utf-8');

    // 11. Register in root_meta_info.json
    const rootMetaPath = path.join(draftsBase, 'root_meta_info.json');
    if (fs.existsSync(rootMetaPath)) {
      try {
        const rootData = JSON.parse(fs.readFileSync(rootMetaPath, 'utf-8'));
        const newEntry = {
          cloud_draft_cover: false,
          cloud_draft_sync: false,
          draft_cloud_last_action_download: false,
          draft_cloud_purchase_info: '',
          draft_cloud_template_id: '',
          draft_cloud_tutorial_info: '',
          draft_cloud_videocut_purchase_info: '',
          draft_cover: coverPath,
          draft_fold_path: draftDir.replace(/\\/g, '/'),
          draft_id: draftId,
          draft_is_ai_shorts: false,
          draft_is_cloud_temp_draft: false,
          draft_is_infinite_canvas_draft: false,
          draft_is_invisible: false,
          draft_is_pippit_draft: false,
          draft_is_web_article_video: false,
          draft_json_file: path.join(draftDir, 'draft_content.json').replace(/\\/g, '/'),
          draft_name: safeName,
          draft_new_version: '189.0.0',
          draft_root_path: draftsBase.replace(/\\/g, '/'),
          draft_timeline_materials_size: 0,
          draft_type: '',
          draft_web_article_video_enter_from: '',
          pippit_avatar_url: '',
          pippit_extra_info: '',
          pippit_id: '',
          pippit_user_name: '',
          streaming_edit_draft_ready: true,
          tm_draft_cloud_completed: '',
          tm_draft_cloud_entry_id: 0,
          tm_draft_cloud_modified: 0,
          tm_draft_cloud_parent_entry_id: -1,
          tm_draft_cloud_space_id: -1,
          tm_draft_cloud_user_id: -1,
          tm_draft_create: nowUs,
          tm_draft_modified: nowUs,
          tm_draft_removed: 0,
          tm_duration: totalDurationUs,
        };

        if (Array.isArray(rootData.all_draft_store)) {
          rootData.all_draft_store.unshift(newEntry);
        }
        if (typeof rootData.draft_ids === 'number') {
          rootData.draft_ids += 1;
        }

        fs.writeFileSync(rootMetaPath, JSON.stringify(rootData, null, 2), 'utf-8');
      } catch {
        // ignore
      }
    }

    // 12. Optional: Launch CapCut
    if (options.openCapCut && detection.executablePath) {
      try {
        exec(`"${detection.executablePath}"`);
      } catch {
        // ignore
      }
    }

    return {
      success: true,
      draftName: safeName,
      draftPath: draftDir,
      cueCount: cues.length,
      mediaCount: mediaFiles.length,
      totalDurationSec: Math.round(totalDurationUs / 1000000),
      message: `Đã tạo thành công bản nháp CapCut "${safeName}" với ${cues.length} câu phụ đề và ${mediaFiles.length} hình ảnh tự động đồng bộ.`,
    };
  }
}

