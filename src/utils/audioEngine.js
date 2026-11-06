// Web Audio API Engine for FilmSt Voice Enhance
// Dual-track synchronized A/B playback with sample-accurate switching

class VoiceAudioEngine {
  constructor() {
    this.ctx = null;
    this.sourceA = null;
    this.sourceB = null;
    this.gainA = null;
    this.gainB = null;
    this.masterGain = null;

    this.bufferA = null;
    this.bufferB = null;
    this.peaksA = [];
    this.peaksB = [];

    this.pathA = null;
    this.pathB = null;

    this.isPlaying = false;
    this.activeTrack = 'enhanced'; // 'original' or 'enhanced'
    this.startTime = 0;
    this.pauseOffset = 0;
    this.duration = 0;
    this.volume = 0.9;

    this.animFrame = null;
    this.onTimeUpdate = null;
    this.onEnded = null;
    this.onPeaksReady = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.gainA = this.ctx.createGain();
      this.gainB = this.ctx.createGain();

      this.gainA.connect(this.masterGain);
      this.gainB.connect(this.masterGain);

      this.updateTrackGains();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  updateTrackGains() {
    if (!this.gainA || !this.gainB || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.activeTrack === 'original') {
      this.gainA.gain.setValueAtTime(1.0, now);
      this.gainB.gain.setValueAtTime(0.0, now);
    } else {
      this.gainA.gain.setValueAtTime(0.0, now);
      this.gainB.gain.setValueAtTime(1.0, now);
    }
  }

  setActiveTrack(track) {
    this.activeTrack = track;
    this.updateTrackGains();
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  extractPeaks(audioBuffer, numPeaks = 96) {
    if (!audioBuffer) return [];
    const channelData = audioBuffer.getChannelData(0);
    const peaks = [];
    const step = Math.floor(channelData.length / numPeaks);
    for (let i = 0; i < numPeaks; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(start + step, channelData.length);
      for (let j = start; j < end; j += 4) {
        const val = Math.abs(channelData[j]);
        if (val > max) max = val;
      }
      peaks.push(Math.max(0.05, Math.min(1.0, max)));
    }
    return peaks;
  }

  async loadTrackA(filePath) {
    if (!filePath || filePath === this.pathA) return this.bufferA;
    this.init();
    this.pathA = filePath;
    try {
      const buffer = await this.readAndDecode(filePath);
      this.bufferA = buffer;
      if (buffer) {
        this.duration = Math.max(this.duration, buffer.duration);
        this.peaksA = this.extractPeaks(buffer, 100);
        if (this.onPeaksReady) this.onPeaksReady('original', this.peaksA, this.duration);
      }
      return buffer;
    } catch (err) {
      console.error('Failed to load track A:', filePath, err);
      return null;
    }
  }

  async loadTrackB(filePath) {
    if (!filePath || filePath === this.pathB) return this.bufferB;
    this.init();
    this.pathB = filePath;
    try {
      const buffer = await this.readAndDecode(filePath);
      this.bufferB = buffer;
      if (buffer) {
        this.duration = Math.max(this.duration, buffer.duration);
        this.peaksB = this.extractPeaks(buffer, 100);
        if (this.onPeaksReady) this.onPeaksReady('enhanced', this.peaksB, this.duration);
      }
      return buffer;
    } catch (err) {
      console.error('Failed to load track B:', filePath, err);
      return null;
    }
  }

  async readAndDecode(filePath) {
    if (!window.filmstVoice?.readAudioBuffer) return null;
    const uint8 = await window.filmstVoice.readAudioBuffer(filePath);
    if (!uint8 || uint8.byteLength === 0) return null;

    const arrayBuffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  play(startOffsetSec = null) {
    this.init();

    if (startOffsetSec !== null) {
      this.pauseOffset = startOffsetSec;
    }

    if (!this.bufferA && !this.bufferB) {
      console.warn('No audio buffer loaded to play.');
      return;
    }

    this.stopSources();

    const maxDuration = Math.max(
      this.bufferA ? this.bufferA.duration : 0,
      this.bufferB ? this.bufferB.duration : 0
    );
    this.duration = maxDuration;

    if (this.pauseOffset >= maxDuration) {
      this.pauseOffset = 0;
    }

    const now = this.ctx.currentTime;
    this.startTime = now - this.pauseOffset;

    // Create Source A
    if (this.bufferA) {
      this.sourceA = this.ctx.createBufferSource();
      this.sourceA.buffer = this.bufferA;
      this.sourceA.connect(this.gainA);
      this.sourceA.start(0, this.pauseOffset);
    }

    // Create Source B
    if (this.bufferB) {
      this.sourceB = this.ctx.createBufferSource();
      this.sourceB.buffer = this.bufferB;
      this.sourceB.connect(this.gainB);
      this.sourceB.start(0, this.pauseOffset);
    }

    this.isPlaying = true;
    this.updateTrackGains();
    this.startProgress();

    const currentPrimary = this.sourceB || this.sourceA;
    if (currentPrimary) {
      currentPrimary.onended = () => {
        if (this.isPlaying && this.ctx.currentTime - this.startTime >= this.duration - 0.1) {
          this.pause();
          this.pauseOffset = 0;
          if (this.onEnded) this.onEnded();
        }
      };
    }
  }

  pause() {
    if (!this.isPlaying) return;
    if (this.ctx) {
      this.pauseOffset = this.ctx.currentTime - this.startTime;
    }
    this.stopSources();
    this.isPlaying = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  stopSources() {
    if (this.sourceA) {
      try {
        this.sourceA.stop();
        this.sourceA.disconnect();
      } catch (e) {}
      this.sourceA = null;
    }
    if (this.sourceB) {
      try {
        this.sourceB.stop();
        this.sourceB.disconnect();
      } catch (e) {}
      this.sourceB = null;
    }
  }

  seek(targetSec) {
    const wasPlaying = this.isPlaying;
    this.pause();
    this.pauseOffset = Math.max(0, Math.min(this.duration, targetSec));
    if (wasPlaying) {
      this.play(this.pauseOffset);
    } else if (this.onTimeUpdate) {
      this.onTimeUpdate(this.pauseOffset, this.pauseOffset / (this.duration || 1));
    }
  }

  startProgress() {
    const tick = () => {
      if (!this.isPlaying || !this.ctx) return;
      const elapsed = this.ctx.currentTime - this.startTime;
      if (this.onTimeUpdate && this.duration > 0) {
        this.onTimeUpdate(elapsed, Math.min(1, elapsed / this.duration));
      }
      if (this.isPlaying) {
        this.animFrame = requestAnimationFrame(tick);
      }
    };
    this.animFrame = requestAnimationFrame(tick);
  }
}

export const voiceEngine = new VoiceAudioEngine();
