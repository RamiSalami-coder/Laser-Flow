// Laser Flow — core game engine (Canvas, 60 FPS). Plain JS port.
// Systems: seeded RNG, 8-dir movement, laser lifecycle, 6 base + 5 new laser
// events, anti-camp Stalker, Flow meter, power-ups, milestones, slow-mo,
// particles, camera shake, bloom glow, themed rendering, accessibility.
(function (global) {
  'use strict'
  var C = global.LF.Config
  var getAudio = global.LF.Audio.getAudio
  var TAU = Math.PI * 2
  var BASE = { spawnInterval: 1150, warnTime: 820, activeTime: 1350, fadeTime: 260, maxConcurrent: 5, playerSpeed: 330 }
  var MILESTONES = [30, 60, 90, 120, 150, 180]

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }
  function withAlpha(hex, alpha) {
    if (hex.indexOf('rgba') === 0 || hex.indexOf('rgb') === 0) return hex
    if (hex.charAt(0) === '#') {
      var h = hex.slice(1)
      if (h.length === 3) h = h.split('').map(function (c) { return c + c }).join('')
      var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
    }
    return hex
  }
  function lighten(hex, amt) {
    if (hex.charAt(0) !== '#') return hex
    var h = hex.slice(1)
    if (h.length === 3) h = h.split('').map(function (c) { return c + c }).join('')
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
    var nr = Math.round(r + (255 - r) * amt), ng = Math.round(g + (255 - g) * amt), nb = Math.round(b + (255 - b) * amt)
    return '#' + nr.toString(16).padStart(2, '0') + ng.toString(16).padStart(2, '0') + nb.toString(16).padStart(2, '0')
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }

  function GameEngine(canvas, settings, cb, seed) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.settings = settings
    this.cb = cb
    this.theme = C.THEMES[settings.theme]
    this.diff = C.DIFFICULTIES[settings.difficulty]
    this.seed = seed
    this.dpr = 1; this.cw = 0; this.ch = 0
    this.arenaX = 0; this.arenaY = 0; this.arenaW = 0; this.arenaH = 0
    this.rafId = null; this.lastTime = 0; this.running = false; this.paused = false; this.mode = 'idle'
    this.startTime = 0; this.elapsed = 0; this.deathTime = 0; this.deathElapsed = 0
    this.player = { x: 0, y: 0, vx: 0, vy: 0, radius: 11, trail: [], alive: true }
    this.lasers = []; this.particles = []; this.ambient = []; this.powerUps = []
    this.nextSpawnAt = 0; this.nextPowerUpAt = 0; this.laserId = 1; this.powerUpId = 1
    this.flow = 0; this.flowMax = 0; this.nearMisses = 0; this.powerUpsUsed = 0
    this.specialsCleared = 0; this.lastNearMiss = 0; this.lastFlowEmit = 0; this.lastFlowTier = 1
    this.effects = { shield: false, slowmoUntil: 0, phaseUntil: 0, multiplierUntil: 0 }
    this.lastEffectsSig = ''
    this.dwellRef = { x: 0, y: 0 }; this.dwellTime = 0; this.nextMilestoneIdx = 0
    this.shake = 0; this.shakeX = 0; this.shakeY = 0; this.flashAlpha = 0; this.intensity = 0
    this.keys = {}; this.joyX = 0; this.joyY = 0; this.usingTouch = false
    this.rng = Math.random
    this.setupRng(seed)
    var self = this
    this.resize()
    this.initAmbient()
    this.attachInput()
    this.player.x = this.arenaX + this.arenaW / 2
    this.player.y = this.arenaY + this.arenaH / 2
    this.dwellRef = { x: this.player.x, y: this.player.y }
    this.mode = 'idle'; this.running = true; this.lastTime = performance.now()
    this._loopBound = function () { self.loop() }
    this._loopBound()
  }

  GameEngine.prototype.setupRng = function (seed) {
    if (seed) {
      var h = 1779033703 ^ seed.length
      for (var i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
      var s = h >>> 0
      this.rng = function () {
        s = (s + 0x6d2b79f5) | 0
        var t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    } else { this.rng = Math.random }
  }
  GameEngine.prototype.pick = function (arr) { return arr[Math.floor(this.rng() * arr.length)] }
  Object.defineProperty(GameEngine.prototype, 'reduceFlash', { get: function () {
    return this.settings.reduceFlash || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }})
  Object.defineProperty(GameEngine.prototype, 'reducedMotion', { get: function () { return this.settings.reducedMotion }})
  GameEngine.prototype.flashMul = function () { return this.reduceFlash ? 0.3 : 1 }
  GameEngine.prototype.playerColor = function () {
    return this.settings.skin === 'custom' ? this.settings.customColor : C.SKINS[this.settings.skin].color
  }
  GameEngine.prototype.playerGlow = function () {
    return this.settings.skin === 'custom' ? lighten(this.settings.customColor, 0.45) : C.SKINS[this.settings.skin].glow
  }
  GameEngine.prototype.playerEffect = function () { return C.SKINS[this.settings.skin].effect }

  GameEngine.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect()
    this.cw = rect.width; this.ch = rect.height
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.floor(this.cw * this.dpr); this.canvas.height = Math.floor(this.ch * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.computeArena()
    this.player.x = clamp(this.player.x, this.arenaX + this.player.radius, this.arenaX + this.arenaW - this.player.radius)
    this.player.y = clamp(this.player.y, this.arenaY + this.player.radius, this.arenaY + this.arenaH - this.player.radius)
  }
  GameEngine.prototype.computeArena = function () {
    var scale = C.ARENA_SIZES[this.settings.arenaSize].scale
    var size = Math.min(this.cw, this.ch) * scale
    this.arenaW = size; this.arenaH = size
    this.arenaX = (this.cw - size) / 2; this.arenaY = (this.ch - size) / 2
  }
  GameEngine.prototype.initAmbient = function () {
    this.ambient = []
    var count = this.reducedMotion ? 24 : 46
    for (var i = 0; i < count; i++) {
      this.ambient.push({ x: this.rng() * this.cw, y: this.rng() * this.ch, vx: (this.rng() - 0.5) * 8, vy: (this.rng() - 0.5) * 8, life: 1, maxLife: 1, size: 0.6 + this.rng() * 1.8, color: this.theme.particle })
    }
  }
  GameEngine.prototype.attachInput = function () {
    var self = this
    this._onKeyDown = function (e) {
      var k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) !== -1) { self.keys[k] = true; e.preventDefault() }
      if (k === 'escape' || k === 'p') self.cb.onPauseRequest && self.cb.onPauseRequest()
    }
    this._onKeyUp = function (e) { delete self.keys[e.key.toLowerCase()] }
    this._onBlur = function () { self.keys = {} }
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('blur', this._onBlur)
  }
  GameEngine.prototype.setJoystick = function (x, y) { this.joyX = x; this.joyY = y; this.usingTouch = Math.abs(x) + Math.abs(y) > 0.01 }

  GameEngine.prototype.start = function () {
    this.running = true; this.paused = false; this.mode = 'play'
    var now = performance.now()
    this.startTime = now; this.lastTime = now; this.elapsed = 0; this.deathTime = 0; this.deathElapsed = 0
    this.lasers = []; this.particles = []; this.powerUps = []
    this.nextSpawnAt = now + 500; this.nextPowerUpAt = now + 7000 + this.rng() * 3000
    this.shake = 0; this.flashAlpha = 0; this.intensity = 0
    this.flow = 0; this.flowMax = 0; this.nearMisses = 0; this.powerUpsUsed = 0
    this.specialsCleared = 0; this.nextMilestoneIdx = 0; this.lastFlowEmit = 0; this.lastFlowTier = 1; this.lastEffectsSig = ''
    this.effects = { shield: false, slowmoUntil: 0, phaseUntil: 0, multiplierUntil: 0 }
    this.player.alive = true; this.player.x = this.arenaX + this.arenaW / 2; this.player.y = this.arenaY + this.arenaH / 2
    this.player.vx = 0; this.player.vy = 0; this.player.trail = []
    this.dwellRef = { x: this.player.x, y: this.player.y }; this.dwellTime = 0
  }
  GameEngine.prototype.pause = function () { if (!this.running || !this.player.alive) return; this.paused = true }
  GameEngine.prototype.resume = function () { if (!this.running || !this.player.alive) return; this.paused = false; this.lastTime = performance.now() }
  GameEngine.prototype.destroy = function () {
    this.running = false
    if (this.rafId != null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onBlur)
  }

  GameEngine.prototype.loop = function () {
    if (!this.running) return
    var self = this
    this.rafId = requestAnimationFrame(function () { self.loop() })
    var now = performance.now()
    var dt = (now - this.lastTime) / 1000
    this.lastTime = now
    if (dt > 0.05) dt = 0.05
    if (this.mode === 'idle') { this.updateAmbient(dt); this.render(dt); return }
    if (this.paused) { this.render(0); return }
    this.update(dt, now); this.render(dt)
  }

  GameEngine.prototype.update = function (dt, now) {
    var slowmo = now < this.effects.slowmoUntil
    var simDt = slowmo ? dt * 0.45 : dt
    if (this.player.alive) {
      this.elapsed = (now - this.startTime) / 1000
      if (this.cb.onTime) this.cb.onTime(this.elapsed)
      this.checkMilestones()
    } else {
      this.deathElapsed += dt
      if (this.deathElapsed > 1.1) {
        this.running = false
        this.cb.onDeath(this.deathTime, { flowMax: this.flowMax, nearMisses: this.nearMisses, powerUpsUsed: this.powerUpsUsed, specialsCleared: this.specialsCleared })
        return
      }
    }
    var progress = this.elapsed / 55
    var ramp = 1 + Math.min(progress, 2.2) * this.diff.rampMult * 0.55
    var targetIntensity = Math.min(progress * this.diff.rampMult, 1)
    this.intensity += (targetIntensity - this.intensity) * 0.04
    if (this.cb.onIntensity) this.cb.onIntensity(this.intensity)
    if (this.player.alive) {
      this.updatePlayer(simDt); this.updateFlow(simDt, now)
      this.maybeSpawn(now, ramp); this.maybeSpawnPowerUp(now)
      this.checkDwell(simDt, now); this.updateLasers(simDt, now)
      this.updatePowerUps(simDt, now); this.checkCollisions(now)
    } else { this.updateLasers(simDt, now); this.updatePowerUps(simDt, now) }
    this.updateParticles(simDt); this.updateAmbient(dt)
    this.shake *= Math.pow(0.0001, dt)
    if (this.shake < 0.05) this.shake = 0
    this.shakeX = (this.rng() - 0.5) * this.shake; this.shakeY = (this.rng() - 0.5) * this.shake
    this.flashAlpha *= Math.pow(0.0005, dt)
  }

  GameEngine.prototype.updatePlayer = function (dt) {
    var p = this.player, ix = 0, iy = 0
    if (this.keys['a'] || this.keys['arrowleft']) ix -= 1
    if (this.keys['d'] || this.keys['arrowright']) ix += 1
    if (this.keys['w'] || this.keys['arrowup']) iy -= 1
    if (this.keys['s'] || this.keys['arrowdown']) iy += 1
    if (this.usingTouch) { ix = this.joyX; iy = this.joyY }
    var mag = Math.hypot(ix, iy)
    if (mag > 1) { ix /= mag; iy /= mag }
    var sens = clamp(this.settings.joystickSensitivity, 0.5, 1.5)
    var speedMult = C.ARENA_SIZES[this.settings.arenaSize].playerSpeedMult * (1 + this.intensity * 0.06) * sens
    var maxSpeed = BASE.playerSpeed * speedMult
    var tvx = ix * maxSpeed, tvy = iy * maxSpeed
    var accel = 1 - Math.pow(0.0001, dt)
    p.vx += (tvx - p.vx) * accel; p.vy += (tvy - p.vy) * accel
    p.x += p.vx * dt; p.y += p.vy * dt
    var r = p.radius
    p.x = clamp(p.x, this.arenaX + r, this.arenaX + this.arenaW - r)
    p.y = clamp(p.y, this.arenaY + r, this.arenaY + this.arenaH - r)
    p.trail.push({ x: p.x, y: p.y })
    if (p.trail.length > 14) p.trail.shift()
    var effect = this.playerEffect(), glow = this.playerGlow()
    if ((effect === 'spark' || effect === 'trail') && Math.hypot(p.vx, p.vy) > 60 && this.rng() < 0.6 && !this.reducedMotion) {
      this.particles.push({ x: p.x, y: p.y, vx: -p.vx * 0.1 + (this.rng() - 0.5) * 30, vy: -p.vy * 0.1 + (this.rng() - 0.5) * 30, life: 0.5, maxLife: 0.5, size: 1.5 + this.rng() * 1.5, color: glow })
    }
  }

  GameEngine.prototype.updateFlow = function (dt, now) {
    if (now - this.lastNearMiss > 700) this.flow -= 6 * dt
    if (this.flow < 0) this.flow = 0
    if (this.flow > 100) this.flow = 100
    if (this.flow > this.flowMax) this.flowMax = this.flow
    var tier = this.flowTier()
    if (now - this.lastFlowEmit > 120 || tier !== this.lastFlowTier) {
      this.lastFlowEmit = now; this.lastFlowTier = tier
      if (this.cb.onFlow) this.cb.onFlow(this.flow, this.flowMultiplier())
    }
  }
  GameEngine.prototype.flowTier = function () { if (this.flow >= 75) return 4; if (this.flow >= 50) return 3; if (this.flow >= 25) return 2; return 1 }
  GameEngine.prototype.flowMultiplier = function () { return this.flowTier() }
  GameEngine.prototype.chargeFlow = function (amount) {
    var mult = performance.now() < this.effects.multiplierUntil ? 2 : 1
    this.flow = Math.min(100, this.flow + amount * mult)
    if (this.flow > this.flowMax) this.flowMax = this.flow
  }

  GameEngine.prototype.maybeSpawn = function (now, ramp) {
    var interval = BASE.spawnInterval / (this.diff.spawnRateMult * (0.7 + ramp * 0.5))
    if (now < this.nextSpawnAt) return
    var maxConcurrent = Math.floor(BASE.maxConcurrent * this.diff.maxConcurrentMult + this.intensity * 4)
    var activeCount = 0
    for (var i = 0; i < this.lasers.length; i++) if (this.lasers[i].state !== 'fading') activeCount++
    if (activeCount >= maxConcurrent) { this.nextSpawnAt = now + 120; return }
    this.spawnLaser(now, ramp)
    this.nextSpawnAt = now + interval * (0.7 + this.rng() * 0.6)
  }
  GameEngine.prototype.currentTimes = function (ramp) {
    var warn = Math.max(260, BASE.warnTime * this.diff.warnTimeMult * (1 / (0.6 + ramp * 0.4)))
    var active = BASE.activeTime * this.diff.activeTimeMult * (1 + this.intensity * 0.25)
    return { warn: warn, active: active, fade: BASE.fadeTime }
  }

  GameEngine.prototype.spawnLaser = function (now, ramp) {
    var t = this.currentTimes(ramp), color = this.pick(this.theme.lasers), r = this.rng(), kind = 'line'
    if (r < this.diff.specialChance) {
      kind = this.pick(['rotating', 'pulsing', 'wall', 'grid', 'homing', 'shrink', 'mirror', 'sliding'])
      if (this.rng() < 0.18) { this.spawnFlashBurst(now, ramp); return }
    }
    switch (kind) {
      case 'rotating': this.spawnRotating(now, t.warn, t.active, t.fade, color); break
      case 'pulsing': this.spawnPulsing(now, t.warn, t.active, t.fade, color); break
      case 'wall': this.spawnWall(now, t.warn, t.active, t.fade, color); break
      case 'grid': this.spawnGrid(now, t.warn, t.active, t.fade, color); break
      case 'homing': this.spawnHoming(now, t.warn, t.active, t.fade, color); break
      case 'shrink': this.spawnShrink(now, t.warn, t.active, t.fade, color); break
      case 'mirror': this.spawnMirror(now, t.warn, t.active, t.fade, color); break
      case 'sliding': this.spawnSliding(now, t.warn, t.active, t.fade, color); break
      default: this.spawnLine(now, t.warn, t.active, t.fade, color)
    }
  }

  GameEngine.prototype.spawnLine = function (now, warn, active, fade, color, forcedPos) {
    var orient = this.pick(['h', 'v', 'd']), a = { x: 0, y: 0 }, b = { x: 0, y: 0 }, thickness = 5 + this.rng() * 3
    if (forcedPos) {
      var o = this.pick(['h', 'v'])
      if (o === 'h') { a = { x: this.arenaX, y: forcedPos.y }; b = { x: this.arenaX + this.arenaW, y: forcedPos.y } }
      else { a = { x: forcedPos.x, y: this.arenaY }; b = { x: forcedPos.x, y: this.arenaY + this.arenaH } }
      this.pushLaser({ kind: 'stalker', a: a, b: b, thickness: 7, color: '#f43f5e', warn: warn, active: active, fade: fade, now: now, target: { x: forcedPos.x, y: forcedPos.y } }); return
    }
    var pos = 0, safe = false, margin = 30, attempt
    for (attempt = 0; attempt < 5; attempt++) {
      if (orient === 'h') {
        pos = this.arenaY + margin + this.rng() * (this.arenaH - margin * 2)
        a = { x: this.arenaX, y: pos }; b = { x: this.arenaX + this.arenaW, y: pos }
        if (Math.abs(pos - this.player.y) > 60) { safe = true; break }
      } else if (orient === 'v') {
        pos = this.arenaX + margin + this.rng() * (this.arenaW - margin * 2)
        a = { x: pos, y: this.arenaY }; b = { x: pos, y: this.arenaY + this.arenaH }
        if (Math.abs(pos - this.player.x) > 60) { safe = true; break }
      } else {
        var cc = this.pick([[0, 0, 1, 1], [1, 0, 0, 1], [0.15, 0, 1, 0.85], [0, 0.15, 0.85, 1]])
        a = { x: this.arenaX + cc[0] * this.arenaW, y: this.arenaY + cc[1] * this.arenaH }
        b = { x: this.arenaX + cc[2] * this.arenaW, y: this.arenaY + cc[3] * this.arenaH }
        if (this.pointLineDist(this.player.x, this.player.y, a, b) > 60) { safe = true; break }
      }
    }
    if (!safe && orient !== 'd') {
      if (orient === 'h') { pos = this.arenaY + this.arenaH / 2 + (this.rng() > 0.5 ? 80 : -80); a = { x: this.arenaX, y: pos }; b = { x: this.arenaX + this.arenaW, y: pos } }
      else { pos = this.arenaX + this.arenaW / 2 + (this.rng() > 0.5 ? 80 : -80); a = { x: pos, y: this.arenaY }; b = { x: pos, y: this.arenaY + this.arenaH } }
    }
    this.pushLaser({ kind: 'line', a: a, b: b, thickness: thickness, color: color, warn: warn, active: active, fade: fade, now: now })
  }

  GameEngine.prototype.spawnRotating = function (now, warn, active, fade, color) {
    if (this.cb.onSpecial) this.cb.onSpecial('SWEEP BEAM'); this.triggerSpecialFx()
    var pivot = { x: this.arenaX + this.arenaW / 2, y: this.arenaY + this.arenaH / 2 }
    var length = Math.hypot(this.arenaW, this.arenaH), ang0 = this.rng() * TAU
    var rotMult = C.LASER_SPEEDS[this.settings.laserSpeed].rotSpeedMult
    var angSpeed = (0.5 + this.rng() * 0.4) * rotMult * (this.rng() > 0.5 ? 1 : -1)
    this.pushLaser({ kind: 'rotating', a: pivot, b: { x: pivot.x + Math.cos(ang0) * length, y: pivot.y + Math.sin(ang0) * length }, angle: ang0, angularSpeed: angSpeed, length: length, thickness: 6, color: color, warn: warn, active: active, fade: fade, now: now })
  }
  GameEngine.prototype.spawnPulsing = function (now, warn, active, fade, color) {
    if (this.cb.onSpecial) this.cb.onSpecial('PULSE GRID'); this.triggerSpecialFx()
    var orient = this.pick(['h', 'v']), pos = orient === 'h' ? this.arenaY + 40 + this.rng() * (this.arenaH - 80) : this.arenaX + 40 + this.rng() * (this.arenaW - 80)
    var a = orient === 'h' ? { x: this.arenaX, y: pos } : { x: pos, y: this.arenaY }
    var b = orient === 'h' ? { x: this.arenaX + this.arenaW, y: pos } : { x: pos, y: this.arenaY + this.arenaH }
    this.pushLaser({ kind: 'pulsing', a: a, b: b, thickness: 6, color: color, warn: warn, active: active, fade: fade, now: now, pulsePeriod: 0.5, pulseOn: true })
  }
  GameEngine.prototype.spawnWall = function (now, warn, active, fade, color) {
    if (this.cb.onSpecial) this.cb.onSpecial('CLOSING WALLS'); this.triggerSpecialFx()
    var horizontal = this.rng() > 0.5, safeCenter = 0.35 + this.rng() * 0.3, safeHalf = 0.12 + this.rng() * 0.05
    this.pushLaser({ kind: 'wall', a: { x: this.arenaX, y: this.arenaY + safeCenter * this.arenaH }, b: { x: this.arenaX + this.arenaW, y: this.arenaY + safeCenter * this.arenaH }, thickness: 10, color: color, warn: warn, active: active, fade: fade, now: now, pulsePeriod: horizontal ? 1 : 0, gaps: [safeCenter, safeHalf] })
  }
  GameEngine.prototype.spawnGrid = function (now, warn, active, fade, color) {
    if (this.cb.onSpecial) this.cb.onSpecial('LASER GRID'); this.triggerSpecialFx()
    var cols = 4, rows = 4, gapCol = Math.floor(this.rng() * cols), gapRow = Math.floor(this.rng() * rows)
    this.pushLaser({ kind: 'grid', a: { x: this.arenaX, y: this.arenaY }, b: { x: this.arenaX + this.arenaW, y: this.arenaY + this.arenaH }, thickness: 5, color: color, warn: warn, active: active, fade: fade, now: now, gaps: [cols, rows, gapCol, gapRow] })
  }
  GameEngine.prototype.spawnHoming = function (now, warn, active, fade, color) {
    if (this.cb.onSpecial) this.cb.onSpecial('HOMING LOCK'); this.triggerSpecialFx()
    this.pushLaser({ kind: 'homing', a: { x: this.arenaX, y: this.arenaY }, b: { x: this.player.x, y: this.player.y }, thickness: 6, color: color, warn: warn, active: active, fade: fade, now: now, target: { x: this.player.x, y: this.player.y } })
  }
  GameEngine.prototype.spawnShrink = function (now, warn, active, fade, color) {
    if (this.cb.onSpecial) this.cb.onSpecial('SHRINK ZONE'); this.triggerSpecialFx()
    this.pushLaser({ kind: 'shrink', a: { x: this.arenaX, y: this.arenaY }, b: { x: this.arenaX + this.arenaW, y: this.arenaY + this.arenaH }, thickness: 8, color: color, warn: warn, active: active, fade: fade, now: now, shrinkFrac: 0, gaps: [0.18] })
  }
  GameEngine.prototype.spawnMirror = function (now, warn, active, fade, color) {
    if (this.cb.onSpecial) this.cb.onSpecial('MIRROR PAIR'); this.triggerSpecialFx()
    var horizontal = this.rng() > 0.5
    var a = horizontal ? { x: this.arenaX, y: this.arenaY + this.arenaH * 0.12 } : { x: this.arenaX + this.arenaW * 0.12, y: this.arenaY }
    var b = horizontal ? { x: this.arenaX + this.arenaW, y: this.arenaY + this.arenaH * 0.12 } : { x: this.arenaX + this.arenaW * 0.12, y: this.arenaY + this.arenaH }
    this.pushLaser({ kind: 'mirror', a: a, b: b, thickness: 6, color: color, warn: warn, active: active, fade: fade, now: now, mirrorOffset: horizontal ? 1 : 0, gaps: [0.12, 0.88] })
  }
  GameEngine.prototype.spawnSliding = function (now, warn, active, fade, color) {
    if (this.cb.onSpecial) this.cb.onSpecial('SLIDING GATE'); this.triggerSpecialFx()
    var horizontal = this.rng() > 0.5
    var pos = horizontal ? this.arenaY + this.arenaH * (0.3 + this.rng() * 0.4) : this.arenaX + this.arenaW * (0.3 + this.rng() * 0.4)
    var a = horizontal ? { x: this.arenaX, y: pos } : { x: pos, y: this.arenaY }
    var b = horizontal ? { x: this.arenaX + this.arenaW, y: pos } : { x: pos, y: this.arenaY + this.arenaH }
    this.pushLaser({ kind: 'sliding', a: a, b: b, thickness: 7, color: color, warn: warn, active: active, fade: fade, now: now, gapPos: this.rng(), gapWidth: 0.18, mirrorOffset: horizontal ? 1 : 0 })
  }
  GameEngine.prototype.spawnFlashBurst = function (now, ramp) {
    if (this.cb.onSpecial) this.cb.onSpecial('RAPID FLASH'); this.triggerSpecialFx()
    var count = 4 + Math.floor(this.rng() * 3), t = this.currentTimes(ramp)
    var flashWarn = Math.max(180, t.warn * 0.35), flashActive = Math.max(420, t.active * 0.5)
    for (var i = 0; i < count; i++) {
      var color = this.pick(this.theme.lasers), orient = this.pick(['h', 'v'])
      var pos = orient === 'h' ? this.arenaY + 30 + this.rng() * (this.arenaH - 60) : this.arenaX + 30 + this.rng() * (this.arenaW - 60)
      var a = orient === 'h' ? { x: this.arenaX, y: pos } : { x: pos, y: this.arenaY }
      var b = orient === 'h' ? { x: this.arenaX + this.arenaW, y: pos } : { x: pos, y: this.arenaY + this.arenaH }
      this.pushLaser({ kind: 'line', a: a, b: b, thickness: 5, color: color, warn: flashWarn, active: flashActive, fade: t.fade, now: now + i * 130 })
    }
  }

  GameEngine.prototype.checkDwell = function (dt, now) {
    var d = Math.hypot(this.player.x - this.dwellRef.x, this.player.y - this.dwellRef.y)
    if (d > 42) { this.dwellRef = { x: this.player.x, y: this.player.y }; this.dwellTime = 0; return }
    this.dwellTime += dt
    var threshold = 2.4 / this.diff.rampMult
    if (this.dwellTime > threshold) {
      this.spawnLine(now, 460, 650, 240, '#f43f5e', { x: this.player.x, y: this.player.y })
      if (this.settings.sound) getAudio().sfx('warn')
      this.dwellRef = { x: this.player.x, y: this.player.y }; this.dwellTime = 0
    }
  }

  GameEngine.prototype.pushLaser = function (o) {
    var born = o.now
    this.lasers.push({
      id: this.laserId++, kind: o.kind, state: 'warning', bornAt: born, warnUntil: born + o.warn, activeUntil: born + o.warn + o.active, fadeUntil: born + o.warn + o.active + o.fade,
      a: o.a, b: o.b, angle: o.angle || 0, angularSpeed: o.angularSpeed || 0, length: o.length || 0, thickness: o.thickness, color: o.color,
      pulseOn: o.pulseOn != null ? o.pulseOn : true, pulsePeriod: o.pulsePeriod || 0, side: o.side, gaps: o.gaps, intensity: 0,
      target: o.target, mirrorOffset: o.mirrorOffset, gapPos: o.gapPos, gapWidth: o.gapWidth, shrinkFrac: o.shrinkFrac,
    })
    if (this.settings.sound) {
      var delay = Math.max(0, born - performance.now())
      var audio = getAudio()
      setTimeout(function () { audio.sfx('warn') }, delay)
    }
  }
  GameEngine.prototype.triggerSpecialFx = function () {
    this.shake = Math.max(this.shake, this.reducedMotion ? 4 : 9)
    this.flashAlpha = Math.max(this.flashAlpha, 0.18 * this.flashMul())
    if (this.settings.sound) getAudio().sfx('special')
    if (this.settings.vibration && navigator.vibrate) navigator.vibrate(30)
  }

  GameEngine.prototype.maybeSpawnPowerUp = function (now) {
    if (now < this.nextPowerUpAt) return
    if (this.powerUps.length >= 2) { this.nextPowerUpAt = now + 4000; return }
    var kinds = ['shield', 'slowmo', 'phase', 'multiplier'], kind = this.pick(kinds)
    var meta = C.POWER_UP_META[kind], x = 0, y = 0, i
    for (i = 0; i < 8; i++) {
      x = this.arenaX + 50 + this.rng() * (this.arenaW - 100); y = this.arenaY + 50 + this.rng() * (this.arenaH - 100)
      if (Math.hypot(x - this.player.x, y - this.player.y) > 90) break
    }
    this.powerUps.push({ id: this.powerUpId++, kind: kind, x: x, y: y, bornAt: now, expireAt: now + 9000, radius: 13, color: meta.color, bob: this.rng() * TAU })
    this.nextPowerUpAt = now + 9000 + this.rng() * 5000
  }
  GameEngine.prototype.updatePowerUps = function (dt, now) {
    for (var i = 0; i < this.powerUps.length; i++) this.powerUps[i].bob += dt * 3
    if (this.player.alive) {
      for (i = this.powerUps.length - 1; i >= 0; i--) {
        var p = this.powerUps[i]
        if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < p.radius + this.player.radius) {
          this.applyPowerUp(p.kind, now); this.powerUps.splice(i, 1); this.powerUpsUsed++
          if (this.cb.onPickup) this.cb.onPickup(p.kind)
          if (this.settings.sound) getAudio().sfx('start')
          if (!this.reducedMotion) {
            for (var j = 0; j < 18; j++) {
              var ang = this.rng() * TAU, spd = 40 + this.rng() * 120
              this.particles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.6, maxLife: 0.6, size: 1.5 + this.rng() * 2, color: p.color })
            }
          }
        }
      }
    }
    var kept = []
    for (i = 0; i < this.powerUps.length; i++) if (now < this.powerUps[i].expireAt) kept.push(this.powerUps[i])
    this.powerUps = kept
    var sig = this.effects.shield + '|' + this.effects.slowmoUntil + '|' + this.effects.phaseUntil + '|' + this.effects.multiplierUntil
    if (sig !== this.lastEffectsSig) {
      this.lastEffectsSig = sig
      if (this.cb.onPowerUp) this.cb.onPowerUp({ shield: this.effects.shield, slowmoUntil: this.effects.slowmoUntil, phaseUntil: this.effects.phaseUntil, multiplierUntil: this.effects.multiplierUntil })
    }
  }
  GameEngine.prototype.applyPowerUp = function (kind, now) {
    if (kind === 'shield') this.effects.shield = true
    else if (kind === 'slowmo') this.effects.slowmoUntil = now + C.POWER_UP_META.slowmo.duration
    else if (kind === 'phase') this.effects.phaseUntil = now + C.POWER_UP_META.phase.duration
    else if (kind === 'multiplier') this.effects.multiplierUntil = now + C.POWER_UP_META.multiplier.duration
  }

  GameEngine.prototype.checkMilestones = function () {
    if (this.nextMilestoneIdx >= MILESTONES.length) return
    var target = MILESTONES[this.nextMilestoneIdx]
    if (this.elapsed >= target) {
      this.nextMilestoneIdx++
      if (this.cb.onMilestone) this.cb.onMilestone(target)
      this.flashAlpha = Math.max(this.flashAlpha, 0.25 * this.flashMul())
      this.shake = Math.max(this.shake, this.reducedMotion ? 3 : 6)
      if (this.settings.sound) getAudio().sfx('go')
      if (this.settings.vibration && navigator.vibrate) navigator.vibrate(20)
    }
  }

  GameEngine.prototype.updateLasers = function (dt, now) {
    for (var i = 0; i < this.lasers.length; i++) {
      var l = this.lasers[i]
      if (now < l.bornAt) continue
      if (l.state === 'warning' && now >= l.warnUntil) { l.state = 'active'; l.intensity = 1; if (this.settings.sound && this.player.alive) getAudio().sfx('tick') }
      else if (l.state === 'active' && now >= l.activeUntil) { l.state = 'fading'; if (this.player.alive && l.kind !== 'line' && l.kind !== 'stalker') this.specialsCleared++ }
      if (l.kind === 'rotating' && l.state === 'active') { l.angle += l.angularSpeed * dt; l.b = { x: l.a.x + Math.cos(l.angle) * l.length, y: l.a.y + Math.sin(l.angle) * l.length } }
      if (l.kind === 'pulsing' && l.state === 'active') { var phase = ((now - l.warnUntil) / 1000) % l.pulsePeriod; l.pulseOn = phase < l.pulsePeriod * 0.5 }
      if (l.kind === 'homing' && l.state === 'warning' && l.target) { l.target.x += (this.player.x - l.target.x) * (1 - Math.pow(0.02, dt)); l.target.y += (this.player.y - l.target.y) * (1 - Math.pow(0.02, dt)); l.b = { x: l.target.x, y: l.target.y } }
      if (l.kind === 'shrink' && l.state === 'active') {
        var dur = l.activeUntil - l.warnUntil, closeDur = dur * 0.45, holdEnd = dur * 0.8, tt = now - l.warnUntil
        if (tt < closeDur) l.shrinkFrac = (tt / closeDur) * (l.gaps[0] || 0.18)
        else if (tt < holdEnd) l.shrinkFrac = l.gaps[0] || 0.18
        else { var rt = (tt - holdEnd) / (dur - holdEnd); l.shrinkFrac = (l.gaps[0] || 0.18) * Math.max(0, 1 - rt) }
      }
      if (l.kind === 'mirror' && l.state === 'active' && l.gaps) {
        var mt = (now - l.warnUntil) / (l.activeUntil - l.warnUntil), s0 = 0.12, s1 = 0.88, mid = 0.5
        l.gaps[0] = s0 + (mid - s0) * mt; l.gaps[1] = s1 + (mid - s1) * mt
      }
      if (l.kind === 'sliding' && l.state === 'active' && l.gapWidth != null) {
        var st = (now - l.warnUntil) / (l.activeUntil - l.warnUntil)
        l.gapPos = 0.1 + 0.8 * (0.5 - 0.5 * Math.cos(st * Math.PI * 2))
      }
      if (l.state === 'warning') { var wt = (now - l.bornAt) / (l.warnUntil - l.bornAt); l.intensity = 0.3 + 0.7 * wt }
      else if (l.state === 'fading') { var ft = (now - l.activeUntil) / (l.fadeUntil - l.activeUntil); l.intensity = Math.max(0, 1 - ft) }
    }
    var kept = []
    for (i = 0; i < this.lasers.length; i++) if (now < this.lasers[i].fadeUntil) kept.push(this.lasers[i])
    this.lasers = kept
  }

  GameEngine.prototype.checkCollisions = function (now) {
    if (!this.player.alive) return
    var p = this.player, phase = now < this.effects.phaseUntil, i
    for (i = 0; i < this.lasers.length; i++) {
      var l = this.lasers[i]
      if (now < l.bornAt || l.state !== 'active') continue
      var hit = false
      if (l.kind === 'line' || l.kind === 'rotating' || l.kind === 'pulsing' || l.kind === 'stalker' || l.kind === 'homing') {
        if (l.kind === 'pulsing' && !l.pulseOn) continue
        var d = this.pointLineDist(p.x, p.y, l.a, l.b)
        if (d < p.radius + l.thickness / 2) hit = true
      } else if (l.kind === 'wall') hit = this.wallHit(l, now)
      else if (l.kind === 'grid') hit = this.gridHit(l)
      else if (l.kind === 'shrink') hit = this.shrinkHit(l)
      else if (l.kind === 'mirror') hit = this.mirrorHit(l)
      else if (l.kind === 'sliding') hit = this.slidingHit(l)
      if (hit) {
        if (phase) {
          if (!this.reducedMotion) { for (var k = 0; k < 6; k++) { var ang = this.rng() * TAU; this.particles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * 80, vy: Math.sin(ang) * 80, life: 0.3, maxLife: 0.3, size: 2, color: '#fbbf24' }) } }
          continue
        }
        if (this.effects.shield) {
          this.effects.shield = false
          this.shake = Math.max(this.shake, this.reducedMotion ? 4 : 10)
          this.flashAlpha = Math.max(this.flashAlpha, 0.3 * this.flashMul())
          if (this.settings.sound) getAudio().sfx('special')
          if (this.settings.vibration && navigator.vibrate) navigator.vibrate(40)
          l.state = 'fading'; l.fadeUntil = now + 120; l.activeUntil = now; continue
        }
        this.die(now); return
      }
      if ((l.kind === 'line' || l.kind === 'rotating' || l.kind === 'homing' || l.kind === 'stalker' || (l.kind === 'pulsing' && l.pulseOn)) && now - this.lastNearMiss > 350) {
        var dd = this.pointLineDist(p.x, p.y, l.a, l.b)
        var near = dd < p.radius + l.thickness / 2 + 16
        if (near && dd >= p.radius + l.thickness / 2) {
          this.lastNearMiss = now; this.nearMisses++; this.chargeFlow(7)
          if (this.settings.sound) getAudio().sfx('closeCall')
          this.shake = Math.max(this.shake, this.reducedMotion ? 1.5 : 3)
          if (this.settings.vibration && navigator.vibrate) navigator.vibrate(12)
        }
      }
    }
  }

  GameEngine.prototype.wallHit = function (l, now) {
    var p = this.player, sc = l.gaps[0], sh = l.gaps[1], horizontal = l.pulsePeriod === 1
    var closeDur = l.activeUntil - l.warnUntil, progress = clamp((now - l.warnUntil) / closeDur, 0, 1)
    var eased = progress < 0.7 ? progress / 0.7 : 1, maxClose = 0.5 - sh, close = eased * maxClose
    if (horizontal) {
      var topEdge = this.arenaY + close * this.arenaH, botEdge = this.arenaY + (1 - close) * this.arenaH
      if (p.y < topEdge + l.thickness / 2 && p.y > topEdge - l.thickness * 2) return true
      if (p.y > botEdge - l.thickness / 2 && p.y < botEdge + l.thickness * 2) return true
    } else {
      var leftEdge = this.arenaX + close * this.arenaW, rightEdge = this.arenaX + (1 - close) * this.arenaW
      if (p.x < leftEdge + l.thickness / 2 && p.x > leftEdge - l.thickness * 2) return true
      if (p.x > rightEdge - l.thickness / 2 && p.x < rightEdge + l.thickness * 2) return true
    }
    return false
  }
  GameEngine.prototype.gridHit = function (l) {
    var p = this.player, g = l.gaps, cols = g[0], rows = g[1], gapCol = g[2], gapRow = g[3]
    var cw = this.arenaW / cols, ch = this.arenaH / rows, i
    for (i = 0; i <= cols; i++) { if (i === gapCol || i === gapCol + 1) continue; var x = this.arenaX + i * cw; if (Math.abs(p.x - x) < p.radius + l.thickness / 2) return true }
    for (i = 0; i <= rows; i++) { if (i === gapRow || i === gapRow + 1) continue; var y = this.arenaY + i * ch; if (Math.abs(p.y - y) < p.radius + l.thickness / 2) return true }
    return false
  }
  GameEngine.prototype.shrinkHit = function (l) {
    var frac = l.shrinkFrac || 0; if (frac <= 0.01) return false
    var p = this.player, left = this.arenaX + frac * this.arenaW, right = this.arenaX + (1 - frac) * this.arenaW
    var top = this.arenaY + frac * this.arenaH, bottom = this.arenaY + (1 - frac) * this.arenaH
    if (p.x < left + p.radius) return true; if (p.x > right - p.radius) return true
    if (p.y < top + p.radius) return true; if (p.y > bottom - p.radius) return true
    return false
  }
  GameEngine.prototype.mirrorHit = function (l) {
    var p = this.player, horizontal = l.mirrorOffset === 1, f0 = l.gaps[0], f1 = l.gaps[1]
    if (horizontal) {
      var y0 = this.arenaY + f0 * this.arenaH, y1 = this.arenaY + f1 * this.arenaH
      if (Math.abs(p.y - y0) < p.radius + l.thickness / 2) return true
      if (Math.abs(p.y - y1) < p.radius + l.thickness / 2) return true
    } else {
      var x0 = this.arenaX + f0 * this.arenaW, x1 = this.arenaX + f1 * this.arenaW
      if (Math.abs(p.x - x0) < p.radius + l.thickness / 2) return true
      if (Math.abs(p.x - x1) < p.radius + l.thickness / 2) return true
    }
    return false
  }
  GameEngine.prototype.slidingHit = function (l) {
    var p = this.player, horizontal = l.mirrorOffset === 1, gp = l.gapPos != null ? l.gapPos : 0.5, gw = l.gapWidth != null ? l.gapWidth : 0.18
    if (horizontal) {
      if (Math.abs(p.y - l.a.y) < p.radius + l.thickness / 2) {
        var relX = (p.x - this.arenaX) / this.arenaW, gapLo = gp - gw / 2, gapHi = gp + gw / 2
        if (relX < gapLo || relX > gapHi) return true
      }
    } else {
      if (Math.abs(p.x - l.a.x) < p.radius + l.thickness / 2) {
        var relY = (p.y - this.arenaY) / this.arenaH, gapLo2 = gp - gw / 2, gapHi2 = gp + gw / 2
        if (relY < gapLo2 || relY > gapHi2) return true
      }
    }
    return false
  }
  GameEngine.prototype.pointLineDist = function (px, py, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(px - a.x, py - a.y)
    var t = ((px - a.x) * dx + (py - a.y) * dy) / len2; t = clamp(t, 0, 1)
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
  }

  GameEngine.prototype.die = function (now) {
    if (!this.player.alive) return
    this.player.alive = false
    this.deathTime = this.elapsed; this.deathElapsed = 0
    this.shake = this.reducedMotion ? 12 : 26; this.flashAlpha = 0.5 * this.flashMul()
    if (this.settings.sound) getAudio().sfx('death')
    if (this.settings.vibration && navigator.vibrate) navigator.vibrate([40, 40, 80])
    var color = this.playerColor(), glow = this.playerGlow(), count = this.reducedMotion ? 30 : 60, i
    for (i = 0; i < count; i++) {
      var ang = this.rng() * TAU, spd = 60 + this.rng() * 280
      this.particles.push({ x: this.player.x, y: this.player.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.8 + this.rng() * 0.6, maxLife: 1.4, size: 1.5 + this.rng() * 3, color: this.rng() < 0.5 ? color : glow })
    }
  }

  GameEngine.prototype.updateParticles = function (dt) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt
      p.vx *= Math.pow(0.02, dt); p.vy *= Math.pow(0.02, dt); p.life -= dt
    }
    var kept = []; for (i = 0; i < this.particles.length; i++) if (this.particles[i].life > 0) kept.push(this.particles[i])
    this.particles = kept
  }
  GameEngine.prototype.updateAmbient = function (dt) {
    for (var i = 0; i < this.ambient.length; i++) {
      var p = this.ambient[i]; p.x += p.vx * dt; p.y += p.vy * dt
      if (p.x < 0) p.x += this.cw; if (p.x > this.cw) p.x -= this.cw
      if (p.y < 0) p.y += this.ch; if (p.y > this.ch) p.y -= this.ch
    }
  }

  // ===== rendering =====
  GameEngine.prototype.render = function (dt) {
    var ctx = this.ctx, now = performance.now()
    ctx.save()
    var grad = ctx.createLinearGradient(0, 0, 0, this.ch)
    grad.addColorStop(0, this.theme.bgTop); grad.addColorStop(1, this.theme.bgBottom)
    ctx.fillStyle = grad; ctx.fillRect(0, 0, this.cw, this.ch)
    if (now < this.effects.slowmoUntil) { ctx.fillStyle = 'rgba(80, 40, 120, 0.12)'; ctx.fillRect(0, 0, this.cw, this.ch) }
    ctx.translate(this.shakeX, this.shakeY)
    this.drawGrid(ctx); this.drawAmbient(ctx); this.drawArenaBorder(ctx)
    this.drawPowerUps(ctx, now)
    ctx.globalCompositeOperation = 'lighter'
    for (var i = 0; i < this.lasers.length; i++) { if (now < this.lasers[i].bornAt) continue; this.drawLaser(ctx, this.lasers[i], now) }
    ctx.globalCompositeOperation = 'source-over'
    if (this.player.alive || this.deathElapsed < 0.5) this.drawPlayer(ctx, dt, now)
    ctx.globalCompositeOperation = 'lighter'; this.drawParticles(ctx); ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
    if (this.flashAlpha > 0.01) { ctx.fillStyle = 'rgba(255,255,255,' + this.flashAlpha + ')'; ctx.fillRect(0, 0, this.cw, this.ch) }
    this.drawVignette(ctx)
  }
  GameEngine.prototype.drawGrid = function (ctx) {
    var step = 36; ctx.lineWidth = 1; ctx.strokeStyle = this.theme.grid; ctx.beginPath()
    for (var x = 0; x <= this.cw; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, this.ch) }
    for (var y = 0; y <= this.ch; y += step) { ctx.moveTo(0, y); ctx.lineTo(this.cw, y) }
    ctx.stroke(); ctx.strokeStyle = this.theme.gridGlow; ctx.beginPath()
    for (x = this.arenaX; x <= this.arenaX + this.arenaW; x += step) { ctx.moveTo(x, this.arenaY); ctx.lineTo(x, this.arenaY + this.arenaH) }
    for (y = this.arenaY; y <= this.arenaY + this.arenaH; y += step) { ctx.moveTo(this.arenaX, y); ctx.lineTo(this.arenaX + this.arenaW, y) }
    ctx.stroke()
  }
  GameEngine.prototype.drawAmbient = function (ctx) {
    ctx.globalCompositeOperation = 'lighter'
    for (var i = 0; i < this.ambient.length; i++) { var p = this.ambient[i]; ctx.fillStyle = withAlpha(p.color, 0.5); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill() }
    ctx.globalCompositeOperation = 'source-over'
  }
  GameEngine.prototype.drawArenaBorder = function (ctx) {
    ctx.save(); ctx.strokeStyle = withAlpha(this.theme.accent, 0.5); ctx.lineWidth = 2
    ctx.shadowColor = this.theme.accent; ctx.shadowBlur = 16
    roundRect(ctx, this.arenaX, this.arenaY, this.arenaW, this.arenaH, 14); ctx.stroke(); ctx.restore()
  }
  GameEngine.prototype.drawPowerUps = function (ctx, now) {
    for (var i = 0; i < this.powerUps.length; i++) {
      var p = this.powerUps[i], expiring = p.expireAt - now < 2000
      var blink = expiring ? 0.4 + 0.6 * Math.abs(Math.sin(now / 100)) : 1, yoff = Math.sin(p.bob) * 4
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      var g = ctx.createRadialGradient(p.x, p.y + yoff, 0, p.x, p.y + yoff, p.radius * 3)
      g.addColorStop(0, withAlpha(p.color, 0.5 * blink)); g.addColorStop(1, withAlpha(p.color, 0))
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y + yoff, p.radius * 3, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'; ctx.translate(p.x, p.y + yoff); ctx.rotate(Math.PI / 4)
      ctx.fillStyle = withAlpha(p.color, 0.9 * blink); ctx.shadowColor = p.color; ctx.shadowBlur = 16
      ctx.fillRect(-p.radius * 0.7, -p.radius * 0.7, p.radius * 1.4, p.radius * 1.4)
      ctx.rotate(-Math.PI / 4); ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      var label = p.kind === 'shield' ? 'S' : p.kind === 'slowmo' ? 'T' : p.kind === 'phase' ? 'P' : '2×'
      ctx.fillText(label, 0, 1); ctx.restore()
    }
  }
  GameEngine.prototype.drawLaser = function (ctx, l, now) {
    if (l.state === 'warning') { this.drawWarning(ctx, l, now); return }
    if (l.state === 'fading') {
      if (l.kind === 'shrink') { this.drawShrink(ctx, l, l.intensity * 0.4); return }
      if (l.kind === 'mirror') { this.drawMirror(ctx, l, l.intensity * 0.4); return }
      if (l.kind === 'sliding') { this.drawSliding(ctx, l, l.intensity * 0.4); return }
      this.drawBeam(ctx, l, l.intensity * 0.5); return
    }
    if (l.kind === 'pulsing' && !l.pulseOn) { this.drawBeam(ctx, l, 0.12); return }
    if (l.kind === 'wall') { this.drawWall(ctx, l, now); return }
    if (l.kind === 'grid') { this.drawGridLaser(ctx, l); return }
    if (l.kind === 'shrink') { this.drawShrink(ctx, l, 1); return }
    if (l.kind === 'mirror') { this.drawMirror(ctx, l, 1); return }
    if (l.kind === 'sliding') { this.drawSliding(ctx, l, 1); return }
    this.drawBeam(ctx, l, 1)
  }
  GameEngine.prototype.drawWarning = function (ctx, l, now) {
    var warnColor = this.theme.laserWarn, blinkSpeed = this.reduceFlash ? 160 : 90
    var blink = 0.4 + 0.6 * Math.abs(Math.sin(now / blinkSpeed)); ctx.save()
    if (l.kind === 'wall') {
      var horizontal = l.pulsePeriod === 1, sc = l.gaps[0], sh = l.gaps[1]
      ctx.fillStyle = withAlpha('#34d399', 0.08 + 0.06 * blink)
      if (horizontal) { var lo = this.arenaY + (sc - sh) * this.arenaH, hi = this.arenaY + (sc + sh) * this.arenaH; ctx.fillRect(this.arenaX, lo, this.arenaW, hi - lo) }
      else { var lo2 = this.arenaX + (sc - sh) * this.arenaW, hi2 = this.arenaX + (sc + sh) * this.arenaW; ctx.fillRect(lo2, this.arenaY, hi2 - lo2, this.arenaH) }
      ctx.strokeStyle = withAlpha(warnColor, 0.25 * blink + 0.12); ctx.lineWidth = l.thickness + 6; ctx.shadowColor = warnColor; ctx.shadowBlur = 14; this.strokeWallPath(ctx, l, 1)
      ctx.strokeStyle = withAlpha(warnColor, 0.6 * blink + 0.2); ctx.lineWidth = 2; ctx.shadowBlur = 8; this.strokeWallPath(ctx, l, 1); ctx.restore(); return
    }
    if ((l.kind === 'homing' || l.kind === 'stalker') && l.target) {
      var tx = l.target.x, ty = l.target.y, rcolor = l.kind === 'stalker' ? '#f43f5e' : warnColor
      ctx.strokeStyle = withAlpha(rcolor, 0.5 * blink + 0.2); ctx.lineWidth = 2; ctx.shadowColor = rcolor; ctx.shadowBlur = 12
      ctx.beginPath(); ctx.arc(tx, ty, 26, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(tx, ty, 14, 0, TAU); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(tx - 34, ty); ctx.lineTo(tx - 18, ty); ctx.moveTo(tx + 18, ty); ctx.lineTo(tx + 34, ty)
      ctx.moveTo(tx, ty - 34); ctx.lineTo(tx, ty - 18); ctx.moveTo(tx, ty + 18); ctx.lineTo(tx, ty + 34); ctx.stroke(); ctx.restore(); return
    }
    if (l.kind === 'shrink') {
      var frac = (l.gaps && l.gaps[0]) || 0.18
      ctx.strokeStyle = withAlpha(warnColor, 0.4 * blink + 0.15); ctx.lineWidth = 2; ctx.setLineDash([8, 8])
      ctx.strokeRect(this.arenaX + frac * this.arenaW, this.arenaY + frac * this.arenaH, this.arenaW * (1 - frac * 2), this.arenaH * (1 - frac * 2)); ctx.setLineDash([]); ctx.restore(); return
    }
    if (l.kind === 'mirror' || l.kind === 'sliding') {
      ctx.strokeStyle = withAlpha(warnColor, 0.3 * blink + 0.1); ctx.lineWidth = l.thickness + 4; ctx.shadowColor = warnColor; ctx.shadowBlur = 12
      if (l.kind === 'mirror') this.strokeMirrorPath(ctx, l)
      else {
        ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke()
        if (l.gapWidth != null && l.gapPos != null) {
          var horizontal = l.mirrorOffset === 1, gp = l.gapPos, gw = l.gapWidth
          ctx.strokeStyle = withAlpha('#34d399', 0.3 * blink + 0.1); ctx.lineWidth = l.thickness + 2
          if (horizontal) { var glo = this.arenaX + (gp - gw / 2) * this.arenaW, ghi = this.arenaX + (gp + gw / 2) * this.arenaW; ctx.fillStyle = withAlpha('#34d399', 0.1); ctx.fillRect(glo, l.a.y - 4, ghi - glo, 8) }
          else { var glo2 = this.arenaY + (gp - gw / 2) * this.arenaH, ghi2 = this.arenaY + (gp + gw / 2) * this.arenaH; ctx.fillStyle = withAlpha('#34d399', 0.1); ctx.fillRect(l.a.x - 4, glo2, 8, ghi2 - glo2) }
        }
      }
      ctx.restore(); return
    }
    ctx.strokeStyle = withAlpha(warnColor, 0.25 * blink + 0.1); ctx.lineWidth = l.thickness + 8; ctx.shadowColor = warnColor; ctx.shadowBlur = 14
    if (l.kind === 'grid') this.strokeGridPath(ctx, l)
    else { ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke() }
    ctx.strokeStyle = withAlpha(warnColor, 0.7 * blink + 0.2); ctx.lineWidth = 2; ctx.shadowBlur = 8
    if (l.kind === 'grid') this.strokeGridPath(ctx, l)
    else { ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke() }
    ctx.restore()
  }
  GameEngine.prototype.strokeWallPath = function (ctx, l, closeFrac) {
    var horizontal = l.pulsePeriod === 1, sc = l.gaps[0], sh = l.gaps[1], maxClose = 0.5 - sh, close = closeFrac * maxClose
    if (horizontal) { var topY = this.arenaY + close * this.arenaH, botY = this.arenaY + (1 - close) * this.arenaH; ctx.beginPath(); ctx.moveTo(this.arenaX, topY); ctx.lineTo(this.arenaX + this.arenaW, topY); ctx.moveTo(this.arenaX, botY); ctx.lineTo(this.arenaX + this.arenaW, botY); ctx.stroke() }
    else { var leftX = this.arenaX + close * this.arenaW, rightX = this.arenaX + (1 - close) * this.arenaW; ctx.beginPath(); ctx.moveTo(leftX, this.arenaY); ctx.lineTo(leftX, this.arenaY + this.arenaH); ctx.moveTo(rightX, this.arenaY); ctx.lineTo(rightX, this.arenaY + this.arenaH); ctx.stroke() }
  }
  GameEngine.prototype.drawWall = function (ctx, l, now) {
    var progress = clamp((now - l.warnUntil) / (l.activeUntil - l.warnUntil), 0, 1)
    var eased = progress < 0.7 ? progress / 0.7 : 1; this.drawWallEdges(ctx, l, eased)
  }
  GameEngine.prototype.drawWallEdges = function (ctx, l, eased) {
    var horizontal = l.pulsePeriod === 1, sc = l.gaps[0], sh = l.gaps[1], maxClose = 0.5 - sh, close = eased * maxClose, self = this
    function drawEdge(x1, y1, x2, y2) {
      ctx.save(); ctx.strokeStyle = withAlpha(l.color, 0.25); ctx.lineWidth = l.thickness + 14; ctx.shadowColor = l.color; ctx.shadowBlur = 24; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.strokeStyle = l.color; ctx.lineWidth = l.thickness; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore()
    }
    if (horizontal) { var topY = this.arenaY + close * this.arenaH, botY = this.arenaY + (1 - close) * this.arenaH; drawEdge(this.arenaX, topY, this.arenaX + this.arenaW, topY); drawEdge(this.arenaX, botY, this.arenaX + this.arenaW, botY) }
    else { var leftX = this.arenaX + close * this.arenaW, rightX = this.arenaX + (1 - close) * this.arenaW; drawEdge(leftX, this.arenaY, leftX, this.arenaY + this.arenaH); drawEdge(rightX, this.arenaY, rightX, this.arenaY + this.arenaH) }
  }
  GameEngine.prototype.strokeGridPath = function (ctx, l) {
    var g = l.gaps, cols = g[0], rows = g[1], gapCol = g[2], gapRow = g[3], cw = this.arenaW / cols, ch = this.arenaH / rows, i
    ctx.beginPath()
    for (i = 0; i <= cols; i++) { if (i === gapCol || i === gapCol + 1) continue; var x = this.arenaX + i * cw; ctx.moveTo(x, this.arenaY); ctx.lineTo(x, this.arenaY + this.arenaH) }
    for (i = 0; i <= rows; i++) { if (i === gapRow || i === gapRow + 1) continue; var y = this.arenaY + i * ch; ctx.moveTo(this.arenaX, y); ctx.lineTo(this.arenaX + this.arenaW, y) }
    ctx.stroke()
  }
  GameEngine.prototype.drawGridLaser = function (ctx, l) {
    var g = l.gaps, cols = g[0], rows = g[1], gapCol = g[2], gapRow = g[3], cw = this.arenaW / cols, ch = this.arenaH / rows, self = this
    function drawLine(x1, y1, x2, y2) {
      ctx.save(); ctx.strokeStyle = withAlpha(l.color, 0.22); ctx.lineWidth = l.thickness + 12; ctx.shadowColor = l.color; ctx.shadowBlur = 20; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.strokeStyle = l.color; ctx.lineWidth = l.thickness; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore()
    }
    for (var i = 0; i <= cols; i++) { if (i === gapCol || i === gapCol + 1) continue; var x = this.arenaX + i * cw; drawLine(x, this.arenaY, x, this.arenaY + this.arenaH) }
    for (var j = 0; j <= rows; j++) { if (j === gapRow || j === gapRow + 1) continue; var y = this.arenaY + j * ch; drawLine(this.arenaX, y, this.arenaX + this.arenaW, y) }
  }
  GameEngine.prototype.strokeMirrorPath = function (ctx, l) {
    var horizontal = l.mirrorOffset === 1, f0 = l.gaps[0], f1 = l.gaps[1]
    if (horizontal) { var y0 = this.arenaY + f0 * this.arenaH, y1 = this.arenaY + f1 * this.arenaH; ctx.beginPath(); ctx.moveTo(this.arenaX, y0); ctx.lineTo(this.arenaX + this.arenaW, y0); ctx.moveTo(this.arenaX, y1); ctx.lineTo(this.arenaX + this.arenaW, y1); ctx.stroke() }
    else { var x0 = this.arenaX + f0 * this.arenaW, x1 = this.arenaX + f1 * this.arenaW; ctx.beginPath(); ctx.moveTo(x0, this.arenaY); ctx.lineTo(x0, this.arenaY + this.arenaH); ctx.moveTo(x1, this.arenaY); ctx.lineTo(x1, this.arenaY + this.arenaH); ctx.stroke() }
  }
  GameEngine.prototype.drawMirror = function (ctx, l, alpha) {
    var horizontal = l.mirrorOffset === 1, f0 = l.gaps[0], f1 = l.gaps[1], self = this
    function drawEdge(x1, y1, x2, y2) {
      ctx.save(); ctx.strokeStyle = withAlpha(l.color, 0.22 * alpha); ctx.lineWidth = l.thickness + 14; ctx.shadowColor = l.color; ctx.shadowBlur = 22; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.strokeStyle = withAlpha(l.color, 0.6 * alpha); ctx.lineWidth = l.thickness; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * alpha) + ')'; ctx.lineWidth = Math.max(1.5, l.thickness * 0.4); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore()
    }
    if (horizontal) { var y0 = this.arenaY + f0 * this.arenaH, y1 = this.arenaY + f1 * this.arenaH; drawEdge(this.arenaX, y0, this.arenaX + this.arenaW, y0); drawEdge(this.arenaX, y1, this.arenaX + this.arenaW, y1) }
    else { var x0 = this.arenaX + f0 * this.arenaW, x1 = this.arenaX + f1 * this.arenaW; drawEdge(x0, this.arenaY, x0, this.arenaY + this.arenaH); drawEdge(x1, this.arenaY, x1, this.arenaY + this.arenaH) }
  }
  GameEngine.prototype.drawSliding = function (ctx, l, alpha) {
    var horizontal = l.mirrorOffset === 1, gp = l.gapPos != null ? l.gapPos : 0.5, gw = l.gapWidth != null ? l.gapWidth : 0.18, self = this
    function drawSeg(x1, y1, x2, y2) {
      ctx.save(); ctx.strokeStyle = withAlpha(l.color, 0.22 * alpha); ctx.lineWidth = l.thickness + 14; ctx.shadowColor = l.color; ctx.shadowBlur = 22; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.strokeStyle = withAlpha(l.color, 0.6 * alpha); ctx.lineWidth = l.thickness; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * alpha) + ')'; ctx.lineWidth = Math.max(1.5, l.thickness * 0.4); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore()
    }
    if (horizontal) {
      var y = l.a.y, lo = this.arenaX + (gp - gw / 2) * this.arenaW, hi = this.arenaX + (gp + gw / 2) * this.arenaW
      drawSeg(this.arenaX, y, lo, y); drawSeg(hi, y, this.arenaX + this.arenaW, y)
      ctx.save(); ctx.fillStyle = withAlpha('#34d399', 0.12 * alpha); ctx.fillRect(lo, y - l.thickness, hi - lo, l.thickness * 2); ctx.restore()
    } else {
      var x = l.a.x, lo2 = this.arenaY + (gp - gw / 2) * this.arenaH, hi2 = this.arenaY + (gp + gw / 2) * this.arenaH
      drawSeg(x, this.arenaY, x, lo2); drawSeg(x, hi2, x, this.arenaY + this.arenaH)
      ctx.save(); ctx.fillStyle = withAlpha('#34d399', 0.12 * alpha); ctx.fillRect(x - l.thickness, lo2, l.thickness * 2, hi2 - lo2); ctx.restore()
    }
  }
  GameEngine.prototype.drawShrink = function (ctx, l, alpha) {
    var frac = l.shrinkFrac || 0; if (frac <= 0.005) return
    var left = this.arenaX + frac * this.arenaW, right = this.arenaX + (1 - frac) * this.arenaW
    var top = this.arenaY + frac * this.arenaH, bottom = this.arenaY + (1 - frac) * this.arenaH, self = this
    function drawEdge(x1, y1, x2, y2) {
      ctx.save(); ctx.strokeStyle = withAlpha(l.color, 0.22 * alpha); ctx.lineWidth = l.thickness + 14; ctx.shadowColor = l.color; ctx.shadowBlur = 22; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.strokeStyle = withAlpha(l.color, 0.6 * alpha); ctx.lineWidth = l.thickness; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore()
    }
    drawEdge(left, top, right, top); drawEdge(left, bottom, right, bottom); drawEdge(left, top, left, bottom); drawEdge(right, top, right, bottom)
  }
  GameEngine.prototype.drawBeam = function (ctx, l, alpha) {
    ctx.save(); ctx.strokeStyle = withAlpha(l.color, 0.22 * alpha); ctx.lineWidth = l.thickness + 16; ctx.shadowColor = l.color; ctx.shadowBlur = 22
    ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke()
    ctx.strokeStyle = withAlpha(l.color, 0.5 * alpha); ctx.lineWidth = l.thickness + 4; ctx.shadowBlur = 14; ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * alpha) + ')'; ctx.lineWidth = Math.max(1.5, l.thickness * 0.4); ctx.shadowBlur = 6; ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke(); ctx.restore()
  }
  GameEngine.prototype.drawPlayer = function (ctx, dt, now) {
    var p = this.player, color = this.playerColor(), glow = this.playerGlow(), effect = this.playerEffect()
    var alive = p.alive, phase = now < this.effects.phaseUntil, t = now / 1000, i
    if (effect === 'trail' || effect === 'spark') {
      for (i = 0; i < p.trail.length; i++) { var tp = p.trail[i]; var a = (i / p.trail.length) * 0.5; ctx.fillStyle = withAlpha(glow, a); ctx.beginPath(); ctx.arc(tp.x, tp.y, p.radius * (i / p.trail.length) * 0.9, 0, TAU); ctx.fill() }
    }
    if (!alive) return
    var pulse = effect === 'pulse' ? 1 + Math.sin(t * 6) * 0.12 : 1, r = p.radius * pulse, alpha = phase ? 0.5 : 1
    if (this.flow > 5) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = withAlpha(glow, 0.6); ctx.lineWidth = 2.5; ctx.shadowColor = glow; ctx.shadowBlur = 10
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, -Math.PI / 2, -Math.PI / 2 + (this.flow / 100) * TAU); ctx.stroke(); ctx.restore()
    }
    if (this.effects.shield) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = withAlpha('#34d399', 0.8); ctx.lineWidth = 2.5; ctx.shadowColor = '#34d399'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(p.x, p.y, r + 8, 0, TAU); ctx.stroke(); ctx.restore()
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2)
    grad.addColorStop(0, withAlpha(glow, 0.55 * alpha)); grad.addColorStop(0.5, withAlpha(glow, 0.18 * alpha)); grad.addColorStop(1, withAlpha(glow, 0))
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2, 0, TAU); ctx.fill(); ctx.restore()
    ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 18; ctx.fillStyle = withAlpha(color, alpha); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * alpha) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.45, 0, TAU); ctx.fill(); ctx.restore()
    if (effect === 'orbit') {
      var ox = p.x + Math.cos(t * 3) * (r + 6), oy = p.y + Math.sin(t * 3) * (r + 6)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(ox, oy, 2.5, 0, TAU); ctx.fill(); ctx.restore()
    }
  }
  GameEngine.prototype.drawParticles = function (ctx) {
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; var a = clamp(p.life / p.maxLife, 0, 1); ctx.fillStyle = withAlpha(p.color, a); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill() }
  }
  GameEngine.prototype.drawVignette = function (ctx) {
    var g = ctx.createRadialGradient(this.cw / 2, this.ch / 2, Math.min(this.cw, this.ch) * 0.35, this.cw / 2, this.ch / 2, Math.max(this.cw, this.ch) * 0.75)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, this.theme.vignette); ctx.fillStyle = g; ctx.fillRect(0, 0, this.cw, this.ch)
  }

  global.LF.Engine = { GameEngine: GameEngine }
})(window)
