import sys
import os
os.environ['HF_HUB_OFFLINE'] = '1'
from pathlib import Path
import shutil
import json
import argparse
import time
import re
import hashlib
import struct
import io
from http.server import HTTPServer, BaseHTTPRequestHandler

# Ensure UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

tts_engine = None
has_gpu = False

def init_engine():
    global tts_engine, has_gpu
    try:
        import torch
        has_gpu = torch.cuda.is_available()
    except Exception:
        has_gpu = False

    print(f"[VieNeu] Initializing engine. Hardware GPU available: {has_gpu}")
    from vieneu import Vieneu
    tts_engine = Vieneu()
    load_extended_voices()
    print("[VieNeu] Engine initialized successfully.")

def load_extended_voices():
    global tts_engine
    if tts_engine is None:
        return

    from pathlib import Path
    try:
        assets_dir = Path(getattr(tts_engine, 'assets_dir', ''))
        if not assets_dir.exists():
            import vieneu
            assets_dir = Path(vieneu.__file__).parent / "assets"

        # 1. Nạp các giọng chất lượng cao từ voices_v3_nano.json
        nano_file = assets_dir / "voices_v3_nano.json"
        if nano_file.exists():
            try:
                nano_data = json.loads(nano_file.read_text(encoding="utf-8"))
                for name, v in nano_data.get("presets", {}).items():
                    if name not in tts_engine._preset_voices:
                        desc = v.get("description", "")
                        region = "Miền Bắc" if "Bắc" in desc else "Miền Nam"
                        tts_engine._preset_voices[name] = {
                            "description": desc,
                            "gender": v.get("gender", "female"),
                            "region": region,
                            "featured": 1,
                            "speaker_emb": v.get("speaker_emb"),
                            "codes": v.get("codes"),
                        }
                        print(f"[VieNeu] Loaded extra nano voice: {name}")
            except Exception as e:
                print(f"[VieNeu] Error loading nano voices: {e}")

        # 2. Nạp các giọng đọc mẫu tự nhiên từ assets/samples
        samples_dir = assets_dir / "samples"
        sample_voices = [
            ("Ly Bắc", "Ly (nữ miền Bắc).wav", "Nữ · Bắc · Tự nhiên", "female", "Miền Bắc"),
            ("Ngọc Bắc", "Ngọc (nữ miền Bắc).wav", "Nữ · Bắc · Giọng đọc truyền cảm", "female", "Miền Bắc"),
            ("Bình Bắc", "Bình (nam miền Bắc).wav", "Nam · Bắc · Phong cách truyền cảm", "male", "Miền Bắc"),
            ("Tuyên Bắc", "Tuyên (nam miền Bắc).wav", "Nam · Bắc · Phong cách tự nhiên", "male", "Miền Bắc"),
            ("Vĩnh Nam", "Vĩnh (nam miền Nam).wav", "Nam · Nam · Giọng nam miền Tây ấm áp", "male", "Miền Nam"),
            ("Đoan Nam", "Đoan (nữ miền Nam).wav", "Nữ · Nam · Giọng nữ miền Nam dịu dàng", "female", "Miền Nam"),
        ]
        for name, filename, desc, gender, region in sample_voices:
            if name not in tts_engine._preset_voices:
                wav_p = samples_dir / filename
                if wav_p.exists():
                    try:
                        tts_engine.add_voice(name, str(wav_p), description=desc, gender=gender)
                        print(f"[VieNeu] Loaded sample voice: {name}")
                    except Exception as e:
                        print(f"[VieNeu] Error loading sample voice {name}: {e}")

        # 3. Quét các giọng tùy chỉnh của người dùng trong thư mục custom_voices
        custom_dir = Path(os.getcwd()) / "custom_voices"
        if custom_dir.exists():
            meta_file = custom_dir / "metadata.json"
            if meta_file.exists():
                try:
                    meta = json.loads(meta_file.read_text(encoding="utf-8"))
                    for v in meta:
                        vname = v.get("name")
                        vfile = custom_dir / v.get("filename", "")
                        if vname and vfile.exists() and vname not in tts_engine._preset_voices:
                            tts_engine.add_voice(
                                vname, str(vfile),
                                description=v.get("desc", ""),
                                gender=v.get("gender", "male")
                            )
                            print(f"[VieNeu] Loaded user custom voice: {vname}")
                except Exception as e:
                    print(f"[VieNeu] Error reading custom voices metadata: {e}")
    except Exception as e:
        print(f"[VieNeu] Error in load_extended_voices: {e}")

_CATALOG_VOICES_CACHE = None
_CATALOG_VOICES_MAP = None

def get_catalog_voices_list():
    global _CATALOG_VOICES_CACHE, _CATALOG_VOICES_MAP
    if _CATALOG_VOICES_CACHE is not None:
        return _CATALOG_VOICES_CACHE

    import os, json
    candidates = [
        os.path.join(os.path.dirname(__file__), 'assets', 'voices_all_catalog.json'),
        os.path.join(os.path.dirname(__file__), '..', 'assets', 'voices_all_catalog.json'),
        os.path.join(os.getcwd(), 'src', 'main', 'assets', 'voices_all_catalog.json'),
        os.path.join(os.getcwd(), 'dist', 'main', 'assets', 'voices_all_catalog.json'),
        r"D:\FGL\3. DEV\flow-studio-automation\src\main\assets\voices_all_catalog.json",
    ]

    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    _CATALOG_VOICES_CACHE = data
                    _CATALOG_VOICES_MAP = {v['name']: v for v in data if 'name' in v}
                    print(f"[VieNeu] Loaded {len(data)} voices from catalog file: {p}")
                    return data
            except Exception as e:
                print(f"[VieNeu] Error loading catalog {p}: {e}")

    _CATALOG_VOICES_CACHE = []
    _CATALOG_VOICES_MAP = {}
    return []

# ── Voice Alias Table ───────────────────────────────────────────────────────
# Các giọng hiển thị nhưng không phải preset gốc của engine → map sang preset cùng vùng, cùng phong cách
VOICE_ALIAS = {
    'Hữu Phước': 'Phạm Tuyên',
}

def resolve_actual_voice(voice: str) -> str:
    global tts_engine
    if not voice:
        return 'Mai Anh'
    if voice.startswith('en_') or voice.lower() == 'echo':
        return 'Adam'
    if voice.lower() == 'serena':
        return 'Trúc Ly'

    # Alias map
    if voice in VOICE_ALIAS:
        return VOICE_ALIAS[voice]

    # Nếu voice đã là tên preset gốc có trong engine
    if tts_engine and hasattr(tts_engine, '_preset_voices'):
        if voice in tts_engine._preset_voices:
            return voice
        if hasattr(tts_engine, 'resolve_voice_name'):
            resolved = tts_engine.resolve_voice_name(voice)
            if resolved:
                return resolved

    return voice


def get_parsed_voices():
    global tts_engine
    
    # 1. Nạp danh sách giọng độc bản chuẩn (25 giọng gốc có sao ⭐, các giọng độc bản không trùng)
    unique_list = get_catalog_voices_list()
    if unique_list and len(unique_list) > 0:
        seen = {v['id'] for v in unique_list if 'id' in v}
        voices = list(unique_list)
    else:
        seen = set()
        voices = []

    # 2. Bổ sung các giọng tự nạp từ custom_voices/metadata.json
    custom_dir = Path(os.getcwd()) / "custom_voices"
    if custom_dir.exists():
        meta_file = custom_dir / "metadata.json"
        if meta_file.exists():
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
                for v in meta:
                    vname = v.get("name")
                    if vname and vname not in seen:
                        seen.add(vname)
                        desc = v.get("desc", f"{'Nữ' if v.get('gender') == 'female' else 'Nam'} · {v.get('region', 'Miền Bắc')}")
                        parts = vname.split()
                        initials = (parts[0][0] + (parts[-1][0] if len(parts) > 1 else '')).upper() if parts else 'VN'
                        voices.insert(0, {
                            'id': vname,
                            'name': vname,
                            'label': f"{vname} — {desc} (Tùy chỉnh)",
                            'desc': desc,
                            'gender': v.get('gender', 'female'),
                            'region': v.get('region', 'Miền Bắc'),
                            'tags': ['Tùy chỉnh', 'Clone', 'Mới'],
                            'isStar': True,
                            'isCustom': True,
                            'initials': initials,
                            'lang': 'vi',
                        })
            except Exception as e:
                print(f"[VieNeu] Error loading custom voices into catalog: {e}")

    # 3. Bổ sung các giọng tự nạp mới (Custom Enrolled Voices) có trong engine
    if tts_engine and hasattr(tts_engine, '_preset_voices'):
        for vid, data in tts_engine._preset_voices.items():
            if vid not in seen:
                seen.add(vid)
                desc = data.get('description', '') if isinstance(data, dict) else ''
                gender = data.get('gender', 'female') if isinstance(data, dict) else 'female'
                region = data.get('region', 'Miền Bắc') if isinstance(data, dict) else 'Miền Bắc'
                parts = vid.split()
                initials = (parts[0][0] + (parts[-1][0] if len(parts) > 1 else '')).upper() if parts else 'VN'
                voices.insert(0, {
                    'id': vid,
                    'name': vid,
                    'label': f"{vid} — {desc} (Tùy chỉnh)",
                    'desc': desc,
                    'gender': gender,
                    'region': region,
                    'tags': ['Tùy chỉnh', 'Clone'],
                    'isStar': True,
                    'isCustom': True,
                    'initials': initials,
                    'lang': 'vi',
                })

    return voices


# ── Pause & Segment Helpers ───────────────────────────────────────────────────

# Tags mà VieNeu xử lý natively (tạo hiệu ứng âm thanh tự nhiên)
_VIENEU_NATIVE_TAGS = {'cười', 'thở dài', 'laugh', 'sigh'}

def clean_for_tts(text: str) -> str:
    """
    Chỉ giữ lại các tag mà VieNeu thực sự hỗ trợ tạo hiệu ứng giọng: [cười], [thở dài].
    Xóa toàn bộ các tag khác trong ngoặc vuông [...] để tránh bị đọc thành lời văn!
    """
    def _replace(m):
        content = m.group(1).strip().lower()
        if content in _VIENEU_NATIVE_TAGS:
            return f" [{content}]"
        return ""
    
    # Tìm mọi dạng [tag]
    cleaned = re.sub(r'\[(.*?)\]', _replace, text)
    # Xóa khoảng trắng thừa trước dấu câu
    cleaned = re.sub(r'\s+([,.:;?!])', r'\1', cleaned)
    cleaned = re.sub(r'[ \t]{2,}', ' ', cleaned).strip()
    return cleaned

def clean_for_srt(text: str) -> str:
    """
    Xóa TOÀN BỘ mọi tag trong ngoặc vuông [...] khỏi nội dung SRT để phụ đề 100% sạch.
    """
    cleaned = re.sub(r'\[.*?\]', '', text)
    cleaned = re.sub(r'\s+([,.:;?!])', r'\1', cleaned)
    cleaned = re.sub(r'[ \t]{2,}', ' ', cleaned).strip()
    return cleaned

def parse_segments(text: str):
    """
    Split text by [pause Xs] or [pause X.Xs] tags.
    Returns list of dicts: {'type': 'text'|'pause', 'value': str|float}
    """
    # Pattern: [pause 0.5s] [pause 1s] [pause 2.5s]
    pattern = re.compile(r'\[pause\s+([\d\.]+)s?\]', re.IGNORECASE)
    segments = []
    last_end = 0
    for m in pattern.finditer(text):
        before = text[last_end:m.start()].strip()
        if before:
            segments.append({'type': 'text', 'value': before})
        pause_sec = float(m.group(1))
        segments.append({'type': 'pause', 'value': pause_sec})
        last_end = m.end()
    trailing = text[last_end:].strip()
    if trailing:
        segments.append({'type': 'text', 'value': trailing})
    return segments


def make_silence_bytes(duration_sec: float, sample_rate: int = 48000, channels: int = 1) -> bytes:
    """Generate raw PCM silence as 16-bit signed little-endian bytes."""
    num_samples = int(sample_rate * duration_sec) * channels
    return b'\x00\x00' * num_samples


def write_wav(raw_pcm_chunks: list, sample_rate: int = 48000, channels: int = 1) -> bytes:
    """
    Concatenate PCM chunks (bytes) and wrap in a WAV header.
    raw_pcm_chunks: list of bytes (16-bit signed LE PCM) or numpy arrays.
    """
    try:
        import numpy as np
        arrays = []
        for chunk in raw_pcm_chunks:
            if isinstance(chunk, bytes):
                arr = np.frombuffer(chunk, dtype=np.int16)
            elif isinstance(chunk, np.ndarray):
                if chunk.dtype != np.int16:
                    # Assume float32 in [-1, 1] range → convert
                    arr = (chunk * 32767).clip(-32768, 32767).astype(np.int16)
                else:
                    arr = chunk
            else:
                arr = np.array(chunk, dtype=np.int16)
            arrays.append(arr)
        combined = np.concatenate(arrays)
        pcm_bytes = combined.tobytes()
    except ImportError:
        # Fallback: just concatenate raw bytes
        pcm_bytes = b''.join(raw_pcm_chunks)

    num_samples = len(pcm_bytes) // 2
    num_channels = channels
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(pcm_bytes)
    chunk_size = 36 + data_size

    header = struct.pack('<4sI4s4sIHHIIHH4sI',
        b'RIFF', chunk_size, b'WAVE',
        b'fmt ', 16,
        1,  # PCM format
        num_channels, sample_rate, byte_rate, block_align, bits_per_sample,
        b'data', data_size,
    )
    return header + pcm_bytes


def synthesize_with_pauses(text: str, voice: str, tts_engine, progress_callback=None):
    """
    Parse [pause Xs] tags, synthesize each text segment, insert silence for pauses,
    then return:
      combined  – numpy float32 array (the full audio)
      srt_cues  – list of {'index', 'start_sec', 'end_sec', 'text'} for SRT generation
    Calls progress_callback(done, total) after each segment.
    """
    import numpy as np

    segments = parse_segments(text)
    text_segments = [s for s in segments if s['type'] == 'text']
    total_steps = len(text_segments) if text_segments else 1
    done_steps = 0

    sample_rate = 48000
    audio_chunks = []
    srt_cues = []
    cursor_sec = 0.0   # running clock in seconds
    cue_index = 1

    for seg in segments:
        if seg['type'] == 'pause':
            sec = max(0.05, min(float(seg['value']), 10.0))
            silence = np.zeros(int(sample_rate * sec), dtype=np.float32)
            audio_chunks.append(silence)
            cursor_sec += sec
        else:
            seg_text = seg['value'].strip()
            if not seg_text:
                continue

            # Chuẩn bị text cho TTS: chỉ giữ tag [cười], [thở dài]. Các tag khác bị loại bỏ để không đọc thành lời
            tts_text = clean_for_tts(seg_text)
            if not tts_text:
                continue

            audio = tts_engine.infer(tts_text, voice=voice)
            if not isinstance(audio, np.ndarray):
                audio = np.array(audio, dtype=np.float32)
            if audio.ndim > 1:
                audio = audio.mean(axis=0)
            audio = audio.astype(np.float32)
            audio_chunks.append(audio)

            seg_dur = len(audio) / sample_rate

            # Phụ đề SRT: Xóa sạch toàn bộ mọi tag [...] để hiển thị câu chữ sạch 100%
            clean_srt_line = clean_for_srt(seg_text)
            srt_cues.append({
                'index': cue_index,
                'start_sec': cursor_sec,
                'end_sec': cursor_sec + seg_dur,
                'text': clean_srt_line or seg_text,
            })
            cursor_sec += seg_dur
            cue_index += 1
            done_steps += 1
            if progress_callback:
                progress_callback(done_steps, total_steps)

    if not audio_chunks:
        return np.zeros(sample_rate, dtype=np.float32), []

    combined = np.concatenate(audio_chunks)
    return combined, srt_cues


def sec_to_srt_time(sec: float) -> str:
    """Convert seconds to SRT timestamp: HH:MM:SS,mmm"""
    total_ms = int(round(sec * 1000))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    s = total_s % 60
    total_m = total_s // 60
    m = total_m % 60
    h = total_m // 60
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(srt_cues: list) -> str:
    """Build SRT content string from cue list."""
    lines = []
    for cue in srt_cues:
        lines.append(str(cue['index']))
        lines.append(f"{sec_to_srt_time(cue['start_sec'])} --> {sec_to_srt_time(cue['end_sec'])}")
        lines.append(cue['text'])
        lines.append('')   # blank line between cues
    return '\n'.join(lines)


class TTSRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        self._send_json({'status': 'ok'})

    def do_GET(self):
        if self.path == '/health':
            self._send_json({'status': 'ok', 'hasGpu': has_gpu})
        elif self.path == '/voices':
            voices = get_parsed_voices()
            self._send_json({'voices': voices, 'hasGpu': has_gpu})
        else:
            self._send_json({'error': 'Not found'}, status=404)

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        payload = {}
        if body:
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception:
                payload = {}

        if self.path == '/generate':
            try:
                text = payload.get('text', '').strip()
                voice = payload.get('voice', 'Mai Anh')
                speed = payload.get('speed', 1.0)
                output_dir = payload.get('outputDir', 'output/audio')
                ref_audio_path = payload.get('refAudioPath')
                output_name = payload.get('outputName')

                if not text:
                    self._send_json({'success': False, 'error': 'Văn bản không được để trống'}, status=400)
                    return

                os.makedirs(output_dir, exist_ok=True)
                timestamp = int(time.time())
                filename = output_name if output_name else f"tts_{timestamp}_{int(time.time()*1000)%1000}.wav"
                if not filename.endswith('.wav'):
                    filename += '.wav'
                target_file = os.path.join(output_dir, filename)

                actual_voice = resolve_actual_voice(voice)

                segments = parse_segments(text)
                text_segments = [s for s in segments if s['type'] == 'text']
                total_steps = max(len(text_segments), 1)

                print(f"[VieNeu] Synthesizing {total_steps} segment(s) with voice: {voice}...")
                start_t = time.time()

                # Emit 0% progress marker
                sys.stdout.write(f"[PROGRESS] 0/{total_steps}\n")
                sys.stdout.flush()

                def progress_cb(done, total):
                    sys.stdout.write(f"[PROGRESS] {done}/{total}\n")
                    sys.stdout.flush()

                if ref_audio_path and os.path.exists(ref_audio_path):
                    print(f"[VieNeu] Cloning from reference: {ref_audio_path}")
                    audio = tts_engine.infer(text, ref_audio=ref_audio_path)
                    tts_engine.save(audio, target_file)
                    srt_path = None
                else:
                    combined, srt_cues = synthesize_with_pauses(text, actual_voice, tts_engine, progress_callback=progress_cb)
                    tts_engine.save(combined, target_file)

                    # Build & save SRT alongside WAV
                    srt_content = build_srt(srt_cues)
                    srt_file = os.path.splitext(target_file)[0] + '.srt'
                    with open(srt_file, 'w', encoding='utf-8') as f:
                        f.write(srt_content)
                    srt_path = os.path.abspath(srt_file)
                    print(f"[VieNeu] SRT saved: {srt_file}")

                duration = round(time.time() - start_t, 2)
                print(f"[VieNeu] Saved {target_file} in {duration}s")

                self._send_json({
                    'success': True,
                    'filePath': os.path.abspath(target_file),
                    'srtPath': srt_path,
                    'duration': duration,
                })
            except Exception as e:
                print(f"[VieNeu] Error during synthesis: {e}")
                self._send_json({'success': False, 'error': str(e)}, status=500)

        elif self.path == '/preview':
            try:
                voice = payload.get('voice', 'Mai Anh')
                cache_dir = os.path.join(os.getcwd(), 'output', 'preview_cache')
                os.makedirs(cache_dir, exist_ok=True)

                # Consistent voice file name
                safe_name = "".join([c if c.isalnum() else "_" for c in voice])
                target_file = os.path.join(cache_dir, f"preview_{safe_name}.wav")

                # If already generated and cached, return immediately
                if os.path.exists(target_file) and os.path.getsize(target_file) > 1000:
                    self._send_json({
                        'success': True,
                        'filePath': os.path.abspath(target_file),
                        'cached': True,
                    })
                    return

                print(f"[VieNeu] Generating quick preview for voice: {voice}...")
                actual_voice = resolve_actual_voice(voice)
                if voice.startswith('en_'):
                    sample_text = f"Hello, I am {voice.replace('en_', '').title()}, an AI voice."
                else:
                    sample_text = f"Xin chào, tôi là {voice}."

                audio = tts_engine.infer(sample_text, voice=actual_voice)
                tts_engine.save(audio, target_file)

                self._send_json({
                    'success': True,
                    'filePath': os.path.abspath(target_file),
                    'cached': False,
                })
            except Exception as e:
                print(f"[VieNeu] Error generating preview: {e}")
                self._send_json({'success': False, 'error': str(e)}, status=500)

        elif self.path == '/voices/add':
            try:
                name = payload.get('name', '').strip()
                audio_path = payload.get('audioPath', '').strip()
                gender = payload.get('gender', 'female')
                region = payload.get('region', 'Miền Bắc')
                style = payload.get('style', 'Tự nhiên')

                if not name:
                    self._send_json({'success': False, 'error': 'Vui lòng nhập tên cho giọng đọc mới'}, status=400)
                    return
                if not audio_path:
                    self._send_json({'success': False, 'error': 'Vui lòng chọn file ghi âm mẫu'}, status=400)
                    return
                if not os.path.exists(audio_path):
                    self._send_json({'success': False, 'error': f'Không tìm thấy file audio tại: {audio_path}'}, status=400)
                    return

                desc = f"{'Nữ' if gender == 'female' else 'Nam'} · {region.replace('Miền ', '')} · Phong cách {style}"

                # Ensure custom_voices dir exists
                custom_dir = os.path.join(os.getcwd(), 'custom_voices')
                os.makedirs(custom_dir, exist_ok=True)

                # Copy reference audio into custom_voices
                import shutil
                ext = os.path.splitext(audio_path)[1].lower() or '.wav'
                safe_name = "".join([c if c.isalnum() else "_" for c in name])
                dest_file = os.path.join(custom_dir, f"{safe_name}{ext}")
                try:
                    shutil.copyfile(audio_path, dest_file)
                except Exception as cp_err:
                    print(f"[VieNeu] Notice copying audio: {cp_err}")
                    dest_file = audio_path

                # Enroll in Vieneu engine
                tts_engine.add_voice(name, dest_file, description=desc, gender=gender)

                # Persist to custom_voices/metadata.json
                meta_path = os.path.join(custom_dir, 'metadata.json')
                meta = []
                if os.path.exists(meta_path):
                    try:
                        with open(meta_path, 'r', encoding='utf-8') as f:
                            meta = json.load(f)
                    except Exception:
                        meta = []
                meta = [m for m in meta if m.get('name') != name]
                meta.append({
                    'name': name,
                    'filename': os.path.basename(dest_file),
                    'desc': desc,
                    'gender': gender,
                    'region': region,
                    'style': style,
                })
                with open(meta_path, 'w', encoding='utf-8') as f:
                    json.dump(meta, f, ensure_ascii=False, indent=2)

                # Invalidate catalog cache so get_parsed_voices immediately reflects new voice
                global _CATALOG_VOICES_CACHE
                _CATALOG_VOICES_CACHE = None

                print(f"[VieNeu] Successfully registered new custom voice: {name}")
                self._send_json({'success': True, 'name': name, 'desc': desc})
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"[VieNeu] Error adding voice: {e}")
                self._send_json({'success': False, 'error': f'Lỗi khi xử lý giọng đọc: {str(e)}'}, status=500)
        else:
            self._send_json({'error': 'Not found'}, status=404)

    def log_message(self, format, *args):
        return

def run_server(port=58231):
    init_engine()
    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, TTSRequestHandler)
    print(f"[VieNeu] HTTP Server listening on http://127.0.0.1:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=58231)
    args = parser.parse_args()
    run_server(args.port)
