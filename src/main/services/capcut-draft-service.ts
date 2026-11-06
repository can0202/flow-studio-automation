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

/** Generate a hex UUID without dashes (lowercase) */
function newHexId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Generate a UUID (uppercase, with dashes) */
function newUUID(): string {
  return crypto.randomUUID().toUpperCase();
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
   * Calculate total size of all files in a directory (materials folder)
   */
  private static calcMaterialsSize(materialsDir: string): number {
    let total = 0;
    try {
      const files = fs.readdirSync(materialsDir);
      for (const f of files) {
        try {
          const stat = fs.statSync(path.join(materialsDir, f));
          if (stat.isFile()) total += stat.size;
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    return total;
  }

  /**
   * Build a complete video material object matching CapCut 6.7.0 format
   */
  private static buildVideoMaterial(
    id: string,
    filePath: string,
    width: number,
    height: number,
    isVideo: boolean
  ): Record<string, unknown> {
    // CapCut uses native Windows backslash path
    const nativePath = filePath.replace(/\//g, '\\');
    const fname = path.basename(filePath);
    return {
      id,
      unique_id: '',
      type: isVideo ? 'video' : 'photo',
      duration: 10800000000, // 3 hours max for photos
      path: nativePath,
      media_path: '',
      local_id: '',
      has_audio: isVideo,
      reverse_path: '',
      intensifies_path: '',
      reverse_intensifies_path: '',
      intensifies_audio_path: '',
      cartoon_path: '',
      width,
      height,
      category_id: '',
      category_name: 'local',
      material_id: id,
      material_name: fname,
      material_url: '',
      crop: {
        upper_left_x: 0.0,
        upper_left_y: 0.0,
        upper_right_x: 1.0,
        upper_right_y: 0.0,
        lower_left_x: 0.0,
        lower_left_y: 1.0,
        lower_right_x: 1.0,
        lower_right_y: 1.0,
      },
      crop_ratio: 'free',
      audio_fade: null,
      crop_scale: 1.0,
      extra_type_option: 0,
      stable: {
        stable_level: 0,
        matrix_path: '',
        time_range: { start: 0, duration: 0 },
      },
      matting: {
        flag: 0,
        path: '',
        interactiveTime: [],
        has_use_quick_brush: false,
        strokes: [],
        has_use_quick_eraser: false,
        expansion: 0,
        feather: 0,
        reverse: false,
        custom_matting_id: '',
        enable_matting_stroke: false,
        is_clould: false,
        mask_video_path: '',
        cloud_product_fps: 0.0,
      },
      source: 0,
      source_platform: 0,
      formula_id: '',
      check_flag: 63487,
      video_algorithm: {
        algorithms: [],
        time_range: null,
        path: '',
        gameplay_configs: [],
        ai_in_painting_config: [],
        complement_frame_config: null,
        motion_blur_config: null,
        deflicker: null,
        noise_reduction: null,
        quality_enhance: null,
        super_resolution: null,
        ai_background_configs: [],
        smart_complement_frame: null,
        aigc_generate: null,
        aigc_generate_list: [],
        mouth_shape_driver: null,
        ai_expression_driven: null,
        ai_motion_driven: null,
        image_interpretation: null,
        story_video_modify_video_config: {
          task_id: '',
          is_overwrite_last_video: false,
          tracker_task_id: '',
          generate_id: '',
          generate_card_id: '',
        },
        skip_algorithm_index: [],
      },
      is_unified_beauty_mode: false,
      is_set_beauty_mode: false,
      object_locked: null,
      smart_motion: null,
      multi_camera_info: null,
      freeze: null,
      picture_from: 'none',
      picture_set_category_id: '',
      picture_set_category_name: '',
      team_id: '',
      local_material_id: '',
      origin_material_id: '',
      request_id: '',
      has_sound_separated: false,
      is_text_edit_overdub: false,
      is_ai_generate_content: false,
      is_video_copilot_aigc_content: false,
      aigc_type: 'none',
      is_copyright: false,
      aigc_history_id: '',
      aigc_item_id: '',
      local_material_from: '',
      smart_match_info: null,
      beauty_face_preset_infos: [],
      beauty_body_preset_id: '',
      beauty_face_auto_preset: { preset_id: '', name: '', rate_map: '', scene: '' },
      beauty_face_auto_preset_infos: [],
      beauty_body_auto_preset: null,
      live_photo_timestamp: -1,
      live_photo_cover_path: '',
      content_feature_info: null,
      corner_pin: null,
      surface_trackings: [],
      video_mask_stroke: {
        resource_id: '',
        path: '',
        type: '',
        color: '',
        size: 0.0,
        alpha: 0.0,
        distance: 0.0,
        texture: 0.0,
        horizontal_shift: 0.0,
        vertical_shift: 0.0,
      },
      video_mask_shadow: {
        resource_id: '',
        path: '',
        color: '',
        alpha: 0.0,
        blur: 0.0,
        distance: 0.0,
        angle: 0.0,
      },
      pre_applied_vip_materials: [],
      workflow_node_id: '',
    };
  }

  /**
   * Build a video segment matching CapCut 6.7.0 format
   */
  private static buildVideoSegment(
    materialId: string,
    speedId: string,
    canvasId: string,
    placeholderInfoId: string,
    soundChannelMappingId: string,
    materialColorId: string,
    loudnessId: string,
    vocalSeparationId: string,
    sourceStart: number,
    sourceDuration: number,
    targetStart: number,
    targetDuration: number,
    renderIndex: number
  ): Record<string, unknown> {
    return {
      id: newHexId(),
      source_timerange: { start: sourceStart, duration: sourceDuration },
      target_timerange: { start: targetStart, duration: targetDuration },
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
        rotation3d: [],
        transform: { x: 0.0, y: 0.0 },
        flip: { vertical: false, horizontal: false },
        alpha: 1.0,
      },
      uniform_scale: { on: true, value: 1.0 },
      material_id: materialId,
      extra_material_refs: [
        speedId,
        placeholderInfoId,
        canvasId,
        soundChannelMappingId,
        materialColorId,
        loudnessId,
        vocalSeparationId,
      ],
      render_index: renderIndex,
      keyframe_refs: [],
      enable_lut: true,
      enable_adjust: true,
      enable_hsl: true,
      visible: true,
      group_id: '',
      enable_color_curves: true,
      enable_hsl_curves: true,
      track_render_index: 0,
      hdr_settings: { mode: 1, intensity: 1.0, nits: 1000 },
      hdr_vivid_settings: null,
      enable_color_wheels: true,
      track_attribute: 0,
      is_placeholder: false,
      template_id: '',
      enable_smart_color_adjust: false,
      template_scene: 'default',
      common_keyframes: [],
      caption_info: null,
      responsive_layout: {
        enable: false,
        target_follow: '',
        size_layout: 0,
        horizontal_pos_layout: 0,
        vertical_pos_layout: 0,
      },
      enable_color_match_adjust: false,
      enable_color_correct_adjust: false,
      enable_adjust_mask: true,
      raw_segment_id: '',
      lyric_keyframes: null,
      enable_video_mask: true,
      digital_human_template_group_id: '',
      color_correct_alg_result: '',
      source: 'segmentsourcenormal',
      enable_mask_stroke: false,
      enable_mask_shadow: false,
      enable_color_adjust_pro: false,
      segment_color_tag: '',
    };
  }

  /**
   * Build an audio segment matching CapCut 6.7.0 format
   */
  private static buildAudioSegment(
    materialId: string,
    speedId: string,
    placeholderInfoId: string,
    soundChannelMappingId: string,
    durationUs: number
  ): Record<string, unknown> {
    return {
      id: newHexId(),
      source_timerange: { start: 0, duration: durationUs },
      target_timerange: { start: 0, duration: durationUs },
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
      clip: null,
      uniform_scale: null,
      material_id: materialId,
      extra_material_refs: [speedId, placeholderInfoId, soundChannelMappingId],
      render_index: 0,
      keyframe_refs: [],
      enable_lut: false,
      enable_adjust: false,
      enable_hsl: false,
      visible: true,
      group_id: '',
      enable_color_curves: true,
      enable_hsl_curves: true,
      track_render_index: 0,
      hdr_settings: null,
      hdr_vivid_settings: null,
      enable_color_wheels: true,
      track_attribute: 0,
      is_placeholder: false,
      template_id: '',
      enable_smart_color_adjust: false,
      template_scene: 'default',
      common_keyframes: [],
      caption_info: null,
      responsive_layout: {
        enable: false,
        target_follow: '',
        size_layout: 0,
        horizontal_pos_layout: 0,
        vertical_pos_layout: 0,
      },
      enable_color_match_adjust: false,
      enable_color_correct_adjust: false,
      enable_adjust_mask: false,
      raw_segment_id: '',
      lyric_keyframes: null,
      enable_video_mask: true,
      digital_human_template_group_id: '',
      color_correct_alg_result: '',
      source: 'segmentsourcenormal',
      enable_mask_stroke: false,
      enable_mask_shadow: false,
      enable_color_adjust_pro: false,
      segment_color_tag: '',
    };
  }

  /**
   * Build a complete audio material object matching CapCut 6.7.0 format
   */
  private static buildAudioMaterial(
    id: string,
    filePath: string,
    durationUs: number
  ): Record<string, unknown> {
    const nativePath = filePath.replace(/\//g, '\\');
    const fname = path.basename(filePath);
    return {
      id,
      unique_id: '',
      type: 'extract_music',
      name: fname,
      duration: durationUs,
      path: nativePath,
      category_name: 'local',
      wave_points: [],
      music_id: id,
      app_id: 0,
      text_id: '',
      tone_type: '',
      source_platform: 0,
      video_id: '',
      effect_id: '',
      resource_id: '',
      third_resource_id: '',
      category_id: '',
      intensifies_path: '',
      formula_id: '',
      check_flag: 3,
      team_id: '',
      local_material_id: id,
      tone_speaker: '',
      mock_tone_speaker: '',
      tone_effect_id: '',
      tone_effect_name: '',
      tone_platform: '',
      cloned_model_type: '',
      tone_category_id: '',
      tone_category_name: '',
      tone_second_category_id: '',
      tone_second_category_name: '',
      tone_emotion_name_key: '',
      tone_emotion_style: '',
      tone_emotion_role: '',
      tone_emotion_selection: '',
      tone_emotion_scale: 0.0,
      moyin_emotion: '',
      request_id: '',
      query: '',
      search_id: '',
      sound_separate_type: '',
      is_text_edit_overdub: false,
      is_ugc: false,
      is_ai_clone_tone: false,
      is_ai_clone_tone_post: false,
      source_from: '',
      copyright_limit_type: 'none',
      aigc_history_id: '',
      aigc_item_id: '',
      music_source: '',
      pgc_id: '',
      pgc_name: '',
      similiar_music_info: { original_song_id: '', original_song_name: '' },
      ai_music_type: 0,
      ai_music_enter_from: '',
      lyric_type: 0,
      tts_task_id: '',
      tts_generate_scene: '',
      ai_music_generate_scene: 0,
      tts_benefit_info: {
        benefit_type: 'none',
        benefit_log_id: '',
        benefit_log_extra: '',
        benefit_amount: -1,
      },
      tts_language_info: null,
      is_ai_generate_content: false,
      aigc_audio_type: 'none',
      aigc_audio_generate_info: null,
    };
  }

  /**
   * Main method: Build and write complete CapCut draft (CapCut 6.7.0 compatible)
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
    const nowSec = Math.floor(Date.now() / 1000);
    const nowUs = Date.now() * 1000;
    const randHex = crypto.randomBytes(4).toString('hex');
    const safeName = (options.draftName || `FlowStudio_${randHex}`)
      .replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF ]/g, '_')
      .trim();
    const draftFolderName = `AutoDraft_${safeName}_${randHex}`;
    const draftDir = path.join(draftsBase, draftFolderName);
    const materialsDir = path.join(draftDir, 'materials');
    const timelinesDir = path.join(draftDir, 'Timelines');

    fs.mkdirSync(materialsDir, { recursive: true });
    fs.mkdirSync(timelinesDir, { recursive: true });

    const draftId = newUUID();
    const timelineId = newUUID();

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

    // 6. Materials data structures — full list matching real CapCut 6.7.0
    const materials: Record<string, unknown[]> = {
      flowers: [],
      videos: [],
      tail_leaders: [],
      audios: [],
      images: [],
      texts: [],
      effects: [],
      stickers: [],
      canvases: [],
      transitions: [],
      audio_effects: [],
      audio_fades: [],
      beats: [],
      material_animations: [],
      placeholders: [],
      placeholder_infos: [],
      speeds: [],
      common_mask: [],
      chromas: [],
      text_templates: [],
      realtime_denoises: [],
      audio_pannings: [],
      audio_pitch_shifts: [],
      video_trackings: [],
      hsl: [],
      drafts: [],
      color_curves: [],
      hsl_curves: [],
      primary_color_wheels: [],
      log_color_wheels: [],
      video_effects: [],
      ai_text_effects: [],
      ai_generate_holders: [],
      audio_balances: [],
      handwrites: [],
      manual_deformations: [],
      manual_beautys: [],
      plugin_effects: [],
      sound_channel_mappings: [],
      green_screens: [],
      shapes: [],
      material_colors: [],
      digital_humans: [],
      digital_human_model_dressing: [],
      smart_crops: [],
      ai_translates: [],
      audio_track_indexes: [],
      loudnesses: [],
      vocal_beautifys: [],
      vocal_separations: [],
      smart_relights: [],
      time_marks: [],
      multi_language_refs: [],
      video_shadows: [],
      video_strokes: [],
      video_radius: [],
    };

    const tracks: unknown[] = [];

    // ── Track 0: Video/Images (Aligned with SRT cues) ──
    const videoSegments: unknown[] = [];
    if (mediaFiles.length > 0) {
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        const segStartUs = cue.startUs;
        const nextCueStartUs = i < cues.length - 1 ? cues[i + 1].startUs : totalDurationUs;
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

        // Copy media into materials folder
        const targetFilename = `${String(i + 1).padStart(3, '0')}_${path.basename(sourceFile)}`;
        const targetPath = path.join(materialsDir, targetFilename);
        try {
          if (!fs.existsSync(targetPath)) {
            fs.copyFileSync(sourceFile, targetPath);
          }
        } catch {
          // fallback to original source path
        }
        const finalMediaPath = fs.existsSync(targetPath) ? targetPath : sourceFile;

        // IDs for this segment's materials
        const videoMatId = newHexId();
        const speedMatId = newHexId();
        const canvasMatId = newUUID();
        const placeholderInfoId = newUUID();
        const soundChannelMappingId = newUUID();
        const materialColorId = newUUID();
        const loudnessId = newUUID();
        const vocalSeparationId = newUUID();

        // Video material
        materials.videos.push(
          this.buildVideoMaterial(videoMatId, finalMediaPath, canvasWidth, canvasHeight, isVideo)
        );

        // Speed material
        materials.speeds.push({
          id: speedMatId,
          type: 'speed',
          mode: 0,
          speed: 1.0,
          curve_speed: null,
        });

        // Canvas material
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

        // Placeholder info
        materials.placeholder_infos.push({
          id: placeholderInfoId,
          type: 'placeholder_info',
          meta_type: 'none',
          res_path: '',
          res_text: '',
          error_path: '',
          error_text: '',
        });

        // Sound channel mapping
        materials.sound_channel_mappings.push({
          id: soundChannelMappingId,
          type: 'none',
          audio_channel_mapping: 0,
          is_config_open: false,
        });

        // Material color
        materials.material_colors.push({
          id: materialColorId,
          is_color_clip: false,
          is_gradient: false,
          solid_color: '',
          gradient_colors: [],
          gradient_percents: [],
          gradient_angle: 90.0,
          width: 0.0,
          height: 0.0,
        });

        // Loudness
        materials.loudnesses.push({
          id: loudnessId,
          enable: false,
          time_range: null,
          file_id: '',
          target_loudness: 0.0,
          loudness_param: null,
        });

        // Vocal separation
        materials.vocal_separations.push({
          id: vocalSeparationId,
          type: 'vocal_separation',
          choice: 0,
          removed_sounds: [],
          time_range: null,
          production_path: '',
          final_algorithm: '',
          enter_from: '',
        });

        // Build segment
        videoSegments.push(
          this.buildVideoSegment(
            videoMatId,
            speedMatId,
            canvasMatId,
            placeholderInfoId,
            soundChannelMappingId,
            materialColorId,
            loudnessId,
            vocalSeparationId,
            0,
            segDurationUs,
            segStartUs,
            segDurationUs,
            i // render_index
          )
        );
      }

      tracks.push({
        id: newUUID(),
        type: 'video',
        attribute: 0,
        flag: 0,
        segments: videoSegments,
      });
    }

    // ── Track 1: Audio (Voiceover) ──
    // IDs for audio draft_materials entry
    let audioMaterialId = '';
    if (audioPath && fs.existsSync(audioPath)) {
      const audioMatId = newHexId();
      audioMaterialId = audioMatId;
      const audioTargetFilename = `audio${path.extname(audioPath)}`;
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

      // Audio speed & placeholder for segment refs
      const audioSpeedId = newHexId();
      const audioPlaceholderInfoId = newUUID();
      const audioSoundChannelMappingId = newUUID();

      materials.audios.push(
        this.buildAudioMaterial(audioMatId, finalAudioPath, finalAudioDurationUs)
      );

      materials.speeds.push({
        id: audioSpeedId,
        type: 'speed',
        mode: 0,
        speed: 1.0,
        curve_speed: null,
      });

      materials.placeholder_infos.push({
        id: audioPlaceholderInfoId,
        type: 'placeholder_info',
        meta_type: 'none',
        res_path: '',
        res_text: '',
        error_path: '',
        error_text: '',
      });

      materials.sound_channel_mappings.push({
        id: audioSoundChannelMappingId,
        type: 'none',
        audio_channel_mapping: 0,
        is_config_open: false,
      });

      tracks.push({
        id: newUUID(),
        type: 'audio',
        attribute: 0,
        flag: 0,
        segments: [
          this.buildAudioSegment(
            audioMatId,
            audioSpeedId,
            audioPlaceholderInfoId,
            audioSoundChannelMappingId,
            finalAudioDurationUs
          ),
        ],
      });
    }

    // ── Track 2: Subtitles (SRT Text) ──
    const textSegments: unknown[] = [];
    const fontSize = options.subtitleFontSize || 10.0;

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const textMatId = newUUID();

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
        id: newHexId(),
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
          rotation3d: [],
          transform: { x: 0.0, y: -0.72 }, // bottom center
          flip: { vertical: false, horizontal: false },
          alpha: 1.0,
        },
        uniform_scale: { on: true, value: 1.0 },
        material_id: textMatId,
        extra_material_refs: [],
        render_index: 14000 + i,
        keyframe_refs: [],
        enable_lut: false,
        enable_adjust: false,
        enable_hsl: false,
        visible: true,
        group_id: '',
        enable_color_curves: true,
        enable_hsl_curves: true,
        track_render_index: 1,
        hdr_settings: null,
        hdr_vivid_settings: null,
        enable_color_wheels: true,
        track_attribute: 0,
        is_placeholder: false,
        template_id: '',
        enable_smart_color_adjust: false,
        template_scene: 'default',
        common_keyframes: [],
        caption_info: null,
        responsive_layout: {
          enable: false,
          target_follow: '',
          size_layout: 0,
          horizontal_pos_layout: 0,
          vertical_pos_layout: 0,
        },
        enable_color_match_adjust: false,
        enable_color_correct_adjust: false,
        enable_adjust_mask: false,
        raw_segment_id: '',
        lyric_keyframes: null,
        enable_video_mask: false,
        digital_human_template_group_id: '',
        color_correct_alg_result: '',
        source: 'segmentsourcenormal',
        enable_mask_stroke: false,
        enable_mask_shadow: false,
        enable_color_adjust_pro: false,
        segment_color_tag: '',
      });
    }

    tracks.push({
      id: newUUID(),
      type: 'text',
      attribute: 0,
      flag: 0,
      segments: textSegments,
    });

    // 7. Write draft_content.json — exact CapCut 6.7.0 format
    const draftContent = {
      id: timelineId,
      version: 360000,
      new_version: '191.0.0',
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
      platform: {
        os: 'windows',
        os_version: '10.0.26200',
        app_id: 359289,
        app_version: '6.7.0',
        app_source: 'cc',
        device_id: '',
        hard_disk_id: '',
        mac_address: '',
      },
      last_modified_platform: {
        os: 'windows',
        os_version: '10.0.26200',
        app_id: 359289,
        app_version: '6.7.0',
        app_source: 'cc',
        device_id: '',
        hard_disk_id: '',
        mac_address: '',
      },
    };

    fs.writeFileSync(
      path.join(draftDir, 'draft_content.json'),
      JSON.stringify(draftContent, null, 2),
      'utf-8'
    );

    // 8. Write draft_cover.jpg from first media if available
    let coverRelPath = '';
    if (mediaFiles.length > 0 && fs.existsSync(mediaFiles[0])) {
      try {
        const coverTarget = path.join(draftDir, 'draft_cover.jpg');
        fs.copyFileSync(mediaFiles[0], coverTarget);
        coverRelPath = 'draft_cover.jpg';
      } catch {
        // ignore
      }
    }

    // 9. Calculate materials size AFTER all files are written
    const materialsSize = this.calcMaterialsSize(materialsDir);

    // 10. Build draft_materials entries for draft_meta_info.json
    // type 0 = audio/video, type 1 = image, etc.
    const draftMaterialsEntries: unknown[] = [];

    // Type 0: audio track
    const type0Values: unknown[] = [];
    if (audioMaterialId && audioPath && fs.existsSync(audioPath)) {
      const audioRelPath = `./materials/audio${path.extname(audioPath)}`;
      type0Values.push({
        ai_group_type: '',
        create_time: -1,
        duration: audioDurationUs || totalDurationUs,
        enter_from: 0,
        extra_info: `audio${path.extname(audioPath)}`,
        file_Path: audioRelPath,
        height: 0,
        id: audioMaterialId,
        import_time: -1,
        import_time_ms: -1,
        item_source: 1,
        material_color_tag: '',
        md5: '',
        metetype: 'music',
        roughcut_time_range: { duration: audioDurationUs || totalDurationUs, start: 0 },
        sub_time_range: { duration: -1, start: -1 },
        type: 0,
        width: 0,
      });
      // Add a placeholder for the "none" metetype entry that CapCut adds
      type0Values.push({
        ai_group_type: '',
        create_time: nowSec,
        duration: 33333,
        enter_from: 0,
        extra_info: '',
        file_Path: '',
        height: 0,
        id: newUUID().toLowerCase().replace(/-/g, '-'),
        import_time: nowSec,
        import_time_ms: nowUs,
        item_source: 1,
        material_color_tag: '',
        md5: '',
        metetype: 'none',
        roughcut_time_range: { duration: 33333, start: 0 },
        sub_time_range: { duration: -1, start: -1 },
        type: 0,
        width: 0,
      });
    }
    draftMaterialsEntries.push({ type: 0, value: type0Values });
    draftMaterialsEntries.push({ type: 1, value: [] });
    draftMaterialsEntries.push({ type: 2, value: [] });
    draftMaterialsEntries.push({ type: 3, value: [] });
    draftMaterialsEntries.push({ type: 6, value: [] });
    draftMaterialsEntries.push({ type: 7, value: [] });
    draftMaterialsEntries.push({ type: 8, value: [] });

    // 11. Write draft_meta_info.json — matching real CapCut 6.7.0 format exactly
    const draftMeta = {
      cloud_draft_cover: false,
      cloud_draft_sync: false,
      cloud_package_completed_time: '',
      draft_cloud_capcut_purchase_info: '',
      draft_cloud_last_action_download: false,
      draft_cloud_package_type: '',
      draft_cloud_purchase_info: '',
      draft_cloud_template_id: '',
      draft_cloud_tutorial_info: '',
      draft_cloud_videocut_purchase_info: '',
      draft_cover: coverRelPath,
      draft_deeplink_url: '',
      draft_enterprise_info: {
        draft_enterprise_extra: '',
        draft_enterprise_id: '',
        draft_enterprise_name: '',
        enterprise_material: [],
      },
      draft_fold_path: draftDir.replace(/\//g, '/'),
      draft_has_unfinished_aigc_video_effect: false,
      draft_id: draftId,
      draft_is_ae_produce: false,
      draft_is_ai_packaging_used: false,
      draft_is_ai_shorts: false,
      draft_is_ai_translate: false,
      draft_is_article_video_draft: false,
      draft_is_cloud_temp_draft: false,
      draft_is_from_deeplink: 'false',
      draft_is_infinite_canvas_draft: false,
      draft_is_invisible: false,
      draft_is_pippit_draft: false,
      draft_is_web_article_video: false,
      draft_materials: draftMaterialsEntries,
      draft_materials_copied_info: [],
      draft_name: safeName,
      draft_need_rename_folder: false,
      draft_new_version: '191.0.0',
      draft_removable_storage_device: '',
      draft_root_path: draftsBase.replace(/\//g, '\\'),
      draft_segment_extra_info: [],
      draft_timeline_materials_size_: materialsSize,
      draft_type: '',
      draft_web_article_video_enter_from: '',
      pippit_avatar_url: '',
      pippit_extra_info: '',
      pippit_id: '',
      pippit_user_name: '',
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

    fs.writeFileSync(
      path.join(draftDir, 'draft_meta_info.json'),
      JSON.stringify(draftMeta, null, 2),
      'utf-8'
    );

    // 12. Write Timelines/project.json
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

    fs.writeFileSync(
      path.join(timelinesDir, 'project.json'),
      JSON.stringify(proj, null, 2),
      'utf-8'
    );

    // 13. Write auxiliary files required by CapCut 6.7.0

    // draft_settings (INI format)
    const draftSettings = `[General]\r\ncloud_last_modify_platform=windows\r\ndraft_create_time=${nowSec}\r\ndraft_last_edit_time=${nowSec}\r\nreal_edit_seconds=0\r\nreal_edit_keys=0\r\n`;
    fs.writeFileSync(path.join(draftDir, 'draft_settings'), draftSettings, 'utf-8');

    // draft.extra — 26-byte binary blob (matches real CapCut draft)
    const extraBytes = Buffer.from([
      0x0a, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    fs.writeFileSync(path.join(draftDir, 'draft.extra'), extraBytes);

    // attachment_pc_common.json
    const attachmentPcCommon = {
      ai_packaging_infos: [],
      ai_packaging_report_info: {
        caption_id_list: [],
        commercial_material: '',
        material_source: '',
        method: '',
        page_from: '',
        style: '',
        task_id: '',
        text_style: '',
        tos_id: '',
        video_category: '',
      },
      broll: {
        ai_packaging_infos: [],
        ai_packaging_report_info: {
          caption_id_list: [],
          commercial_material: '',
          material_source: '',
          method: '',
          page_from: '',
          style: '',
          task_id: '',
          text_style: '',
          tos_id: '',
          video_category: '',
        },
      },
      commercial_music_category_ids: [],
      pc_feature_flag: 0,
      recognize_tasks: [],
      reference_lines_config: {
        horizontal_lines: [],
        is_lock: false,
        is_visible: false,
        vertical_lines: [],
      },
      safe_area_type: 0,
      template_item_infos: [],
      unlock_template_ids: [],
    };
    fs.writeFileSync(
      path.join(draftDir, 'attachment_pc_common.json'),
      JSON.stringify(attachmentPcCommon),
      'utf-8'
    );

    // draft_agency_config.json
    const draftAgencyConfig = {
      is_auto_agency_enabled: false,
      is_auto_agency_popup: false,
      is_single_agency_mode: false,
      marterials: null,
      use_converter: false,
      video_resolution: 720,
    };
    fs.writeFileSync(
      path.join(draftDir, 'draft_agency_config.json'),
      JSON.stringify(draftAgencyConfig),
      'utf-8'
    );

    // draft_biz_config.json (empty file)
    fs.writeFileSync(path.join(draftDir, 'draft_biz_config.json'), '', 'utf-8');

    // draft_virtual_store.json
    const draftVirtualStore = {
      draft_materials: [],
      draft_virtual_store: [
        {
          type: 0,
          value: [
            {
              creation_time: 0,
              display_name: '',
              filter_type: 0,
              id: '',
              import_time: 0,
              import_time_us: 0,
              material_color_tag: '',
              sort_sub_type: 0,
              sort_type: 0,
              subdraft_filter_type: 0,
            },
          ],
        },
        { type: 1, value: [] },
        { type: 2, value: [] },
      ],
    };
    fs.writeFileSync(
      path.join(draftDir, 'draft_virtual_store.json'),
      JSON.stringify(draftVirtualStore),
      'utf-8'
    );

    // key_value.json
    const keyValue = {
      kAgentSessionInfoKey: { conversation_id_list: [] },
    };
    fs.writeFileSync(
      path.join(draftDir, 'key_value.json'),
      JSON.stringify(keyValue),
      'utf-8'
    );

    // timeline_layout.json
    const timelineLayout = {
      dockItems: [
        {
          dockIndex: 0,
          ratio: 1,
          timelineIds: [timelineId],
          timelineNames: ['Timeline 01'],
        },
      ],
      layoutOrientation: 1,
    };
    fs.writeFileSync(
      path.join(draftDir, 'timeline_layout.json'),
      JSON.stringify(timelineLayout),
      'utf-8'
    );

    // 14. Register in root_meta_info.json
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
          draft_cover: coverRelPath,
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
          draft_new_version: '191.0.0',
          draft_root_path: draftsBase.replace(/\\/g, '/'),
          draft_timeline_materials_size: materialsSize,
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

    // 15. Optional: Launch CapCut
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
      message: `Đã tạo thành công bản nháp CapCut "${safeName}" với ${cues.length} câu phụ đề và ${mediaFiles.length} hình ảnh.`,
    };
  }
}
