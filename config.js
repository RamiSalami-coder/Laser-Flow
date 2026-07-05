// Laser Flow — configuration (difficulties, themes, skins, power-ups, achievements)
(function (global) {
  'use strict'

  var DEFAULT_SETTINGS = {
    difficulty: 'normal',
    arenaSize: 'medium',
    laserSpeed: 'normal',
    theme: 'neon-grid',
    skin: 'cyan',
    customColor: '#22d3ee',
    sound: true,
    music: true,
    vibration: true,
    reduceFlash: false,
    reducedMotion: false,
    joystickSensitivity: 1.0,
  }

  var DIFFICULTIES = {
    easy: {
      id: 'easy', name: 'Easy', blurb: 'Relaxed pace. Learn the flow.',
      spawnRateMult: 0.62, warnTimeMult: 1.45, activeTimeMult: 0.85,
      rampMult: 0.55, specialChance: 0.12, maxConcurrentMult: 0.7, color: '#34d399',
    },
    normal: {
      id: 'normal', name: 'Normal', blurb: 'Balanced challenge. Stay sharp.',
      spawnRateMult: 1.0, warnTimeMult: 1.0, activeTimeMult: 1.0,
      rampMult: 1.0, specialChance: 0.18, maxConcurrentMult: 1.0, color: '#22d3ee',
    },
    hard: {
      id: 'hard', name: 'Hard', blurb: 'Tight windows. Constant pressure.',
      spawnRateMult: 1.35, warnTimeMult: 0.78, activeTimeMult: 1.15,
      rampMult: 1.35, specialChance: 0.24, maxConcurrentMult: 1.25, color: '#f59e0b',
    },
    insane: {
      id: 'insane', name: 'Insane', blurb: 'Pure chaos. For the fearless.',
      spawnRateMult: 1.7, warnTimeMult: 0.62, activeTimeMult: 1.3,
      rampMult: 1.7, specialChance: 0.32, maxConcurrentMult: 1.5, color: '#f43f5e',
    },
  }

  var ARENA_SIZES = {
    small: { id: 'small', name: 'Small', scale: 0.62, playerSpeedMult: 0.9 },
    medium: { id: 'medium', name: 'Medium', scale: 0.78, playerSpeedMult: 1.0 },
    large: { id: 'large', name: 'Large', scale: 0.92, playerSpeedMult: 1.12 },
  }

  var LASER_SPEEDS = {
    slow: { id: 'slow', name: 'Slow', rotSpeedMult: 0.7, wallSpeedMult: 0.7 },
    normal: { id: 'normal', name: 'Normal', rotSpeedMult: 1.0, wallSpeedMult: 1.0 },
    fast: { id: 'fast', name: 'Fast', rotSpeedMult: 1.35, wallSpeedMult: 1.35 },
  }

  var THEMES = {
    'neon-grid': {
      id: 'neon-grid', name: 'Neon Grid',
      bgTop: '#0a0a1f', bgBottom: '#050510',
      grid: 'rgba(56, 189, 248, 0.10)', gridGlow: 'rgba(56, 189, 248, 0.25)',
      lasers: ['#22d3ee', '#38bdf8', '#06b6d4', '#67e8f9'], laserWarn: '#fbbf24',
      player: '#22d3ee', particle: '#67e8f9', accent: '#22d3ee', vignette: 'rgba(0,0,0,0.55)',
    },
    'cyber-lab': {
      id: 'cyber-lab', name: 'Cyber Lab',
      bgTop: '#04140c', bgBottom: '#020805',
      grid: 'rgba(52, 211, 153, 0.10)', gridGlow: 'rgba(52, 211, 153, 0.25)',
      lasers: ['#34d399', '#10b981', '#6ee7b7', '#a7f3d0'], laserWarn: '#fde047',
      player: '#34d399', particle: '#6ee7b7', accent: '#34d399', vignette: 'rgba(0,0,0,0.55)',
    },
    void: {
      id: 'void', name: 'Void',
      bgTop: '#12041a', bgBottom: '#060108',
      grid: 'rgba(168, 85, 247, 0.10)', gridGlow: 'rgba(168, 85, 247, 0.25)',
      lasers: ['#a855f7', '#d946ef', '#c084fc', '#e9d5ff'], laserWarn: '#fb7185',
      player: '#d946ef', particle: '#c084fc', accent: '#a855f7', vignette: 'rgba(0,0,0,0.6)',
    },
    'ice-core': {
      id: 'ice-core', name: 'Ice Core',
      bgTop: '#06121f', bgBottom: '#02060c',
      grid: 'rgba(125, 211, 252, 0.10)', gridGlow: 'rgba(125, 211, 252, 0.25)',
      lasers: ['#7dd3fc', '#bae6fd', '#e0f2fe', '#38bdf8'], laserWarn: '#fcd34d',
      player: '#7dd3fc', particle: '#e0f2fe', accent: '#7dd3fc', vignette: 'rgba(0,0,0,0.5)',
    },
    'lava-core': {
      id: 'lava-core', name: 'Lava Core',
      bgTop: '#1a0604', bgBottom: '#0a0201',
      grid: 'rgba(251, 146, 60, 0.10)', gridGlow: 'rgba(251, 146, 60, 0.25)',
      lasers: ['#fb923c', '#f97316', '#fbbf24', '#fca5a5'], laserWarn: '#fef08a',
      player: '#fb923c', particle: '#fbbf24', accent: '#fb923c', vignette: 'rgba(0,0,0,0.6)',
    },
  }

  var SKINS = {
    cyan: { id: 'cyan', name: 'Cyan Pulse', color: '#22d3ee', glow: '#67e8f9', effect: 'aura', description: 'Soft cyan aura' },
    magenta: { id: 'magenta', name: 'Magenta Spark', color: '#f472b6', glow: '#fbcfe8', effect: 'spark', description: 'Crackling sparks' },
    lime: { id: 'lime', name: 'Lime Trail', color: '#a3e635', glow: '#d9f99d', effect: 'trail', description: 'Glowing trail' },
    gold: { id: 'gold', name: 'Gold Orbit', color: '#fbbf24', glow: '#fde68a', effect: 'orbit', description: 'Orbiting ring' },
    white: { id: 'white', name: 'Phantom White', color: '#f8fafc', glow: '#e2e8f0', effect: 'pulse', description: 'Pulsing core' },
    violet: { id: 'violet', name: 'Violet Flux', color: '#a78bfa', glow: '#ddd6fe', effect: 'aura', description: 'Violet aura' },
    crimson: { id: 'crimson', name: 'Crimson Edge', color: '#fb7185', glow: '#fecdd3', effect: 'trail', description: 'Crimson trail' },
    orange: { id: 'orange', name: 'Solar Flare', color: '#fb923c', glow: '#fed7aa', effect: 'spark', description: 'Crackling sparks' },
    teal: { id: 'teal', name: 'Teal Drift', color: '#2dd4bf', glow: '#99f6e4', effect: 'aura', description: 'Teal aura' },
    rose: { id: 'rose', name: 'Rose Pulse', color: '#f43f5e', glow: '#fda4af', effect: 'pulse', description: 'Pulsing core' },
    emerald: { id: 'emerald', name: 'Emerald Orbit', color: '#10b981', glow: '#6ee7b7', effect: 'orbit', description: 'Orbiting ring' },
    sky: { id: 'sky', name: 'Sky Trail', color: '#38bdf8', glow: '#bae6fd', effect: 'trail', description: 'Sky-blue trail' },
    custom: { id: 'custom', name: 'Custom', color: '#22d3ee', glow: '#67e8f9', effect: 'aura', description: 'Pick your own color' },
  }

  var SKIN_LIST = Object.keys(SKINS).map(function (k) { return SKINS[k] })
  var THEME_LIST = Object.keys(THEMES).map(function (k) { return THEMES[k] })

  var POWER_UP_META = {
    shield: { name: 'Shield', color: '#34d399', duration: 0 },
    slowmo: { name: 'Slow-Mo', color: '#a855f7', duration: 3000 },
    phase: { name: 'Phase Dash', color: '#fbbf24', duration: 2000 },
    multiplier: { name: '2× Flow', color: '#f472b6', duration: 6000 },
  }

  var ACHIEVEMENTS = [
    { id: 'first_run', name: 'First Steps', description: 'Survive your first run', icon: '👋', check: function (s) { return s.time > 0 } },
    { id: 'survive_15', name: 'Survivor', description: 'Survive 15 seconds', icon: '⏱️', check: function (s) { return s.time >= 15 } },
    { id: 'survive_30', name: 'In The Zone', description: 'Survive 30 seconds', icon: '🔥', check: function (s) { return s.time >= 30 } },
    { id: 'survive_60', name: 'Untouchable', description: 'Survive 60 seconds', icon: '💎', check: function (s) { return s.time >= 60 } },
    { id: 'survive_90', name: 'Flow Master', description: 'Survive 90 seconds', icon: '👑', check: function (s) { return s.time >= 90 } },
    { id: 'flow_50', name: 'Graze King', description: 'Reach 50% Flow meter', icon: '✨', check: function (s) { return s.flowMax >= 50 } },
    { id: 'flow_100', name: 'Max Flow', description: 'Fill the Flow meter completely', icon: '🌟', check: function (s) { return s.flowMax >= 95 } },
    { id: 'near_50', name: 'Close Calls', description: 'Dodge 50 near-misses in one run', icon: '⚡', check: function (s) { return s.nearMisses >= 50 } },
    { id: 'power_5', name: 'Collector', description: 'Grab 5 power-ups in one run', icon: '🛡️', check: function (s) { return s.powerUpsUsed >= 5 } },
    { id: 'specials_5', name: 'Event Horizon', description: 'Clear 5 special events in one run', icon: '🌀', check: function (s) { return s.specialsCleared >= 5 } },
    { id: 'insane_30', name: 'Fearless', description: 'Survive 30s on Insane', icon: '💀', check: function (s, settings) { return settings.difficulty === 'insane' && s.time >= 30 } },
  ]

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0
    var m = Math.floor(seconds / 60)
    var s = Math.floor(seconds % 60)
    var cs = Math.floor((seconds * 100) % 100)
    return pad(m) + ':' + pad(s) + '.' + pad(cs)
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n }

  function getTodaySeed() {
    return new Date().toISOString().slice(0, 10)
  }

  global.LF = global.LF || {}
  global.LF.Config = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DIFFICULTIES: DIFFICULTIES,
    ARENA_SIZES: ARENA_SIZES,
    LASER_SPEEDS: LASER_SPEEDS,
    THEMES: THEMES,
    SKINS: SKINS,
    SKIN_LIST: SKIN_LIST,
    THEME_LIST: THEME_LIST,
    POWER_UP_META: POWER_UP_META,
    ACHIEVEMENTS: ACHIEVEMENTS,
    formatTime: formatTime,
    getTodaySeed: getTodaySeed,
  }
})(window)
