// Laser Flow — localStorage persistence (settings, best times, achievements, daily history)
(function (global) {
  'use strict'
  var C = global.LF.Config
  var SETTINGS_KEY = 'laserflow.settings.v1'
  var BEST_KEY = 'laserflow.best.v1'
  var ACH_KEY = 'laserflow.achievements.v1'
  var FIRST_RUN_KEY = 'laserflow.firstrun.v1'
  var DAILY_NAME_KEY = 'laserflow.dailyname.v1'
  var DAILY_BEST_PREFIX = 'laserflow.dailybest.v1.'
  var DAILY_HISTORY_PREFIX = 'laserflow.dailyhistory.v1.'

  var EMPTY_BEST = { easy: 0, normal: 0, hard: 0, insane: 0 }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY)
      if (!raw) return Object.assign({}, C.DEFAULT_SETTINGS)
      return Object.assign({}, C.DEFAULT_SETTINGS, JSON.parse(raw))
    } catch (e) { return Object.assign({}, C.DEFAULT_SETTINGS) }
  }
  function saveSettings(settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch (e) {}
  }
  function loadBestTimes() {
    try {
      var raw = localStorage.getItem(BEST_KEY)
      if (!raw) return Object.assign({}, EMPTY_BEST)
      return Object.assign({}, EMPTY_BEST, JSON.parse(raw))
    } catch (e) { return Object.assign({}, EMPTY_BEST) }
  }
  function saveBestTimes(times) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(times)) } catch (e) {}
  }
  function recordBest(difficulty, time) {
    var times = loadBestTimes()
    var prev = times[difficulty] || 0
    if (time > prev) {
      times[difficulty] = time
      saveBestTimes(times)
      return { times: times, isNewBest: true }
    }
    return { times: times, isNewBest: false }
  }
  function getBest(difficulty) { return loadBestTimes()[difficulty] || 0 }

  function loadUnlockedAchievements() {
    try {
      var raw = localStorage.getItem(ACH_KEY)
      if (!raw) return {}
      var arr = JSON.parse(raw)
      var set = {}
      for (var i = 0; i < arr.length; i++) set[arr[i]] = true
      return set
    } catch (e) { return {} }
  }
  function saveUnlockedAchievements(set) {
    try {
      var arr = []
      for (var k in set) if (set[k]) arr.push(k)
      localStorage.setItem(ACH_KEY, JSON.stringify(arr))
    } catch (e) {}
  }

  function isFirstRun() {
    try { return localStorage.getItem(FIRST_RUN_KEY) === null } catch (e) { return false }
  }
  function markFirstRunDone() {
    try { localStorage.setItem(FIRST_RUN_KEY, '1') } catch (e) {}
  }

  function loadDailyName() {
    try { return localStorage.getItem(DAILY_NAME_KEY) || 'Player' } catch (e) { return 'Player' }
  }
  function saveDailyName(name) {
    try { localStorage.setItem(DAILY_NAME_KEY, name.slice(0, 16)) } catch (e) {}
  }

  function loadDailyBestLocal(seed, difficulty) {
    try {
      var raw = localStorage.getItem(DAILY_BEST_PREFIX + seed + '.' + difficulty)
      return raw ? parseFloat(raw) || 0 : 0
    } catch (e) { return 0 }
  }
  function saveDailyBestLocal(seed, difficulty, time) {
    var prev = loadDailyBestLocal(seed, difficulty)
    if (time > prev) {
      try { localStorage.setItem(DAILY_BEST_PREFIX + seed + '.' + difficulty, String(time)) } catch (e) {}
      return { isNewBest: true }
    }
    return { isNewBest: false }
  }

  function loadDailyHistory(seed, difficulty) {
    try {
      var raw = localStorage.getItem(DAILY_HISTORY_PREFIX + seed + '.' + difficulty)
      if (!raw) return []
      var arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : []
    } catch (e) { return [] }
  }
  function saveDailyHistoryEntry(seed, difficulty, name, time) {
    var list = loadDailyHistory(seed, difficulty)
    var entry = {
      id: Date.now(),
      name: (name.slice(0, 16) || 'Player'),
      difficulty: difficulty, time: time, seed: seed,
      createdAt: new Date().toISOString(),
    }
    list.push(entry)
    list.sort(function (a, b) { return b.time - a.time })
    var top = list.slice(0, 20)
    try { localStorage.setItem(DAILY_HISTORY_PREFIX + seed + '.' + difficulty, JSON.stringify(top)) } catch (e) {}
    return top
  }

  global.LF.Storage = {
    loadSettings: loadSettings, saveSettings: saveSettings,
    loadBestTimes: loadBestTimes, saveBestTimes: saveBestTimes,
    recordBest: recordBest, getBest: getBest,
    loadUnlockedAchievements: loadUnlockedAchievements, saveUnlockedAchievements: saveUnlockedAchievements,
    isFirstRun: isFirstRun, markFirstRunDone: markFirstRunDone,
    loadDailyName: loadDailyName, saveDailyName: saveDailyName,
    loadDailyBestLocal: loadDailyBestLocal, saveDailyBestLocal: saveDailyBestLocal,
    loadDailyHistory: loadDailyHistory, saveDailyHistoryEntry: saveDailyHistoryEntry,
  }
})(window)
