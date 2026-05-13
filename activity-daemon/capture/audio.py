"""
Audio capture with silero-vad filtering and Whisper transcription.

Architecture:
  - Background thread reads the microphone continuously via sounddevice
  - Each 1.5s chunk is tested by silero-vad; speech-probable chunks accumulate
  - When 30s of speech has built up (or flush() is called), Whisper transcribes
  - Transcripts with high no_speech_prob are discarded (music/lyrics defence)
  - flush() returns ActivityEntry dicts for the uploader
"""

import threading
import logging
from datetime import datetime
from typing import Optional

log = logging.getLogger('capture.audio')

SAMPLE_RATE      = 16000   # Hz — Whisper and silero-vad both require 16 kHz
CHUNK_DURATION   = 1.5     # seconds per VAD chunk
SPEECH_THRESHOLD = 0.45    # silero-vad probability above which we keep the chunk
                            # (lowered from 0.6 — music + speech mix scores lower)
TRANSCRIBE_SECS  = 30      # accumulate this many speech-seconds before transcribing
MAX_TRANSCRIPT   = 600     # chars — truncate very long transcriptions


class AudioTracker:
    """
    Thread-safe audio capture that produces audio_transcript ActivityEntry dicts.
    Call start() once at daemon startup; flush() on each batch interval; stop() on exit.
    """

    def __init__(self):
        self._lock               = threading.Lock()
        self._running            = False
        self._thread: Optional[threading.Thread] = None
        self._speech_buffer: list = []   # accumulated numpy chunks of speech audio
        self._pending_transcripts: list[dict] = []
        self._vad_model          = None
        self._whisper_model      = None

    # ── Public API ────────────────────────────────────────────────────────────

    def start(self):
        """Load models and start background capture. Disables itself silently on any error."""
        try:
            import torch
            log.info('Loading silero-vad…')
            self._vad_model, _ = torch.hub.load(
                'snakers4/silero-vad', 'silero_vad',
                verbose=False, trust_repo=True,
            )
            self._vad_model.eval()

            import whisper as _whisper
            log.info('Loading whisper-small…')
            self._whisper_model = _whisper.load_model('small')

            self._running = True
            self._thread  = threading.Thread(target=self._capture_loop, daemon=True, name='audio-capture')
            self._thread.start()
            log.info('Audio capture active (silero-vad + whisper-small)')

        except Exception as e:
            log.warning(f'Audio capture disabled: {e}')

    def flush(self) -> list[dict]:
        """Return all pending transcript entries and reset. Transcribes any remaining buffer."""
        # Transcribe whatever speech has built up even if < TRANSCRIBE_SECS
        self._transcribe_buffer()
        with self._lock:
            entries = list(self._pending_transcripts)
            self._pending_transcripts = []
        return entries

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    # ── Internal ──────────────────────────────────────────────────────────────

    def _capture_loop(self):
        """Background thread: mic → VAD → speech accumulation."""
        try:
            import sounddevice as sd
            import numpy as np
            import torch

            chunk_samples = int(SAMPLE_RATE * CHUNK_DURATION)

            with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='float32') as stream:
                log.info('Microphone stream open')
                while self._running:
                    chunk, _ = stream.read(chunk_samples)
                    audio = chunk.flatten()

                    # silero-vad: is this chunk speech?
                    tensor = torch.from_numpy(audio)
                    try:
                        prob = self._vad_model(tensor, SAMPLE_RATE).item()
                    except Exception:
                        continue

                    if prob >= SPEECH_THRESHOLD:
                        log.debug(f'Speech chunk accepted (prob={prob:.2f})')
                        with self._lock:
                            self._speech_buffer.append(audio)
                        speech_secs = len(self._speech_buffer) * CHUNK_DURATION
                        if speech_secs >= TRANSCRIBE_SECS:
                            self._transcribe_buffer()
                    else:
                        log.debug(f'Chunk filtered (prob={prob:.2f})')

        except Exception as e:
            log.warning(f'Audio capture loop stopped: {e}')

    def _transcribe_buffer(self):
        """Pop the speech buffer and run Whisper. Thread-safe."""
        import numpy as np

        with self._lock:
            if not self._speech_buffer:
                return
            audio = np.concatenate(self._speech_buffer).astype('float32')
            self._speech_buffer = []

        if self._whisper_model is None:
            return

        try:
            result = self._whisper_model.transcribe(
                audio,
                language='en',
                fp16=False,
                initial_prompt='Business meeting. Project management. Tasks and decisions.',
            )
            text = (result.get('text') or '').strip()

            # Second-pass filter: discard if Whisper's own no_speech confidence is high
            segments = result.get('segments', [])
            if segments:
                avg_no_speech = sum(s.get('no_speech_prob', 0) for s in segments) / len(segments)
                if avg_no_speech > 0.70:
                    log.debug(f'Transcript discarded (no_speech_prob={avg_no_speech:.2f})')
                    return

            if not text:
                return

            entry = {
                'timestamp':  datetime.now().isoformat(timespec='seconds'),
                'type':       'audio_transcript',
                'transcript': text[:MAX_TRANSCRIPT],
            }
            with self._lock:
                self._pending_transcripts.append(entry)
            log.info(f'Transcript: {text[:80]}{"…" if len(text) > 80 else ""}')

        except Exception as e:
            log.warning(f'Transcription error: {e}')
