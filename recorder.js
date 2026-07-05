// Laser Flow — clip recorder (canvas + audio → WebM)
(function (global) {
  'use strict'

  function ClipRecorder() {
    this.recorder = null
    this.chunks = []
    this.stream = null
    this.recording = false
  }

  ClipRecorder.isSupported = function () {
    return typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function'
  }

  ClipRecorder.prototype.start = function (canvas, audioStream) {
    if (this.recording) return true
    try {
      var fps = 60
      var canvasStream = canvas.captureStream(fps)
      var tracks = canvasStream.getVideoTracks().slice()
      if (audioStream) tracks = tracks.concat(audioStream.getAudioTracks())
      this.stream = new MediaStream(tracks)
      var mime = this.pickMime()
      this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
      this.chunks = []
      var self = this
      this.recorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) self.chunks.push(e.data) }
      this.recorder.start(250)
      this.recording = true
      return true
    } catch (e) { this.recording = false; return false }
  }

  ClipRecorder.prototype.pickMime = function () {
    var candidates = [
      'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm',
    ]
    for (var i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i]
    }
    return null
  }

  ClipRecorder.prototype.stop = function (cb) {
    var self = this
    if (!this.recorder || !this.recording) { if (cb) cb(null); return }
    this.recorder.onstop = function () {
      var type = self.recorder.mimeType || 'video/webm'
      var blob = new Blob(self.chunks, { type: type })
      self.recording = false
      self.recorder = null
      self.stream = null
      if (cb) cb(blob)
    }
    try { this.recorder.stop() } catch (e) { if (cb) cb(null) }
  }

  ClipRecorder.prototype.cancel = function () {
    if (this.recorder && this.recording) {
      try { this.recorder.onstop = null; this.recorder.stop() } catch (e) {}
    }
    this.recording = false
    this.recorder = null
    this.stream = null
    this.chunks = []
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(function () { URL.revokeObjectURL(url) }, 4000)
  }

  global.LF.Recorder = { ClipRecorder: ClipRecorder, downloadBlob: downloadBlob }
})(window)
