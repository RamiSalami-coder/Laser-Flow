// Laser Flow — main app controller. Screen state machine + UI + event wiring.
(function (global) {
  'use strict'
  var C = global.LF.Config
  var S = global.LF.Storage
  var getAudio = global.LF.Audio.getAudio
  var Engine = global.LF.Engine.GameEngine
  var ClipRecorder = global.LF.Recorder.ClipRecorder
  var downloadBlob = global.LF.Recorder.downloadBlob
  var fmt = C.formatTime
  var TAU = Math.PI * 2

  function withAlpha(hex, a) {
    if (hex.indexOf('rgb') === 0) return hex
    var h = hex.slice(1)
    if (h.length === 3) h = h.split('').map(function (c) { return c + c }).join('')
    return 'rgba(' + parseInt(h.slice(0,2),16) + ',' + parseInt(h.slice(2,4),16) + ',' + parseInt(h.slice(4,6),16) + ',' + a + ')'
  }
  function el(id) { return document.getElementById(id) }
  function svg(name) {
    var paths = {
      play: '<path d="M8 5v14l11-7z"/>',
      pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
      sound: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
      mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
      music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
      musicOff: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><line x1="2" y1="2" x2="22" y2="22"/>',
      vibrate: '<path d="m2 8 2 6-2 6"/><path d="m22 8-2 6 2 6"/><path d="M4 14h16"/>',
      vibrateOff: '<path d="m2 8 2 6-2 6"/><path d="m22 8-2 6 2 6"/><path d="M4 14h16"/><line x1="2" y1="2" x2="22" y2="22"/>',
      send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
      crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>',
      trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    }
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || '') + '</svg>'
  }

  function App() {
    this.settings = S.loadSettings()
    this.best = S.loadBestTimes()
    this.unlocked = S.loadUnlockedAchievements()
    this.screen = 'home'
    this.dailyMode = false
    this.dailySeed = C.getTodaySeed()
    this.dailyBest = S.loadDailyBestLocal(this.dailySeed, this.settings.difficulty)
    this.engine = null
    this.recorder = null
    this.clipBlob = null
    this.firstRun = S.isFirstRun()
    this.liveTime = 0
    this.liveIntensity = 0
    this.flow = 0
    this.flowMult = 1
    this.effects = { shield: false, slowmoUntil: 0, phaseUntil: 0, multiplierUntil: 0 }
    this.result = null
    this.newlyUnlocked = []
    this.bgRaf = null
    this.specialTimer = null
    this.milestoneTimer = null
    this.countdownTimers = []
    this.clipSupported = ClipRecorder.isSupported()
    this.isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
  }

  App.prototype.init = function () {
    var self = this
    this.cacheEls()
    this.renderHome()
    this.renderSettings()
    this.startBgAnimation()
    this.attachGlobalEvents()
    // hide loading
    setTimeout(function () { el('loading').classList.add('hide') }, 200)
    // audio unlock
    var unlock = function () {
      var audio = getAudio()
      audio.resume(); audio.setSfxEnabled(self.settings.sound)
      if (self.settings.music) { audio.setMusicEnabled(true); audio.startMusic(); audio.setIntensity(0.1) }
      window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock)
    window.addEventListener('resize', function () { if (self.engine) self.engine.resize() })
  }

  App.prototype.cacheEls = function () {
    this.els = {
      home: el('screen-home'), settings: el('screen-settings'),
      countdown: el('screen-countdown'), hud: el('hud'),
      pause: el('screen-pause'), gameover: el('screen-gameover'),
      bgCanvas: el('bg-canvas'), gameCanvas: el('game-canvas'),
      watermark: el('watermark'), joyzone: el('joystick-zone'),
      tutorial: el('tutorial-hint'),
    }
  }

  // ---------- screen switching ----------
  App.prototype.showScreen = function (name) {
    this.screen = name
    var map = { home: this.els.home, settings: this.els.settings, countdown: this.els.countdown, playing: this.els.hud, paused: this.els.pause, gameover: this.els.gameover }
    this.els.home.classList.add('hidden')
    this.els.settings.classList.add('hidden')
    this.els.countdown.classList.add('hidden')
    this.els.hud.classList.add('hidden')
    this.els.pause.classList.add('hidden')
    this.els.gameover.classList.add('hidden')
    if (map[name]) map[name].classList.remove('hidden')
    var gameActive = name === 'countdown' || name === 'playing' || name === 'paused' || name === 'gameover'
    this.els.bgCanvas.classList.toggle('hidden', gameActive)
    this.els.gameCanvas.classList.toggle('hidden', !gameActive)
    this.els.watermark.classList.toggle('hidden', !(name === 'playing' || name === 'countdown'))
    this.els.watermark.textContent = this.dailyMode ? 'DAILY · LASER FLOW' : 'LASER FLOW'
    if (this.isTouch) this.els.joyzone.classList.toggle('hidden', name !== 'playing')
    // audio intensity
    var audio = getAudio()
    if (name === 'playing') audio.setIntensity(0)
    else if (name === 'countdown') audio.setIntensity(0.06)
    else if (name === 'home' || name === 'settings') audio.setIntensity(0.12)
    else if (name === 'gameover' || name === 'paused') audio.setIntensity(0.15)
  }

  // ---------- home rendering ----------
  App.prototype.renderHome = function () {
    var self = this, diff = C.DIFFICULTIES[this.settings.difficulty]
    // diff dot
    var dot = el('home-diff-dot'); dot.style.background = diff.color; dot.style.boxShadow = '0 0 12px ' + diff.color
    // difficulty chips
    var container = el('home-difficulty-chips'); container.innerHTML = ''
    var order = ['easy', 'normal', 'hard', 'insane']
    order.forEach(function (d) {
      var cfg = C.DIFFICULTIES[d], active = self.settings.difficulty === d
      var btn = document.createElement('button')
      btn.className = 'diff-chip'; btn.textContent = cfg.name
      if (active) { btn.style.borderColor = withAlpha(cfg.color, 0.7); btn.style.background = withAlpha(cfg.color, 0.14); btn.style.boxShadow = '0 0 16px ' + withAlpha(cfg.color, 0.35); btn.style.color = '#fff' }
      btn.onclick = function () { self.updateSettings({ difficulty: d }); self.click(); self.renderHome() }
      btn.onpointerenter = function () { self.hover() }
      container.appendChild(btn)
    })
    el('home-best-diff').textContent = diff.name
    el('home-best-time').textContent = fmt(this.best[this.settings.difficulty] || 0)
    el('home-daily-best').textContent = fmt(this.dailyBest)
    el('home-seed').textContent = this.dailySeed
    this.renderToggles()
  }

  App.prototype.renderToggles = function () {
    var self = this
    function setup(id, key, onIcon, offIcon) {
      var btn = el(id), on = self.settings[key]
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
      btn.innerHTML = on ? svg(onIcon) : svg(offIcon)
      btn.onclick = function () {
        var patch = {}; patch[key] = !self.settings[key]
        self.updateSettings(patch)
        var audio = getAudio()
        if (key === 'sound') { audio.setSfxEnabled(self.settings.sound); if (self.settings.sound) audio.sfx('click') }
        else if (key === 'music') { audio.resume(); audio.setMusicEnabled(self.settings.music); if (self.settings.music) audio.startMusic() }
        else if (key === 'vibration') { if (self.settings.vibration && navigator.vibrate) navigator.vibrate(20) }
        if (self.settings.sound && key !== 'sound') audio.sfx('click')
        self.renderToggles()
      }
    }
    setup('btn-sound', 'sound', 'sound', 'mute')
    setup('btn-music', 'music', 'music', 'musicOff')
    setup('btn-vibration', 'vibration', 'vibrate', 'vibrateOff')
  }

  // ---------- settings rendering ----------
  App.prototype.renderSettings = function () {
    var self = this, c = el('settings-content'); c.innerHTML = ''
    var s = this.settings

    function section(title, hint) {
      var sec = document.createElement('section'); sec.className = 'settings-section'
      var h = document.createElement('h3'); h.textContent = title
      var p = hint ? document.createElement('p') : null; if (p) { p.className = 'hint'; p.textContent = hint }
      sec.appendChild(h); if (p) sec.appendChild(p)
      c.appendChild(sec); return sec
    }
    function chipGrid(values, current, onChange, blurb) {
      var wrap = document.createElement('div'); wrap.className = blurb ? 'chip-grid-blurb' : 'chip-grid'
      values.forEach(function (v) {
        var btn = document.createElement('button')
        btn.className = 'opt-chip' + (blurb ? ' opt-chip-blurb' : '')
        btn.textContent = v.label
        if (blurb && v.blurb) { var b = document.createElement('span'); b.className = 'blurb'; b.textContent = v.blurb; btn.appendChild(b) }
        var active = current === v.id
        if (active && v.color) { btn.style.borderColor = withAlpha(v.color, 0.7); btn.style.background = withAlpha(v.color, 0.12); btn.style.boxShadow = '0 0 16px ' + withAlpha(v.color, 0.3); btn.style.color = '#fff' }
        btn.onclick = function () { onChange(v.id) }; btn.onpointerenter = function () { self.hover() }
        wrap.appendChild(btn)
      })
      return wrap
    }

    // Difficulty
    var s1 = section('Difficulty', 'Spawn rate, warning time, ramp speed')
    s1.appendChild(chipGrid(
      Object.keys(C.DIFFICULTIES).map(function (d) { return { id: d, label: C.DIFFICULTIES[d].name, blurb: C.DIFFICULTIES[d].blurb, color: C.DIFFICULTIES[d].color } }),
      s.difficulty, function (v) { self.updateSettings({ difficulty: v }); self.click(); self.renderSettings() }, true
    ))
    // Arena size
    var s2 = section('Arena Size', 'Bigger arena = more room to maneuver')
    s2.appendChild(chipGrid(Object.keys(C.ARENA_SIZES).map(function (k) { return { id: k, label: C.ARENA_SIZES[k].name } }), s.arenaSize, function (v) { self.updateSettings({ arenaSize: v }); self.click(); self.renderSettings() }))
    // Laser speed
    var s3 = section('Laser Speed', 'Rotation & wall closing speed')
    s3.appendChild(chipGrid(Object.keys(C.LASER_SPEEDS).map(function (k) { return { id: k, label: C.LASER_SPEEDS[k].name } }), s.laserSpeed, function (v) { self.updateSettings({ laserSpeed: v }); self.click(); self.renderSettings() }))
    // Skins
    var s4 = section('Player Skin', 'Color & visual effect')
    var skinGrid = document.createElement('div'); skinGrid.className = 'skin-grid'
    C.SKIN_LIST.forEach(function (skin) {
      var active = s.skin === skin.id
      var dc = skin.id === 'custom' ? s.customColor : skin.color
      var dg = skin.id === 'custom' ? s.customColor : skin.glow
      var card = document.createElement('button'); card.className = 'skin-card'
      if (active) { card.style.borderColor = withAlpha(dc, 0.7); card.style.background = withAlpha(dc, 0.12); card.style.boxShadow = '0 0 16px ' + withAlpha(dc, 0.3) }
      card.onclick = function () { self.updateSettings({ skin: skin.id }); self.click(); self.renderSettings() }
      card.onpointerenter = function () { self.hover() }
      var dot = document.createElement('span'); dot.className = 'skin-dot'; dot.style.background = withAlpha(dc, 0.9); dot.style.boxShadow = '0 0 12px ' + dg
      dot.innerHTML = '<span class="skin-dot-inner"></span>'
      var info = document.createElement('span'); info.style.minWidth = '0'
      info.innerHTML = '<span class="skin-name">' + skin.name + '</span><span class="skin-desc">' + skin.description + '</span>'
      card.appendChild(dot); card.appendChild(info)
      if (active) { var chk = document.createElement('span'); chk.className = 'skin-check'; chk.style.color = dc; chk.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'; card.appendChild(chk) }
      skinGrid.appendChild(card)
    })
    s4.appendChild(skinGrid)
    // custom color picker
    if (s.skin === 'custom') {
      var row = document.createElement('div'); row.className = 'custom-color-row'
      var label = document.createElement('label'); label.textContent = 'Custom color'
      var inp = document.createElement('input'); inp.type = 'color'; inp.value = s.customColor
      inp.onchange = function () { self.updateSettings({ customColor: inp.value }); self.click(); self.renderSettings() }
      var hex = document.createElement('span'); hex.className = 'custom-color-hex'; hex.textContent = s.customColor.toUpperCase()
      var swatchRow = document.createElement('div'); swatchRow.className = 'swatch-row'
      ;['#22d3ee','#f472b6','#a3e635','#fbbf24','#a855f7','#fb7185','#34d399','#38bdf8'].forEach(function (col) {
        var sw = document.createElement('button'); sw.className = 'swatch'; sw.style.background = col
        sw.onclick = function () { self.updateSettings({ customColor: col }); self.click(); self.renderSettings() }
        swatchRow.appendChild(sw)
      })
      row.appendChild(label); row.appendChild(inp); row.appendChild(hex); row.appendChild(swatchRow)
      s4.appendChild(row)
    }
    // Themes
    var s5 = section('Arena Theme', 'Colors, lighting & background vibe')
    var themeGrid = document.createElement('div'); themeGrid.className = 'theme-grid'
    C.THEME_LIST.forEach(function (theme) {
      var active = s.theme === theme.id
      var card = document.createElement('button'); card.className = 'theme-card'
      if (active) { card.style.borderColor = withAlpha(theme.accent, 0.7); card.style.boxShadow = '0 0 16px ' + withAlpha(theme.accent, 0.3) }
      card.onclick = function () { self.updateSettings({ theme: theme.id }); self.click(); self.renderSettings(); self.startBgAnimation() }
      card.onpointerenter = function () { self.hover() }
      var strip = document.createElement('div'); strip.className = 'theme-strip'; strip.style.background = 'linear-gradient(135deg, ' + theme.bgTop + ', ' + theme.bgBottom + ')'
      theme.lasers.forEach(function (col) { var b = document.createElement('span'); b.className = 'theme-strip-bar'; b.style.background = col; b.style.boxShadow = '0 0 8px ' + col; strip.appendChild(b) })
      var nm = document.createElement('div'); nm.className = 'theme-name'; nm.textContent = theme.name
      if (active) { var chk = document.createElement('span'); chk.style.color = theme.accent; chk.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'; nm.appendChild(chk) }
      card.appendChild(strip); card.appendChild(nm); themeGrid.appendChild(card)
    })
    s5.appendChild(themeGrid)
    // Controls
    var s6 = section('Controls', 'Touch sensitivity for mobile joystick')
    var cr = document.createElement('div'); cr.className = 'control-row'
    cr.innerHTML = '<div class="label-line"><span class="control-label">Joystick Sensitivity</span><span class="control-value">' + s.joystickSensitivity.toFixed(1) + '×</span></div>'
    var range = document.createElement('input'); range.type = 'range'; range.min = '0.5'; range.max = '1.5'; range.step = '0.1'; range.value = s.joystickSensitivity
    range.oninput = function () { self.updateSettings({ joystickSensitivity: parseFloat(range.value) }); cr.querySelector('.control-value').textContent = parseFloat(range.value).toFixed(1) + '×' }
    cr.appendChild(range)
    var rl = document.createElement('div'); rl.className = 'range-labels'; rl.innerHTML = '<span>Slow</span><span>Normal</span><span>Fast</span>'; cr.appendChild(rl)
    s6.appendChild(cr)
    // Accessibility
    var s7 = section('Accessibility', 'Reduce flashing and motion for comfort')
    function toggleRow(label, hint, key, color) {
      var active = self.settings[key]
      var btn = document.createElement('button'); btn.className = 'toggle-row'
      if (active) { btn.style.borderColor = withAlpha(color, 0.6); btn.style.background = withAlpha(color, 0.1) }
      btn.innerHTML = '<span><span class="toggle-label">' + label + '</span><span class="toggle-hint">' + hint + '</span></span>'
      var sw = document.createElement('span'); sw.className = 'switch'; sw.style.background = active ? color : 'rgba(255,255,255,0.15)'
      if (active) sw.style.boxShadow = '0 0 10px ' + withAlpha(color, 0.5)
      var knob = document.createElement('span'); knob.className = 'switch-knob'; knob.style.transform = active ? 'translateX(22px)' : 'translateX(2px)'; sw.appendChild(knob)
      btn.appendChild(sw)
      btn.onclick = function () { var patch = {}; patch[key] = !self.settings[key]; self.updateSettings(patch); self.click(); self.renderSettings() }
      return btn
    }
    s7.appendChild(toggleRow('Reduce Flash', 'Softer warning blinks, death & event flashes', 'reduceFlash', '#fbbf24'))
    var sp = document.createElement('div'); sp.style.height = '10px'; s7.appendChild(sp)
    s7.appendChild(toggleRow('Reduced Motion', 'Less camera shake & fewer particles', 'reducedMotion', '#a855f7'))
  }

  // ---------- background animation (menu) ----------
  App.prototype.startBgAnimation = function () {
    var self = this
    if (this.bgRaf) cancelAnimationFrame(this.bgRaf)
    var canvas = this.els.bgCanvas, ctx = canvas.getContext('2d')
    var w = 0, h = 0, dpr = 1, beams = [], dots = []
    function resize() {
      var rect = canvas.getBoundingClientRect(); w = rect.width; h = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      var theme = C.THEMES[self.settings.theme]
      var beamCount = Math.max(4, Math.min(8, Math.round(w / 220)))
      beams = []
      for (var i = 0; i < beamCount; i++) beams.push({ x: Math.random() * w, y: Math.random() * h, angle: Math.random() * TAU, speed: 0.15 + Math.random() * 0.35, len: Math.max(w, h) * 1.4, thick: 1.5 + Math.random() * 2.5, color: theme.lasers[Math.floor(Math.random() * theme.lasers.length)], phase: Math.random() * TAU })
      dots = []
      for (var j = 0; j < 60; j++) dots.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, r: 0.5 + Math.random() * 1.8 })
    }
    resize()
    var last = performance.now()
    function draw(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now
      var theme = C.THEMES[self.settings.theme]
      var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, theme.bgTop); g.addColorStop(1, theme.bgBottom)
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = theme.grid; ctx.lineWidth = 1; ctx.beginPath()
      for (var x = 0; x <= w; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
      for (var y = 0; y <= h; y += 40) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
      ctx.stroke()
      ctx.globalCompositeOperation = 'lighter'
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i]; d.x += d.vx * dt; d.y += d.vy * dt
        if (d.x < 0) d.x += w; if (d.x > w) d.x -= w; if (d.y < 0) d.y += h; if (d.y > h) d.y -= h
        ctx.fillStyle = withAlpha(theme.particle, 0.5); ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill()
      }
      for (i = 0; i < beams.length; i++) {
        var b = beams[i]; b.phase += b.speed * dt
        var ang = b.angle + Math.sin(b.phase) * 0.6
        var ex = b.x + Math.cos(ang) * b.len, ey = b.y + Math.sin(ang) * b.len
        var sx = b.x - Math.cos(ang) * b.len, sy = b.y - Math.sin(ang) * b.len
        var pulse = 0.5 + 0.5 * Math.sin(b.phase * 1.7)
        ctx.strokeStyle = withAlpha(b.color, 0.05 + 0.06 * pulse); ctx.lineWidth = b.thick + 10; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke()
        ctx.strokeStyle = withAlpha(b.color, 0.18 + 0.18 * pulse); ctx.lineWidth = b.thick; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'
      var vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75)
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, theme.vignette); ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h)
      self.bgRaf = requestAnimationFrame(draw)
    }
    self.bgRaf = requestAnimationFrame(draw)
  }

  // ---------- sound helpers ----------
  App.prototype.click = function () { if (this.settings.sound) getAudio().sfx('click') }
  App.prototype.hover = function () { if (this.settings.sound) getAudio().sfx('hover') }
  App.prototype.back = function () { if (this.settings.sound) getAudio().sfx('back') }

  App.prototype.updateSettings = function (patch) {
    var next = Object.assign({}, this.settings, patch)
    this.settings = next; S.saveSettings(next)
    if (patch.difficulty || patch.theme) {
      this.dailyBest = S.loadDailyBestLocal(this.dailySeed, this.settings.difficulty)
      this.renderHome()
    }
  }

  // ---------- event wiring ----------
  App.prototype.attachGlobalEvents = function () {
    var self = this
    el('btn-customize').onclick = function () { self.click(); self.showScreen('settings') }
    el('btn-start').onclick = function () { self.beginRun(false) }
    el('btn-daily').onclick = function () { self.beginRun(true) }
    el('btn-settings-back').onclick = function () { self.back(); self.showScreen('home') }
    el('btn-pause').onclick = function () { self.handlePause() }
    el('btn-resume').onclick = function () { self.click(); if (self.engine) self.engine.resume(); self.showScreen('playing') }
    el('btn-pause-settings').onclick = function () { self.click(); self.cleanupRun(); self.showScreen('settings') }
    el('btn-pause-home').onclick = function () { self.back(); self.cleanupRun(); self.dailyMode = false; self.showScreen('home') }
    el('btn-replay').onclick = function () { self.handleReplay() }
    el('btn-go-settings').onclick = function () { self.click(); self.cleanupRun(); self.showScreen('settings') }
    el('btn-go-home').onclick = function () { self.back(); self.cleanupRun(); self.dailyMode = false; self.showScreen('home') }
    el('btn-save-clip').onclick = function () { self.handleSaveClip() }
    if (this.isTouch) this.attachJoystick()
  }

  // ---------- joystick ----------
  App.prototype.attachJoystick = function () {
    var self = this, zone = this.els.joyzone, radius = 60, touchId = null, origin = { x: 0, y: 0 }
    var baseEl = null, knobEl = null
    function start(e) {
      if (touchId != null) return
      var t = e.changedTouches[0]; touchId = t.identifier
      var rect = zone.getBoundingClientRect()
      origin = { x: t.clientX - rect.left, y: t.clientY - rect.top }
      baseEl = document.createElement('div'); baseEl.className = 'joy-base'
      baseEl.style.left = origin.x + 'px'; baseEl.style.top = origin.y + 'px'
      knobEl = document.createElement('div'); knobEl.className = 'joy-knob'
      baseEl.appendChild(knobEl); zone.appendChild(baseEl)
      e.preventDefault()
    }
    function move(e) {
      if (touchId == null) return
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i]; if (t.identifier !== touchId) continue
        var rect = zone.getBoundingClientRect()
        var dx = t.clientX - rect.left - origin.x, dy = t.clientY - rect.top - origin.y
        var dist = Math.hypot(dx, dy), clamped = Math.min(dist, radius), ang = Math.atan2(dy, dx)
        if (knobEl) knobEl.style.transform = 'translate(calc(-50% + ' + (Math.cos(ang) * clamped) + 'px), calc(-50% + ' + (Math.sin(ang) * clamped) + 'px))'
        if (self.engine) self.engine.setJoystick((clamped / radius) * Math.cos(ang), (clamped / radius) * Math.sin(ang))
        e.preventDefault()
      }
    }
    function end(e) {
      for (var i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier !== touchId) continue; touchId = null; if (baseEl) baseEl.remove(); if (self.engine) self.engine.setJoystick(0, 0); e.preventDefault() }
    }
    zone.addEventListener('touchstart', start, { passive: false })
    zone.addEventListener('touchmove', move, { passive: false })
    zone.addEventListener('touchend', end, { passive: false })
    zone.addEventListener('touchcancel', end, { passive: false })
  }

  // ---------- run lifecycle ----------
  App.prototype.beginRun = function (daily) {
    this.click(); getAudio().resume()
    var seed = C.getTodaySeed()
    this.dailyMode = daily; this.dailySeed = seed
    this.liveTime = 0; this.liveIntensity = 0; this.flow = 0; this.flowMult = 1
    this.effects = { shield: false, slowmoUntil: 0, phaseUntil: 0, multiplierUntil: 0 }
    this.result = null; this.newlyUnlocked = []; this.clipBlob = null
    this.createEngine()
    this.startCountdown()
  }

  App.prototype.createEngine = function () {
    if (this.engine) { this.engine.destroy(); this.engine = null }
    var self = this
    var seed = this.dailyMode ? this.dailySeed : undefined
    this.engine = new Engine(this.els.gameCanvas, this.settings, {
      onDeath: function (time, stats) {
        if (self.recorder && self.recorder.recording) self.recorder.stop(function (blob) { self.clipBlob = blob })
        var diff = self.settings.difficulty, isDaily = self.dailyMode, runSeed = self.dailyMode ? self.dailySeed : undefined
        var isNewBest = false
        if (isDaily && runSeed) { var r = S.saveDailyBestLocal(runSeed, diff, time); isNewBest = r.isNewBest; self.dailyBest = S.loadDailyBestLocal(runSeed, diff) }
        else { var r2 = S.recordBest(diff, time); self.best = r2.times; isNewBest = r2.isNewBest }
        var fullStats = { time: time, flowMax: stats.flowMax, nearMisses: stats.nearMisses, powerUpsUsed: stats.powerUpsUsed, specialsCleared: stats.specialsCleared }
        var newly = []
        C.ACHIEVEMENTS.forEach(function (a) { if (!self.unlocked[a.id] && a.check(fullStats, self.settings)) { self.unlocked[a.id] = true; newly.push(a) } })
        S.saveUnlockedAchievements(self.unlocked)
        self.newlyUnlocked = newly
        self.result = { time: time, difficulty: diff, isNewBest: isNewBest, stats: fullStats, daily: isDaily, seed: runSeed }
        getAudio().setIntensity(0.15)
        self.renderGameOver()
        self.showScreen('gameover')
      },
      onTime: function (t) { self.liveTime = t; el('hud-time').textContent = fmt(t) },
      onIntensity: function (v) { self.liveIntensity = v; getAudio().setIntensity(v); self.updateIntensityBar() },
      onSpecial: function (label) { self.showSpecial(label) },
      onFlow: function (f, m) { self.flow = f; self.flowMult = m; self.updateFlowMeter() },
      onPowerUp: function (active) { self.effects = active; self.updatePowerBadges() },
      onMilestone: function (seconds) { self.showMilestone(seconds) },
      onPauseRequest: function () { if (self.screen === 'playing') self.handlePause() },
    }, seed)
    requestAnimationFrame(function () { if (self.engine) self.engine.resize() })
  }

  App.prototype.startCountdown = function () {
    var self = this, audio = getAudio()
    this.showScreen('countdown')
    var cd = el('countdown-text'), n = 3
    function show(v) { cd.textContent = v === 0 ? 'GO!' : String(v); cd.classList.toggle('go', v === 0); cd.classList.remove('cd-enter'); void cd.offsetWidth; cd.classList.add('cd-enter') }
    show(3); if (this.settings.sound) audio.sfx('countdown')
    this.countdownTimers.push(setTimeout(function () { show(2); if (self.settings.sound) audio.sfx('countdown') }, 900))
    this.countdownTimers.push(setTimeout(function () { show(1); if (self.settings.sound) audio.sfx('countdown') }, 1800))
    this.countdownTimers.push(setTimeout(function () { show(0); if (self.settings.sound) audio.sfx('go') }, 2700))
    this.countdownTimers.push(setTimeout(function () { self.beginPlay() }, 3500))
  }

  App.prototype.beginPlay = function () {
    if (this.settings.sound) getAudio().sfx('start')
    if (this.engine) this.engine.start()
    // recorder
    if (this.clipSupported && !this.recorder) this.recorder = new ClipRecorder()
    if (this.recorder) this.recorder.start(this.els.gameCanvas, getAudio().getStream())
    if (this.firstRun) { S.markFirstRunDone(); this.firstRun = false; this.showTutorial() }
    this.resetHud()
    this.showScreen('playing')
  }

  App.prototype.resetHud = function () {
    var diff = C.DIFFICULTIES[this.settings.difficulty]
    el('hud-diff-dot').style.background = diff.color; el('hud-diff-dot').style.boxShadow = '0 0 8px ' + diff.color
    el('hud-diff-name').textContent = diff.name.toUpperCase(); el('hud-diff-name').style.color = diff.color
    var bestT = this.dailyMode ? this.dailyBest : (this.best[this.settings.difficulty] || 0)
    el('hud-best').textContent = 'BEST ' + fmt(bestT)
    el('hud-time').textContent = '00:00.00'
    this.updateIntensityBar(); this.updateFlowMeter(); this.updatePowerBadges()
  }

  App.prototype.updateIntensityBar = function () {
    var diff = C.DIFFICULTIES[this.settings.difficulty]
    var bar = el('hud-intensity')
    bar.style.width = Math.round(this.liveIntensity * 100) + '%'
    bar.style.background = 'linear-gradient(90deg, ' + diff.color + ', #f43f5e)'
  }
  App.prototype.updateFlowMeter = function () {
    var color = this.flowMult >= 4 ? '#f43f5e' : this.flowMult >= 3 ? '#fbbf24' : this.flowMult >= 2 ? '#a855f7' : '#22d3ee'
    el('flow-mult').textContent = '×' + this.flowMult; el('flow-mult').style.color = color
    var bar = el('flow-bar')
    bar.style.height = this.flow + '%'
    bar.style.background = 'linear-gradient(0deg, ' + color + ', ' + withAlpha(color, 0.8) + ')'
    bar.style.boxShadow = '0 0 12px ' + color
  }
  App.prototype.updatePowerBadges = function () {
    var now = performance.now(), c = el('powerup-badges'); c.innerHTML = ''
    var self = this
    function badge(label, color) {
      var d = document.createElement('div'); d.className = 'pu-badge'; d.textContent = label
      d.style.background = withAlpha(color, 0.18); d.style.border = '1.5px solid ' + withAlpha(color, 0.7); d.style.color = color; d.style.boxShadow = '0 0 12px ' + withAlpha(color, 0.4)
      c.appendChild(d)
    }
    if (this.effects.shield) badge('S', C.POWER_UP_META.shield.color)
    if (now < this.effects.slowmoUntil) badge('T', C.POWER_UP_META.slowmo.color)
    if (now < this.effects.phaseUntil) badge('P', C.POWER_UP_META.phase.color)
    if (now < this.effects.multiplierUntil) badge('2×', C.POWER_UP_META.multiplier.color)
  }
  App.prototype.showSpecial = function (label) {
    var self = this, l = el('special-label')
    l.textContent = label; l.classList.remove('hidden')
    if (this.specialTimer) clearTimeout(this.specialTimer)
    this.specialTimer = setTimeout(function () { l.classList.add('hidden') }, 1500)
  }
  App.prototype.showMilestone = function (seconds) {
    var self = this, m = el('milestone')
    m.innerHTML = '<div class="ms-num">' + seconds + 's</div><div class="ms-label" style="color:' + C.DIFFICULTIES[this.settings.difficulty].color + '">SURVIVED</div>'
    m.classList.remove('hidden')
    if (this.milestoneTimer) clearTimeout(this.milestoneTimer)
    this.milestoneTimer = setTimeout(function () { m.classList.add('hidden') }, 1600)
  }
  App.prototype.showTutorial = function () {
    var t = el('tutorial-hint')
    el('tutorial-main').innerHTML = this.isTouch ? 'Drag anywhere to move' : 'Move with <span style="color:#22d3ee">WASD</span> / <span style="color:#22d3ee">Arrows</span>'
    t.classList.remove('hidden')
    setTimeout(function () { t.classList.add('hidden') }, 4200)
  }

  App.prototype.handlePause = function () {
    if (this.screen !== 'playing') return
    if (this.engine) this.engine.pause()
    getAudio().setIntensity(0.08)
    this.click(); this.showScreen('paused')
  }
  App.prototype.handleReplay = function () {
    this.click(); this.cleanupRun()
    this.liveTime = 0; this.liveIntensity = 0; this.flow = 0; this.flowMult = 1
    this.effects = { shield: false, slowmoUntil: 0, phaseUntil: 0, multiplierUntil: 0 }
    this.result = null; this.newlyUnlocked = []; this.clipBlob = null
    this.createEngine(); this.startCountdown()
  }
  App.prototype.cleanupRun = function () {
    if (this.recorder) { this.recorder.cancel() }
    this.clipBlob = null
    this.countdownTimers.forEach(function (t) { clearTimeout(t) }); this.countdownTimers = []
  }
  App.prototype.handleSaveClip = function () {
    var blob = this.clipBlob; if (!blob) return
    var label = el('save-clip-label'); label.textContent = 'Saving...'
    var tag = this.result && this.result.daily ? 'daily' : (this.result && this.result.difficulty || 'run')
    downloadBlob(blob, 'laser-flow-' + tag + '-' + Math.round(this.result ? this.result.time : 0) + 's.webm')
    setTimeout(function () { label.textContent = 'Save Clip' }, 600)
  }

  // ---------- game over rendering ----------
  App.prototype.renderGameOver = function () {
    var self = this, r = this.result, diff = C.DIFFICULTIES[r.difficulty], shownBest = Math.max(r.daily && r.seed ? S.loadDailyBestLocal(r.seed, r.difficulty) : (this.best[r.difficulty] || 0), r.time)
    el('go-label').textContent = r.daily ? 'DAILY SURVIVAL' : 'SURVIVAL TIME'
    var timeEl = el('go-time'); timeEl.textContent = fmt(r.time); timeEl.style.textShadow = '0 0 22px ' + withAlpha(diff.color, 0.6)
    el('go-newbest').classList.toggle('hidden', !r.isNewBest)
    el('go-msg').textContent = this.encourage(r.time, r.isNewBest)
    var panel = el('gameover-panel'); panel.style.borderColor = withAlpha(diff.color, 0.35)
    // stats
    var st = C.POWER_UP_META
    var stats = el('go-stats'); stats.innerHTML = ''
    function stat(icon, label, val) { var d = document.createElement('div'); d.className = 'stat-card'; d.innerHTML = '<div class="stat-icon">' + icon + '<span>' + label + '</span></div><div class="stat-val">' + val + '</div>'; stats.appendChild(d) }
    stat('<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>', 'BEST', fmt(shownBest))
    stat('<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + diff.color + ';box-shadow:0 0 8px ' + diff.color + '"></span>', 'DIFFICULTY', diff.name)
    stat('<span style="color:#f0abfc;font-size:14px">✨</span>', 'MAX FLOW', Math.round(r.stats.flowMax) + '%')
    stat('<span style="color:#fbbf24;font-size:14px">⚡</span>', 'NEAR MISSES', String(r.stats.nearMisses))
    stat('<span style="font-size:14px">🛡️</span>', 'POWER-UPS', String(r.stats.powerUpsUsed))
    stat('<span style="font-size:14px">🌀</span>', 'SPECIALS', String(r.stats.specialsCleared))
    // achievements
    var ach = el('go-achievements')
    if (this.newlyUnlocked.length > 0) {
      ach.classList.remove('hidden')
      ach.innerHTML = '<div class="ach-title">ACHIEVEMENT UNLOCKED</div>'
      var list = document.createElement('div'); list.className = 'ach-list'
      this.newlyUnlocked.forEach(function (a) { var c = document.createElement('span'); c.className = 'ach-chip'; c.title = a.description; c.innerHTML = '<span>' + a.icon + '</span>' + a.name; list.appendChild(c) })
      ach.appendChild(list)
    } else ach.classList.add('hidden')
    // daily panel
    var dp = el('go-daily-panel')
    if (r.daily && r.seed) { dp.classList.remove('hidden'); this.renderDailyPanel(dp, r.seed, r.difficulty, r.time) }
    else dp.classList.add('hidden')
    // save clip
    el('btn-save-clip').classList.toggle('hidden', !this.clipSupported)
    el('save-clip-label').textContent = 'Save Clip'
  }

  App.prototype.renderDailyPanel = function (container, seed, difficulty, time) {
    var self = this
    container.className = 'daily-panel'
    container.innerHTML = ''
    var head = document.createElement('div'); head.className = 'daily-panel-head'
    head.innerHTML = svg('trophy') + '<span>YOUR DAILY RUNS · ' + difficulty.toUpperCase() + '</span>'
    container.appendChild(head)
    var scores = S.loadDailyHistory(seed, difficulty)
    var bestTime = scores.length > 0 ? scores[0].time : 0
    var submitted = false
    var nameInput = document.createElement('input'); nameInput.className = 'daily-input'; nameInput.type = 'text'; nameInput.placeholder = 'Your name'; nameInput.maxLength = 16; nameInput.value = S.loadDailyName()
    var submitBtn = document.createElement('button'); submitBtn.className = 'daily-submit'; submitBtn.innerHTML = svg('send') + '<span>Save</span>'
    var inputRow = document.createElement('div'); inputRow.className = 'daily-input-row'; inputRow.appendChild(nameInput); inputRow.appendChild(submitBtn)
    container.appendChild(inputRow)
    var msg = document.createElement('div'); msg.className = 'daily-msg hidden'; container.appendChild(msg)
    var meta = document.createElement('div'); meta.className = 'daily-meta'
    meta.innerHTML = '<span>' + svg('trophy') + ' Today\'s best: ' + fmt(bestTime) + '</span><span>' + scores.length + (scores.length === 1 ? ' run' : ' runs') + '</span>'
    container.appendChild(meta)
    var list = document.createElement('div'); list.className = 'daily-list lf-scroll'
    function renderList() {
      list.innerHTML = ''
      if (scores.length === 0) { list.innerHTML = '<div style="padding:12px;text-align:center;font-size:11px;color:rgba(255,255,255,0.3)">No runs yet. Save this one!</div>'; return }
      scores.forEach(function (s, i) {
        var li = document.createElement('div'); li.className = 'daily-list-item'
        if (i === 0) li.style.background = 'rgba(251,191,36,0.1)'
        li.innerHTML = '<span class="rank">' + (i + 1) + '</span>' + (i === 0 ? '<svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>' : '') + '<span class="nm">' + escapeHtml(s.name) + '</span><span class="tm">' + fmt(s.time) + '</span>'
        list.appendChild(li)
      })
    }
    renderList(); container.appendChild(list)
    submitBtn.onclick = function () {
      var trimmed = (nameInput.value.trim().slice(0, 16) || 'Player')
      S.saveDailyName(trimmed)
      scores = S.saveDailyHistoryEntry(seed, difficulty, trimmed, time)
      bestTime = scores.length > 0 ? scores[0].time : 0
      var isTop = scores.length > 0 && scores[0].time === time
      msg.className = 'daily-msg ok'; msg.textContent = isTop ? 'New daily best saved!' : 'Run saved to your history.'
      inputRow.style.display = 'none'
      meta.innerHTML = '<span>' + svg('trophy') + ' Today\'s best: ' + fmt(bestTime) + '</span><span>' + scores.length + (scores.length === 1 ? ' run' : ' runs') + '</span>'
      renderList()
    }
  }

  App.prototype.encourage = function (time, isNewBest) {
    if (isNewBest) return 'NEW RECORD! Untouchable.'
    if (time < 8) return 'So close! Keep moving.'
    if (time < 20) return 'Nice flow. Push further.'
    if (time < 40) return 'Sharp reflexes! Go again.'
    if (time < 70) return 'Incredible focus. One more?'
    return 'Can you beat your record?'
  }

  function escapeHtml(s) { return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }

  // ---------- boot ----------
  global.LF.App = App
  document.addEventListener('DOMContentLoaded', function () {
    var app = new App(); app.init(); global.LF.app = app
  })
})(window)
