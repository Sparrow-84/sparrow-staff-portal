import { Mp3Encoder } from '@breezystack/lamejs';

// Records a mic stream straight to MP3 in-browser (Web Audio API + lamejs),
// instead of MediaRecorder's native container (webm/opus on Chrome/Android,
// mp4/aac on Safari/iOS). Those native formats aren't playable across
// browsers — a message recorded on Android is silent on an iPhone and vice
// versa. MP3 plays natively everywhere, so recorder and listener no longer
// need to be on compatible browsers.
const BUFFER_SIZE = 4096;

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

export class Mp3Recorder {
  private audioCtx: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private processor: ScriptProcessorNode;
  private silentGain: GainNode;
  private encoder: Mp3Encoder;
  private chunks: Uint8Array[] = [];
  private stopped = false;

  constructor(stream: MediaStream) {
    this.audioCtx = new AudioContext();
    this.source = this.audioCtx.createMediaStreamSource(stream);
    this.processor = this.audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
    this.silentGain = this.audioCtx.createGain();
    this.silentGain.gain.value = 0; // mute monitoring so the user doesn't hear an echo of their own mic
    this.encoder = new Mp3Encoder(1, this.audioCtx.sampleRate, 128);

    this.processor.onaudioprocess = (e) => {
      const samples = e.inputBuffer.getChannelData(0);
      const mp3buf = this.encoder.encodeBuffer(floatTo16BitPCM(samples));
      if (mp3buf.length > 0) this.chunks.push(mp3buf);
    };

    this.source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.audioCtx.destination);
  }

  stop(): Blob {
    if (this.stopped) return new Blob(this.chunks as BlobPart[], { type: 'audio/mpeg' });
    this.stopped = true;
    this.processor.disconnect();
    this.source.disconnect();
    this.silentGain.disconnect();
    const end = this.encoder.flush();
    if (end.length > 0) this.chunks.push(end);
    void this.audioCtx.close();
    return new Blob(this.chunks as BlobPart[], { type: 'audio/mpeg' });
  }
}
