// Laser Flow — procedural Web Audio engine (music + SFX, no audio files)
(function (global) {
  'use strict'

  function AudioEngine() {
    this.ctx = null
    this.master = null
    this.musicGain = null
    this.sfxGain = null
    this.musicFilter = null
    this.delay = null
    this.feedback = null
    this.wet = null
    this.musicTimer = null
    this.nextNoteTime = 0
    this.step = 0
    this.intensity = 0
    this.targetIntensity = 0
    this.musicOn = true
    this.sfxOn = true
    this.started = false
    this.droneOscs = []
    this.streamDest = null
  }

  AudioEngine.prototype.init = function () {
    if (this.ctx) return
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(this.ctx.destination)

      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = this.sfxOn ? 0.9 : 0
      this.sfxGain.connect(this.master)

      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.value = 0.0
      this.musicFilter = this.ctx.createBiquadFilter()
      this.musicFilter.type = 'lowpass'
      this.musicFilter.frequency.value = 600
      this.musicFilter.Q.value = 6
      this.musicGain.connect(this.musicFilter)
      this.musicFilter.connect(this.master)

      this.delay = this.ctx.createDelay(1.0)
      this.delay.delayTime.value = 0.34
      this.feedback = this.ctx.createGain()
      this.feedback.gain.value = 0.34
      this.wet = this.ctx.createGain()
      this.wet.gain.value = 0.32
      this.musicFilter.connect(this.delay)
      this.delay.connect(this.feedback)
      this.feedback.connect(this.delay)
      this.delay.connect(this.wet)
      this.wet.connect(this.master)
    } catch (e) { this.ctx = null }
  }

  AudioEngine.prototype.resume = function () {
    this.init()
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
  }

  AudioEngine.prototype.getStream = function () {
    this.init()
    if (!this.ctx || !this.master) return null
    if (!this.streamDest) {
      this.streamDest = this.ctx.createMediaStreamDestination()
      this.master.connect(this.streamDest)
    }
    return this.streamDest.stream
  }

  AudioEngine.prototype.setMusicEnabled = function (on) {
    this.musicOn = on
    if (!this.ctx || !this.musicGain) return
    var t = this.ctx.currentTime
    this.musicGain.gain.cancelScheduledValues(t)
    this.musicGain.gain.setTargetAtTime(on && this.started ? 0.5 : 0, t, 0.15)
  }

  AudioEngine.prototype.setSfxEnabled = function (on) {
    this.sfxOn = on
    if (!this.ctx || !this.sfxGain) return
    this.sfxGain.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05)
  }

  AudioEngine.prototype.setIntensity = function (v) {
    this.targetIntensity = Math.max(0, Math.min(1, v))
  }

  AudioEngine.prototype.startMusic = function () {
    this.init()
    if (!this.ctx || !this.musicGain) return
    this.resume()
    this.started = true
    var t = this.ctx.currentTime
    this.musicGain.gain.cancelScheduledValues(t)
    this.musicGain.gain.setTargetAtTime(this.musicOn ? 0.5 : 0, t, 1.2)
    this.startDrone()
    if (this.musicTimer == null) {
      this.nextNoteTime = this.ctx.currentTime + 0.1
      this.step = 0
      var self = this
      this.musicTimer = setInterval(function () { self.scheduler() }, 25)
    }
  }

  AudioEngine.prototype.stopMusic = function () {
    this.started = false
    if (this.musicTimer != null) { clearInterval(this.musicTimer); this.musicTimer = null }
    this.stopDrone()
    if (this.ctx && this.musicGain) {
      var t = this.ctx.currentTime
      this.musicGain.gain.cancelScheduledValues(t)
      this.musicGain.gain.setTargetAtTime(0, t, 0.4)
    }
  }

  AudioEngine.prototype.startDrone = function () {
    if (!this.ctx || !this.musicGain || this.droneOscs.length) return
    var base = 55
    var ratios = [1, 1.5, 2.0]
    for (var i = 0; i < ratios.length; i++) {
      var o = this.ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = base * ratios[i]
      var g = this.ctx.createGain()
      g.gain.value = ratios[i] === 1 ? 0.12 : 0.05
      o.connect(g); g.connect(this.musicGain); o.start()
      this.droneOscs.push({ o: o, g: g })
    }
  }

  AudioEngine.prototype.stopDrone = function () {
    if (!this.ctx) return
    var t = this.ctx.currentTime
    for (var i = 0; i < this.droneOscs.length; i++) {
      try {
        this.droneOscs[i].g.gain.setTargetAtTime(0, t, 0.3)
        this.droneOscs[i].o.stop(t + 0.8)
      } catch (e) {}
    }
    this.droneOscs = []
  }

  AudioEngine.prototype.scheduler = function () {
    if (!this.ctx) return
    this.intensity += (this.targetIntensity - this.intensity) * 0.05
    if (this.musicFilter) {
      var cutoff = 500 + this.intensity * 4500
      this.musicFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.2)
    }
    var tempo = 100 + this.intensity * 60
    var stepDur = 60 / tempo / 4
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextNoteTime)
      this.nextNoteTime += stepDur
      this.step = (this.step + 1) % 32
    }
  }

  AudioEngine.prototype.scheduleStep = function (step, time) {
    if (!this.ctx || !this.musicGain) return
    var I = this.intensity
    var scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25]
    if (step % 8 === 0) this.note(110, time, 0.22, 'triangle', 0.18 + I * 0.12, this.musicGain)
    if (step % 4 === 0 && I > 0.25) this.kick(time, 0.18 + I * 0.2)
    if (step % 2 === 1 && I > 0.45) this.hat(time, 0.04 + I * 0.05)
    var arpChance = 0.25 + I * 0.6
    if (Math.random() < arpChance) {
      var n = scale[(step + Math.floor(Math.random() * 3)) % scale.length]
      var oct = Math.random() < 0.3 ? 2 : 1
      this.note(n * oct, time, 0.14, 'sawtooth', 0.05 + I * 0.08, this.musicGain)
    }
    if (step % 16 === 0 && I > 0.6) this.note(659.25, time, 0.9, 'sine', 0.06, this.musicGain)
  }

  AudioEngine.prototype.note = function (freq, time, dur, type, vol, dest) {
    if (!this.ctx) return
    var o = this.ctx.createOscillator()
    o.type = type; o.frequency.value = freq
    var g = this.ctx.createGain()
    g.gain.setValueAtTime(0, time)
    g.gain.linearRampToValueAtTime(vol, time + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
    o.connect(g); g.connect(dest)
    o.start(time); o.stop(time + dur + 0.05)
  }

  AudioEngine.prototype.kick = function (time, vol) {
    if (!this.ctx || !this.musicGain) return
    var o = this.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(120, time)
    o.frequency.exponentialRampToValueAtTime(40, time + 0.12)
    var g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, time)
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18)
    o.connect(g); g.connect(this.musicGain)
    o.start(time); o.stop(time + 0.2)
  }

  AudioEngine.prototype.hat = function (time, vol) {
    if (!this.ctx || !this.musicGain) return
    var bufferSize = 0.05 * this.ctx.sampleRate
    var buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    var data = buffer.getChannelData(0)
    for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    var src = this.ctx.createBufferSource()
    src.buffer = buffer
    var hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'; hp.frequency.value = 7000
    var g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, time)
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
    src.connect(hp); hp.connect(g); g.connect(this.musicGain)
    src.start(time); src.stop(time + 0.06)
  }

  AudioEngine.prototype.sfx = function (name) {
    if (!this.sfxOn) return
    this.init()
    if (!this.ctx || !this.sfxGain) return
    this.resume()
    var t = this.ctx.currentTime
    switch (name) {
      case 'click': this.blip(660, t, 0.08, 'square', 0.18); this.blip(880, t + 0.03, 0.06, 'square', 0.12); break
      case 'hover': this.blip(520, t, 0.05, 'sine', 0.07); break
      case 'back': this.blip(440, t, 0.07, 'square', 0.14); this.blip(330, t + 0.04, 0.07, 'square', 0.1); break
      case 'tick': this.blip(1200, t, 0.04, 'square', 0.08); break
      case 'countdown': this.blip(440, t, 0.18, 'sine', 0.22); this.blip(660, t + 0.02, 0.16, 'triangle', 0.12); break
      case 'go': this.blip(880, t, 0.12, 'square', 0.24); this.blip(1320, t + 0.05, 0.2, 'sawtooth', 0.18); this.sweep(t, 400, 2000, 0.3, 0.15); break
      case 'start': this.sweep(t, 200, 1400, 0.5, 0.2); break
      case 'warn': this.blip(1400, t, 0.05, 'square', 0.1); break
      case 'closeCall': this.sweep(t, 1800, 600, 0.12, 0.14); break
      case 'special': this.sweep(t, 300, 1600, 0.4, 0.16); this.blip(880, t + 0.18, 0.2, 'sawtooth', 0.12); break
      case 'death': this.noiseBurst(t, 0.4, 0.3); this.sweep(t, 600, 60, 0.6, 0.3); this.blip(160, t + 0.02, 0.4, 'sawtooth', 0.22); break
    }
  }

  AudioEngine.prototype.blip = function (freq, time, dur, type, vol) {
    if (!this.ctx || !this.sfxGain) return
    var o = this.ctx.createOscillator()
    o.type = type; o.frequency.value = freq
    var g = this.ctx.createGain()
    g.gain.setValueAtTime(0, time)
    g.gain.linearRampToValueAtTime(vol, time + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
    o.connect(g); g.connect(this.sfxGain)
    o.start(time); o.stop(time + dur + 0.05)
  }

  AudioEngine.prototype.sweep = function (start, fromF, toF, dur, vol) {
    if (!this.ctx || !this.sfxGain) return
    var o = this.ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(fromF, start)
    o.frequency.exponentialRampToValueAtTime(Math.max(1, toF), start + dur)
    var g = this.ctx.createGain()
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(vol, start + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    var lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 2200
    o.connect(lp); lp.connect(g); g.connect(this.sfxGain)
    o.start(start); o.stop(start + dur + 0.05)
  }

  AudioEngine.prototype.noiseBurst = function (start, dur, vol) {
    if (!this.ctx || !this.sfxGain) return
    var bufferSize = dur * this.ctx.sampleRate
    var buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    var data = buffer.getChannelData(0)
    for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    var src = this.ctx.createBufferSource()
    src.buffer = buffer
    var lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 1800
    var g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, start)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    src.connect(lp); lp.connect(g); g.connect(this.sfxGain)
    src.start(start); src.stop(start + dur + 0.05)
  }

  AudioEngine.prototype.dispose = function () {
    this.stopMusic()
    if (this.ctx) { try { this.ctx.close() } catch (e) {} this.ctx = null }
  }

  var _engine = null
  function getAudio() { if (!_engine) _engine = new AudioEngine(); return _engine }

  global.LF.Audio = { getAudio: getAudio, AudioEngine: AudioEngine }
})(window)
