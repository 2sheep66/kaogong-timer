/* =========================================================================
 * 考公学习计时器 · 核心逻辑（单文件）
 * 包含：Timer 计时器 / DM 数据管理 / Stats 统计引擎 / UI 界面渲染 / Theme 主题
 * 纯前端、零依赖、LocalStorage 本地存储；多页面（index/stats/settings）共用本文件。
 * ========================================================================= */
(function () {
  "use strict";

  /* ===================== 常量 ===================== */
  var SUBJECTS = [
    { name: "行测", items: ["言语理解与表达", "数量关系", "判断推理", "资料分析", "常识判断"] },
    { name: "申论", items: ["基础理论", "小题专项", "大作文", "热点素材", "真题范文"] },
    { name: "面试", items: ["结构化面试", "无领导小组讨论", "面试技巧", "面试真题"] },
    { name: "综合", items: ["真题演练", "模拟考试", "错题复盘", "自由学习"] }
  ];
  var SUBJ_COLORS = { "行测": "#1890ff", "申论": "#52c41a", "面试": "#fa8c16", "综合": "#722ed1" };
  var LS = { records: "gongkao_records", settings: "gongkao_settings", favorites: "gongkao_favorites", streak: "gongkao_streak" };
  var DEFAULT_SETTINGS = {
    dailyTargetMinutes: 240, examDate: "2026-11-30", examName: "2026 国考",
    theme: "light", accentColor: "#1890ff", timerStyle: "digital",
    reminderEnabled: false, reminderTime: "09:00", targetNotMet: false,
    streakBreak: false, restReminder: true,
    subjectTargets: { "行测": 600, "申论": 360, "面试": 120, "综合": 120 },
    recent: [], customSubjects: []
  };
  // 自定义科目的稳定配色（内置科目优先用 SUBJ_COLORS）
  var CUSTOM_PALETTE = ["#eb2f96", "#13c2c2", "#faad14", "#2f54eb", "#f5222d", "#a0d911", "#fa541c", "#722ed1"];
  function subjColor(name) {
    if (SUBJ_COLORS[name]) return SUBJ_COLORS[name];
    var h = 0; for (var i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return CUSTOM_PALETTE[h % CUSTOM_PALETTE.length];
  }
  // 合并内置 + 自定义科目（供科目选择弹窗使用）
  function getAllSubjects() { return SUBJECTS.concat(DM.settings.customSubjects || []); }
  var rerenderSheet = null, rerenderSubjectsList = null; // 自定科目变更后的局部重渲染钩子
  var DEFAULT_STREAK = { currentStreak: 0, longestStreak: 0, lastStudyDate: null, streakHistory: [] };

  /* ===================== 工具 ===================== */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + " 小时 " + m + " 分";
    if (m > 0) return m + " 分 " + (s ? pad(s) + " 秒" : "");
    return s + " 秒";
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return pad(m) + ":" + pad(s);
  }
  function fmtMin(sec) { var m = Math.round(sec / 60); return m >= 60 ? (m / 60).toFixed(1) + "h" : m + "min"; }
  function dateAdd(dateStr, days) { var d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + days); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function lighten(hex, amt) {
    var c = hex.replace("#", ""); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function toast(msg) {
    var t = $(".toast"); if (t) t.remove();
    t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  }

  /* ===================== DataManager ===================== */
  var DM = {
    records: [], settings: null, favorites: [], streak: null,
    load: function () {
      this.records = readLS(LS.records, []);
      this.settings = Object.assign({}, DEFAULT_SETTINGS, readLS(LS.settings, {}));
      if (!this.settings.subjectTargets) this.settings.subjectTargets = DEFAULT_SETTINGS.subjectTargets;
      if (!this.settings.recent) this.settings.recent = [];
      this.favorites = readLS(LS.favorites, []);
      this.streak = Object.assign({}, DEFAULT_STREAK, readLS(LS.streak, {}));
      return this;
    },
    saveSettings: function () { writeLS(LS.settings, this.settings); },
    saveRecords: function () { writeLS(LS.records, this.records); },
    saveFavorites: function () { writeLS(LS.favorites, this.favorites); },
    saveStreak: function () { writeLS(LS.streak, this.streak); },
    addRecord: function (r) {
      var rec = {
        id: "rec_" + Date.now() + "_" + Math.floor(Math.random() * 1e4),
        date: todayStr(),
        startTime: r.startTime || fmtClock((r._start || Date.now() / 1000)),
        endTime: fmtClock((r._end || Date.now() / 1000)),
        duration: r.duration, subject: r.subject, category: r.category,
        mode: r.mode, targetDuration: r.targetDuration, completed: r.completed !== false,
        createdAt: Date.now()
      };
      this.records.push(rec);
      this.saveRecords();
      this.pushRecent({ subject: r.subject, category: r.category });
      return rec;
    },
    deleteRecord: function (id) { this.records = this.records.filter(function (x) { return x.id !== id; }); this.saveRecords(); },
    clearRecords: function () { this.records = []; this.saveRecords(); this.streak = Object.assign({}, DEFAULT_STREAK); this.saveStreak(); },
    pushRecent: function (sc) {
      var r = this.settings.recent.filter(function (x) { return !(x.subject === sc.subject && x.category === sc.category); });
      r.unshift(sc); this.settings.recent = r.slice(0, 3); this.saveSettings();
    },
    toggleFavorite: function (sc) {
      var i = this.favorites.findIndex(function (x) { return x.subject === sc.subject && x.category === sc.category; });
      if (i >= 0) this.favorites.splice(i, 1); else this.favorites.push(sc);
      this.saveFavorites(); return i < 0;
    },
    isFavorite: function (sc) { return this.favorites.some(function (x) { return x.subject === sc.subject && x.category === sc.category; }); },
    exportAll: function () { return { records: this.records, settings: this.settings, favorites: this.favorites, streak: this.streak, exportedAt: Date.now() }; },
    importAll: function (o) {
      if (o.records) { this.records = o.records; this.saveRecords(); }
      if (o.settings) { this.settings = Object.assign({}, DEFAULT_SETTINGS, o.settings); this.saveSettings(); }
      if (o.favorites) { this.favorites = o.favorites; this.saveFavorites(); }
      if (o.streak) { this.streak = Object.assign({}, DEFAULT_STREAK, o.streak); this.saveStreak(); }
    }
  };
  function readLS(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("LS 写入失败", e); } }

  /* ===================== Timer ===================== */
  function Timer(opts) {
    this.duration = opts.duration || 25 * 60;
    this.mode = opts.mode || "countdown"; // countdown | countup
    this.onTick = opts.onTick || function () {};
    this.onComplete = opts.onComplete || function () {};
    this._reset();
  }
  Timer.prototype._reset = function () {
    this.startTime = null; this.pausedTime = 0; this.isRunning = false; this.isPaused = false;
    this.elapsed = 0; this.remaining = this.duration; this.interval = null; this._end = null;
  };
  Timer.prototype.start = function (startEpochMs) {
    this.startTime = (startEpochMs || Date.now()) - this.pausedTime;
    this.isRunning = true; this.isPaused = false;
    var self = this;
    this.interval = setInterval(function () { self._tick(); }, 250);
    this._tick();
  };
  Timer.prototype._tick = function () {
    if (!this.isRunning) return;
    var elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    this.elapsed = elapsed;
    this.remaining = this.mode === "countdown" ? Math.max(0, this.duration - elapsed) : elapsed;
    this.onTick(this.getState());
    if (this.mode === "countdown" && this.remaining <= 0) this.complete();
  };
  Timer.prototype.pause = function () {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true; this.pausedTime = Date.now() - this.startTime;
    clearInterval(this.interval);
  };
  Timer.prototype.resume = function () {
    if (!this.isPaused) return;
    this.startTime = Date.now() - this.pausedTime;
    this.isPaused = false;
    var self = this; this.interval = setInterval(function () { self._tick(); }, 250); this._tick();
  };
  Timer.prototype.stop = function () { clearInterval(this.interval); this.isRunning = false; return this.getState(); };
  Timer.prototype.complete = function () { clearInterval(this.interval); this.isRunning = false; this.onComplete(this.getState()); };
  Timer.prototype.progress = function () {
    if (this.duration <= 0) return 0;
    if (this.mode === "countdown") return Math.min(1, (this.duration - this.remaining) / this.duration);
    return Math.min(1, this.elapsed / this.duration);
  };
  Timer.prototype.getState = function () {
    return { elapsed: this.elapsed, remaining: this.remaining, duration: this.duration, mode: this.mode, isRunning: this.isRunning, isPaused: this.isPaused };
  };

  /* ===================== StatsEngine ===================== */
  var Stats = {
    todayRecords: function () { var t = todayStr(); return DM.records.filter(function (r) { return r.date === t; }); },
    today: function () {
      var tr = this.todayRecords();
      var totalSec = tr.reduce(function (s, r) { return s + r.duration; }, 0);
      var completed = tr.filter(function (r) { return r.completed; }).length;
      var avg = tr.length ? tr.reduce(function (s, r) { return s + r.duration; }, 0) / tr.length : 0;
      var target = DM.settings.dailyTargetMinutes || 1;
      var eff = tr.length ? Math.round((completed / tr.length * 0.5 + Math.min(1, totalSec / 60 / target) * 0.5) * 100) : 0;
      return {
        totalMinutes: Math.round(totalSec / 60), totalSec: totalSec, count: tr.length,
        avgSec: avg, avgText: tr.length ? fmtDur(avg) : "—",
        efficiency: eff, completed: completed
      };
    },
    subjectDistribution: function (records) {
      var map = {};
      records.forEach(function (r) { map[r.subject] = (map[r.subject] || 0) + r.duration; });
      return Object.keys(map).map(function (k) {
        return { subject: k, sec: map[k], minutes: Math.round(map[k] / 60), color: subjColor(k) };
      }).sort(function (a, b) { return b.sec - a.sec; });
    },
    dailyTotals: function (n) {
      var arr = [], t = todayStr();
      for (var i = n - 1; i >= 0; i--) {
        var d = dateAdd(t, -i);
        var mins = DM.records.filter(function (r) { return r.date === d; }).reduce(function (s, r) { return s + Math.round(r.duration / 60); }, 0);
        arr.push({ date: d, minutes: mins, label: (parseInt(d.slice(5, 7), 10)) + "/" + parseInt(d.slice(8, 10), 10) });
      }
      return arr;
    },
    hourHeat: function (records) {
      var buckets = new Array(24).fill(0);
      records.forEach(function (r) {
        var h = parseInt((r.startTime || "0").slice(0, 2), 10) || 0;
        buckets[h] += r.duration;
      });
      return buckets;
    },
    updateStreak: function (rec) {
      if (!rec.completed) return;
      var st = DM.streak;
      var today = rec.date;
      var studiedToday = DM.records.some(function (r) { return r.date === today && r.completed; });
      if (!studiedToday) return;
      // 今日是否已计入（基于 lastStudyDate）
      if (st.lastStudyDate === today) { /* 今日已更新过，仅刷新历史 */ }
      else {
        var yest = dateAdd(today, -1);
        if (st.lastStudyDate === yest) st.currentStreak = (st.currentStreak || 0) + 1;
        else st.currentStreak = 1;
        st.lastStudyDate = today;
      }
      if ((st.currentStreak || 0) > (st.longestStreak || 0)) st.longestStreak = st.currentStreak;
      // streakHistory
      var h = st.streakHistory.filter(function (x) { return x.date !== today; });
      h.push({ date: today, studied: true, totalMinutes: Math.round(DM.records.filter(function (r) { return r.date === today; }).reduce(function (s, r) { return s + r.duration; }, 0) / 60) });
      st.streakHistory = h;
      DM.saveStreak();
    },
    studiedSet: function () {
      var s = {};
      DM.records.forEach(function (r) { if (r.completed) s[r.date] = (s[r.date] || 0) + r.duration; });
      return s;
    }
  };

  /* ===================== ThemeManager ===================== */
  var Theme = {
    apply: function () {
      var s = DM.settings;
      var theme = s.theme;
      if (theme === "auto") {
        var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.body.setAttribute("data-theme", dark ? "dark" : "light");
      } else {
        document.body.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
      }
      document.documentElement.style.setProperty("--accent", s.accentColor);
      document.documentElement.style.setProperty("--accent-light", lighten(s.accentColor, 0.85));
      document.body.setAttribute("data-timer-style", s.timerStyle || "digital");
    },
    watch: function () {
      if (DM.settings.theme === "auto" && window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { Theme.apply(); });
      }
    }
  };

  /* ===================== 通用弹窗 ===================== */
  function openModal(html, opts) {
    opts = opts || {};
    var mask = document.createElement("div"); mask.className = "modal-mask";
    mask.innerHTML = '<div class="modal">' + html + '</div>';
    document.body.appendChild(mask);
    if (opts.onMount) opts.onMount(mask.querySelector(".modal"), mask);
    mask.addEventListener("click", function (e) { if (e.target === mask && opts.dismissable !== false) closeModal(mask); });
    return mask;
  }
  function closeModal(mask) { if (mask && mask.parentNode) mask.parentNode.removeChild(mask); }
  function openSheet(id) { var el = document.getElementById(id); if (el) el.style.display = "flex"; }
  function closeSheet(id) { var el = document.getElementById(id); if (el) el.style.display = "none"; }

  /* ===================== 自定义科目 ===================== */
  function ensureCustom() { if (!DM.settings.customSubjects) DM.settings.customSubjects = []; return DM.settings.customSubjects; }
  function removeCustomSubject(i) {
    var list = ensureCustom(); if (i < 0 || i >= list.length) return;
    list.splice(i, 1); DM.saveSettings();
    if (rerenderSheet) rerenderSheet();
    if (rerenderSubjectsList) rerenderSubjectsList();
    toast("已删除科目");
  }
  function openCustomSubjectModal(editIndex) {
    var list = ensureCustom();
    var editing = editIndex != null && list[editIndex];
    var cur = editing ? list[editIndex] : null;
    var nameVal = cur ? cur.name : "";
    var catsVal = cur ? cur.items.join("、") : "";
    var html =
      '<h3>' + (editing ? "编辑科目" : "新建自定义科目") + '</h3>' +
      '<div class="field"><label>科目名称</label><input class="input lab" id="csName" placeholder="例如：英语、考研政治" value="' + esc(nameVal) + '"></div>' +
      '<div class="field"><label>分类（用逗号 / 换行分隔，可留空）</label><textarea class="input lab" id="csCats" rows="3" placeholder="例如：单词、阅读、写作">' + esc(catsVal) + '</textarea></div>' +
      '<div class="modal-actions">' +
        (editing ? '<button class="btn-secondary btn-danger" id="csDel">删除</button>' : '') +
        '<button class="btn-secondary" id="csCancel">取消</button>' +
        '<button class="btn-primary" id="csSave">保存</button>' +
      '</div>';
    openModal(html, { onMount: function (m) {
      if (editing) { m.querySelector("#csDel").onclick = function () { removeCustomSubject(editIndex); closeModal(m); }; }
      m.querySelector("#csCancel").onclick = function () { closeModal(m); };
      m.querySelector("#csSave").onclick = function () {
        var nm = m.querySelector("#csName").value.trim();
        if (!nm) { toast("请输入科目名称"); return; }
        var cats = m.querySelector("#csCats").value.split(/[\n,，、]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
        if (!cats.length) cats = ["默认"];
        var obj = { name: nm, items: cats };
        if (editing) list[editIndex] = obj; else list.push(obj);
        DM.saveSettings();
        closeModal(m);
        if (rerenderSheet) rerenderSheet();
        if (rerenderSubjectsList) rerenderSubjectsList();
        toast(editing ? "已更新科目：" + nm : "已添加科目：" + nm);
      };
    }});
  }
  function openSubjectManager() {
    var list = ensureCustom();
    function body() {
      if (!list.length) return '<p class="muted">还没有自定义科目。点击「＋ 新建科目」即可添加你自己的科目（如：英语、考研政治）。</p>';
      return list.map(function (s, i) {
        return '<div class="cs-row"><div class="cs-info"><b>' + esc(s.name) + '</b><span class="tertiary"> · ' + esc(s.items.join("、")) + '</span></div>' +
          '<div class="cs-acts"><button class="btn-ghost" id="mgEdit_' + i + '">✏️ 编辑</button><button class="btn-ghost btn-danger" id="mgDel_' + i + '">🗑 删除</button></div></div>';
      }).join("");
    }
    var html = '<h3>自定义科目管理</h3><div id="csList">' + body() + '</div>' +
      '<div class="modal-actions"><button class="btn-secondary" id="csClose">关闭</button><button class="btn-primary" id="csNew">＋ 新建科目</button></div>';
    openModal(html, { onMount: function (m) {
      m.querySelector("#csClose").onclick = function () { closeModal(m); };
      m.querySelector("#csNew").onclick = function () { openCustomSubjectModal(null); };
      bindList(m);
    }});
    function bindList(m) {
      list.forEach(function (s, i) {
        var e = m.querySelector("#mgEdit_" + i); if (e) e.onclick = function () { openCustomSubjectModal(i); };
        var d = m.querySelector("#mgDel_" + i); if (d) d.onclick = function () { removeCustomSubject(i); var box = m.querySelector("#csList"); if (box) box.innerHTML = body(); };
      });
    }
  }

  /* ===================== 页面分发 ===================== */
  function init() {
    DM.load();
    Theme.apply(); Theme.watch();
    registerSW();
    var page = document.body.getAttribute("data-page");
    if (page === "home") initHome();
    else if (page === "stats") initStats();
    else if (page === "settings") initSettings();
    // 底部导航
    $all(".tabbar button").forEach(function (b) {
      b.addEventListener("click", function () {
        var go = b.getAttribute("data-go");
        if (go && location.pathname.indexOf(go) < 0) location.href = go;
      });
    });
    // 弹窗关闭
    $all("[data-close]").forEach(function (x) { x.addEventListener("click", function () { var sh = x.closest(".sheet-mask"); if (sh) sh.style.display = "none"; }); });
  }
  function registerSW() {
    if ("serviceWorker" in navigator) {
      try { navigator.serviceWorker.register("sw.js").catch(function () {}); } catch (e) {}
    }
  }

  /* ===================== 首页：计时器 ===================== */
  function initHome() {
    var cur = { subject: "行测", category: "资料分析" };
    var selMin = 25, mode = "countdown", displayMode = "remaining";
    var timer = null, session = null;
    var R = 44, CIRC = 2 * Math.PI * R;

    var ringTime = $("#ringTime"), ringTtl = $("#ringTtl"), modeTag = $("#modeTag"),
        progRing = $("#progRing"), barTime = $("#barTime"), barFill = $("#barFill"),
        curSubject = $("#curSubject"), focusOverlay = $("#focusOverlay"),
        fSubj = $("#fSubj"), fTime = $("#fTime"), fTag = $("#fTag"), fStats = $("#fStats"),
        controls = $("#timerControls");

    progRing.style.strokeDasharray = CIRC;

    function renderSubject() { curSubject.textContent = cur.subject + " › " + cur.category; }
    function renderControls() {
      if (timer && timer.isRunning && !timer.isPaused) {
        controls.innerHTML = '<div class="btn-row"><button class="btn-secondary" id="pauseBtn">暂停</button>' +
          longPressBtn('<button class="btn-secondary btn-danger btn-longpress" id="endBtn">结束<SPAN class="lp-fill"></SPAN></button>') + '</div>';
        bindEnd($("#endBtn"));
        $("#pauseBtn").onclick = function () { timer.pause(); renderControls(); showFocus(); };
      } else if (timer && timer.isPaused) {
        controls.innerHTML = '<div class="btn-row"><button class="btn-secondary" id="resumeBtn">继续</button>' +
          longPressBtn('<button class="btn-secondary btn-danger btn-longpress" id="endBtn">结束<SPAN class="lp-fill"></SPAN></button>') + '</div>';
        bindEnd($("#endBtn"));
        $("#resumeBtn").onclick = function () { timer.resume(); renderControls(); showFocus(); };
      } else {
        controls.innerHTML = '<button class="btn-primary" id="startBtn">开始专注</button>';
        $("#startBtn").onclick = startSession;
      }
    }
    function longPressBtn(inner) { return inner; }
    function bindEnd(btn) {
      makeLongPress(btn, function () { endSession(); }, function (fill) { var f = btn.querySelector(".lp-fill"); if (f) f.style.width = (fill * 100) + "%"; });
    }
    function updateDisplay(st) {
      var remain = st.remaining, used = st.elapsed;
      var shown = displayMode === "remaining" ? remain : used;
      ringTime.textContent = fmtClock(shown);
      barTime.textContent = fmtClock(shown);
      ringTtl.textContent = displayMode === "remaining" ? "剩余时间" : "已用时间";
      modeTag.textContent = mode === "countdown" ? "倒计时" : "正计时";
      var p = timer ? timer.progress() : 0;
      progRing.style.strokeDashoffset = CIRC * (1 - p);
      barFill.style.width = (p * 100) + "%";
      // 专注覆盖层
      if (focusOverlay.classList.contains("show")) {
        fTime.textContent = fmtClock(shown);
        fTag.textContent = displayMode === "remaining" ? "剩余" : "已用";
      }
    }
    function startSession() {
      if (selMin <= 0) { toast("请先选择时长"); return; }
      session = { subject: cur.subject, category: cur.category, mode: mode, duration: selMin * 60 };
      timer = new Timer({
        duration: selMin * 60, mode: mode,
        onTick: updateDisplay,
        onComplete: function () { completeSession(true); }
      });
      timer._start = Date.now() / 1000;
      timer.start();
      renderControls();
      showFocus();
      wakeLock();
    }
    function showFocus() {
      fSubj.textContent = cur.subject + " › " + cur.category;
      focusOverlay.classList.add("show");
      updateFocusStats();
    }
    function hideFocus() { focusOverlay.classList.remove("show"); }
    function updateFocusStats() {
      var t = Stats.today();
      fStats.innerHTML = "今日已学：" + fmtMin(t.totalSec) + "<br>连续专注：第 " + (DM.streak.currentStreak || 0) + " 天";
    }
    function endSession() {
      if (!timer) return;
      timer.stop();
      completeSession(false);
    }
    function completeSession(auto) {
      var st = timer.getState();
      var elapsed = st.elapsed;
      var duration = session.duration;
      hideFocus();
      if (elapsed < 5) { toast("专注不足 5 秒，未记录"); resetIdle(); return; }
      var completed = elapsed >= 300;
      var rec = DM.addRecord({
        subject: session.subject, category: session.category, mode: session.mode,
        targetDuration: duration, duration: elapsed, completed: completed,
        _start: timer.startTime / 1000, _end: Date.now() / 1000
      });
      Stats.updateStreak(rec);
      updateTodayBar();
      updateFocusStats();
      // 完成确认
      openModal(
        '<h3>专注完成！</h3><p>本次学习：<b>' + fmtMin(elapsed) + '</b></p>' +
        '<p class="muted">' + esc(session.subject) + ' › ' + esc(session.category) + '</p>' +
        '<div class="modal-actions"><button class="btn-primary" id="okBtn">好的</button></div>',
        { onMount: function (m) { m.querySelector("#okBtn").onclick = function () { closeModal(m); showRest(rec); }; } }
      );
    }
    function showRest(rec) {
      if (!DM.settings.restReminder) { resetIdle(); return; }
      var remain = 5 * 60;
      var m = openModal(
        '<h3>休息一下</h3><p class="muted">保护眼睛，休息 5 分钟</p>' +
        '<div class="rest-time" id="restTime">05:00</div>' +
        '<div class="modal-actions"><button class="btn-secondary" id="skipBtn">跳过休息</button>' +
        '<button class="btn-primary" id="nextBtn">开始下一轮</button></div>',
        { dismissable: false, onMount: function (mm) {
            var iv = setInterval(function () {
              remain--; var rt = mm.querySelector("#restTime"); if (rt) rt.textContent = fmtClock(remain);
              if (remain <= 0) { clearInterval(iv); closeModal(mm); resetIdle(); }
            }, 1000);
            mm.querySelector("#skipBtn").onclick = function () { clearInterval(iv); closeModal(mm); resetIdle(); };
            mm.querySelector("#nextBtn").onclick = function () { clearInterval(iv); closeModal(mm); resetIdle(); };
          } }
      );
    }
    function resetIdle() {
      timer = null; session = null;
      progRing.style.strokeDashoffset = CIRC; barFill.style.width = "0%";
      ringTime.textContent = fmtClock(selMin * 60); barTime.textContent = fmtClock(selMin * 60);
      ringTtl.textContent = "剩余时间"; modeTag.textContent = mode === "countdown" ? "倒计时" : "正计时";
      hideFocus(); renderControls();
    }

    // 时长选择
    $all("#durations .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $all("#durations .chip").forEach(function (x) { x.classList.remove("active"); });
        c.classList.add("active");
        var m = parseInt(c.getAttribute("data-min"), 10);
        if (m === 0) {
          openModal(
            '<h3>自定义时长</h3><p class="muted">输入专注分钟数</p>' +
            '<input class="input" id="custMin" type="number" min="1" max="600" value="' + selMin + '" style="width:120px;text-align:center">' +
            '<div class="modal-actions"><button class="btn-secondary" id="cCancel">取消</button>' +
            '<button class="btn-primary" id="cOk">确定</button></div>',
            { onMount: function (mm) {
                mm.querySelector("#cCancel").onclick = function () { closeModal(mm); };
                mm.querySelector("#cOk").onclick = function () {
                  var v = parseInt(mm.querySelector("#custMin").value, 10);
                  if (v > 0) { selMin = v; c.textContent = v + " 分"; }
                  closeModal(mm); resetIdle();
                };
              } }
          );
        } else { selMin = m; resetIdle(); }
      });
    });

    // 模式切换（点击 mode-tag）
    modeTag.addEventListener("click", function () {
      mode = mode === "countdown" ? "countup" : "countdown";
      if (!timer) resetIdle();
    });
    // 显示切换（点击大数字）
    $(".ring .center").addEventListener("click", function () {
      displayMode = displayMode === "remaining" ? "elapsed" : "remaining";
      if (timer) updateDisplay(timer.getState());
    });

    // 科目选择弹窗
    $("#subjectBar").addEventListener("click", function () { renderSubjectSheet(); openSheet("subjectSheet"); });
    renderSubjectSheet();
    function renderSubjectSheet() {
      var box = $("#subjectSheetContent");
      var html = "";
      // 最近使用
      if (DM.settings.recent && DM.settings.recent.length) {
        html += '<div class="subj-section"><div class="ttl">最近使用</div><div class="subj-grid">';
        DM.settings.recent.forEach(function (sc) { html += subjPill(sc, false); });
        html += '</div></div>';
      }
      // 收藏
      if (DM.favorites.length) {
        html += '<div class="subj-section"><div class="ttl">★ 收藏科目</div><div class="subj-grid">';
        DM.favorites.forEach(function (sc) { html += subjPill(sc, true); });
        html += '</div></div>';
      }
      // 完整树
      html += '<div class="subj-section"><div class="ttl">全部科目</div><div class="subj-tree">';
      SUBJECTS.forEach(function (g) {
        html += '<div class="subj-group"><div class="gname">' + esc(g.name) + '</div><div class="items">';
        g.items.forEach(function (it) { html += subjPill({ subject: g.name, category: it }, DM.isFavorite({ subject: g.name, category: it })); });
        html += '</div></div>';
      });
      html += '</div></div>';
      // 自定义科目
      var cus = DM.settings.customSubjects || [];
      if (cus.length) {
        html += '<div class="subj-section"><div class="ttl">✏️ 自定义科目 <button class="mini-btn" id="csManage">管理</button></div><div class="subj-grid">';
        cus.forEach(function (c) {
          c.items.forEach(function (it) { html += subjPill({ subject: c.name, category: it }, DM.isFavorite({ subject: c.name, category: it })); });
        });
        html += '</div></div>';
      }
      html += '<button class="btn-ghost add-cs" id="csAddNew">＋ 新建自定义科目</button>';
      box.innerHTML = html;
      $all(".subj-pill", box).forEach(function (p) {
        p.addEventListener("click", function (e) {
          var sc = JSON.parse(p.getAttribute("data-sc"));
          if (e.target.classList.contains("star")) { DM.toggleFavorite(sc); renderSubjectSheet(); return; }
          cur = sc; renderSubject(); closeSheet("subjectSheet");
        });
      });
      var addBtn = box.querySelector("#csAddNew"); if (addBtn) addBtn.onclick = function () { openCustomSubjectModal(null); };
      var manBtn = box.querySelector("#csManage"); if (manBtn) manBtn.onclick = function () { openSubjectManager(); };
    }
    function subjPill(sc, fav) {
      var active = (cur.subject === sc.subject && cur.category === sc.category) ? " active" : "";
      return '<span class="subj-pill' + active + '" data-sc=\'' + JSON.stringify(sc).replace(/'/g, "&#39;") + '\'>' +
        (fav ? '<span class="star">★</span>' : '') + esc(sc.subject) + " › " + esc(sc.category) + '</span>';
    }

    rerenderSheet = renderSubjectSheet;

    // 专注覆盖层按钮 + 手势
    $("#fPause").addEventListener("click", function () {
      if (!timer) return;
      if (timer.isPaused) { timer.resume(); $("#fPause").textContent = "暂停"; renderControls(); }
      else { timer.pause(); $("#fPause").textContent = "继续"; renderControls(); }
    });
    makeLongPress($("#fEnd"), function () { endSession(); }, function (fill) {
      $("#fEnd").style.background = "rgba(255,77,79," + (0.3 + fill * 0.5) + ")";
    });
    bindSwipe(focusOverlay, function (dir) {
      if (!timer) return;
      if (dir === "left") endSession();
      else if (dir === "right") { if (timer.isPaused) { timer.resume(); $("#fPause").textContent = "暂停"; } else { timer.pause(); $("#fPause").textContent = "继续"; } renderControls(); }
    });

    // 今日统计条
    $("#todayBar").addEventListener("click", function () { location.href = "stats.html"; });
    function updateTodayBar() {
      var t = Stats.today();
      $("#todayMin").textContent = fmtMin(t.totalSec);
      $("#streakDay").textContent = DM.streak.currentStreak || 0;
      renderExamHint();
    }
    function renderExamHint() {
      var hint = $("#examHint"); if (!hint) return;
      if (DM.settings.examDate) {
        var days = Math.round((new Date(DM.settings.examDate + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000);
        hint.textContent = "📅 " + esc(DM.settings.examName || "考试") + " 还有 " + days + " 天";
      } else hint.textContent = "";
    }

    // 初始
    renderSubject(); renderControls(); updateTodayBar(); resetIdle();
  }

  /* ===================== 长按 / 滑动 ===================== */
  function makeLongPress(el, cb, onProgress) {
    if (!el) return;
    var timer = null, raf = null, start = 0, MS = 1500;
    function step() {
      var p = Math.min(1, (Date.now() - start) / MS);
      if (onProgress) onProgress(p);
      if (p >= 1) { clearTimeout(timer); cb(); return; }
      raf = requestAnimationFrame(step);
    }
    function down(e) { e.preventDefault(); start = Date.now(); if (onProgress) onProgress(0); raf = requestAnimationFrame(step); }
    function up() { cancelAnimationFrame(raf); if (onProgress) onProgress(0); }
    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("mousedown", down);
    el.addEventListener("touchend", up); el.addEventListener("touchcancel", up);
    el.addEventListener("mouseup", up); el.addEventListener("mouseleave", up);
  }
  function bindSwipe(el, cb) {
    var x0 = null, y0 = null;
    el.addEventListener("touchstart", function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (x0 == null) return; var t = e.changedTouches[0]; var dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) cb(dx < 0 ? "left" : "right");
    });
  }

  /* ===================== 统计页 ===================== */
  function initStats() {
    var range = "week";
    render();
    $all("#trendSeg button").forEach(function (b) {
      b.addEventListener("click", function () {
        $all("#trendSeg button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active"); range = b.getAttribute("data-range"); renderTrend();
      });
    });
    $("#exportBtn").onclick = function () { exportData(); };
    $("#clearBtn").onclick = function () {
      openModal('<h3>清空学习记录？</h3><p class="muted">将删除全部 ' + DM.records.length + ' 条记录，且不可恢复。</p>' +
        '<div class="modal-actions"><button class="btn-secondary" id="c1">取消</button><button class="btn-primary btn-danger" id="c2">确认清空</button></div>',
        { onMount: function (m) { m.querySelector("#c1").onclick = function () { closeModal(m); }; m.querySelector("#c2").onclick = function () { DM.clearRecords(); closeModal(m); render(); toast("已清空"); }; } });
    };

    function render() {
      var t = Stats.today();
      $("#ovTotal").textContent = fmtMin(t.totalSec);
      $("#ovCount").textContent = t.count;
      $("#ovAvg").textContent = t.avgText;
      $("#ovEff").textContent = t.efficiency;
      renderSubjectBars();
      renderTrend();
      renderCalendar();
      renderRecords();
      $("#streakBig").textContent = DM.streak.currentStreak || 0;
    }
    function renderSubjectBars() {
      var dist = Stats.subjectDistribution(Stats.todayRecords());
      var max = dist.length ? dist[0].sec : 1;
      var box = $("#subjectBars");
      if (!dist.length) { box.innerHTML = '<p class="muted">今日暂无学习记录</p>'; return; }
      box.innerHTML = dist.map(function (d) {
        var pct = Math.max(4, (d.sec / max) * 100);
        return '<div class="bar-item"><div class="top"><span>' + esc(d.subject) + '</span><span>' + fmtMin(d.sec) + '</span></div>' +
          '<div class="track"><div class="fill" style="width:' + pct + '%;background:' + d.color + '"></div></div></div>';
      }).join("");
    }
    function renderTrend() {
      if (range === "day") renderHeat();
      else if (range === "week") renderWeek();
      else renderMonth();
    }
    function renderHeat() {
      var heat = Stats.hourHeat(Stats.todayRecords());
      var max = Math.max(1, Math.max.apply(null, heat));
      var cells = "";
      for (var h = 0; h < 24; h++) {
        var inten = heat[h] / max;
        var bg = inten <= 0 ? "var(--bg-secondary)" : (inten < 0.34 ? "rgba(24,144,255,.35)" : inten < 0.67 ? "rgba(24,144,255,.6)" : "var(--accent)");
        cells += '<div class="cell ' + (heat[h] > 0 ? "on" : "") + '" style="background:' + bg + '" title="' + h + '时">' + h + '</div>';
      }
      $("#trendChart").innerHTML = '<div class="heat">' + cells + '</div><p class="tertiary" style="font-size:12px;text-align:center;margin-top:6px">今日各时段专注热力（0–23 时）</p>';
    }
    function renderWeek() {
      var data = Stats.dailyTotals(7);
      $("#trendChart").innerHTML = weekBarsSVG(data, "近 7 天每日时长");
    }
    function renderMonth() {
      var data = Stats.dailyTotals(30);
      $("#trendChart").innerHTML = monthLineSVG(data, "近 30 天每日时长");
    }
    function renderCalendar() {
      renderCal(new Date().getFullYear(), new Date().getMonth());
    }
    var calY, calM;
    function renderCal(y, m) {
      calY = y; calM = m;
      var box = $("#calendar");
      var first = new Date(y, m, 1).getDay();
      var days = new Date(y, m + 1, 0).getDate();
      var studied = Stats.studiedSet();
      var today = todayStr();
      var html = '<div class="cal-head"><button id="calPrev">‹</button><span class="mt">' + y + ' 年 ' + (m + 1) + ' 月</span><button id="calNext">›</button></div>';
      html += '<div class="cal-grid">';
      ["日", "一", "二", "三", "四", "五", "六"].forEach(function (w) { html += '<div class="wd">' + w + '</div>'; });
      for (var i = 0; i < first; i++) html += '<div class="day other"></div>';
      for (var d = 1; d <= days; d++) {
        var ds = y + "-" + pad(m + 1) + "-" + pad(d);
        var cls = "day" + (studied[ds] ? " studied" : "") + (ds === today ? " today" : "");
        html += '<div class="' + cls + '">' + d + '</div>';
      }
      html += '</div>';
      box.innerHTML = html;
      $("#calPrev").onclick = function () { var nm = m - 1; var ny = y; if (nm < 0) { nm = 11; ny--; } renderCal(ny, nm); };
      $("#calNext").onclick = function () { var nm = m + 1; var ny = y; if (nm > 11) { nm = 0; ny++; } renderCal(ny, nm); };
    }
    function renderRecords() {
      var box = $("#recordList");
      if (!DM.records.length) { box.innerHTML = '<p class="muted">暂无学习记录</p>'; return; }
      var sorted = DM.records.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
      var groups = {}, order = [];
      sorted.forEach(function (r) {
        var label = r.date === todayStr() ? "今天" : (r.date === dateAdd(todayStr(), -1) ? "昨天" : r.date);
        if (!groups[label]) { groups[label] = []; order.push(label); }
        groups[label].push(r);
      });
      box.innerHTML = order.map(function (label) {
        var rows = groups[label].map(function (r) {
          var cls = "rec " + (r.completed ? "done" : "miss");
          return '<div class="' + cls + '" data-id="' + r.id + '"><span class="dot"></span>' +
            '<div class="info"><div class="sub">' + esc(r.subject) + " › " + esc(r.category) + '</div>' +
            '<div class="meta">' + esc(r.startTime) + " – " + esc(r.endTime) + ' · ' + (r.mode === "countdown" ? "倒计时" : "正计时") + '</div></div>' +
            '<div class="dur">' + fmtMin(r.duration) + '</div>' +
            '<button class="del" data-del="' + r.id + '">🗑</button></div>';
        }).join("");
        return '<div class="rec-group"><div class="gdate">' + esc(label) + '</div>' + rows + '</div>';
      }).join("");
      $all("[data-del]", box).forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          var id = b.getAttribute("data-del");
          DM.deleteRecord(id); render(); toast("已删除");
        });
      });
      // 左滑删除
      $all(".rec", box).forEach(function (row) {
        bindSwipe(row, function (dir) { if (dir === "left") { DM.deleteRecord(row.getAttribute("data-id")); render(); toast("已删除"); } });
      });
    }
  }

  /* SVG 图表（无需 canvas，兼容离线/测试） */
  function weekBarsSVG(data, title) {
    var W = 320, H = 160, padB = 24, padT = 10, max = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.minutes; })));
    var bw = 26, gap = (W - bw * data.length) / (data.length + 1);
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
    data.forEach(function (d, i) {
      var h = (d.minutes / max) * (H - padB - padT);
      var x = gap + i * (bw + gap), y = H - padB - h;
      svg += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="3" fill="var(--accent)"></rect>';
      svg += '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + d.label + '</text>';
      if (d.minutes > 0) svg += '<text x="' + (x + bw / 2) + '" y="' + (y - 3) + '" text-anchor="middle" fill="var(--accent)">' + d.minutes + '</text>';
    });
    svg += '</svg><p class="tertiary" style="font-size:12px;text-align:center;margin-top:4px">' + title + '</p>';
    return svg;
  }
  function monthLineSVG(data, title) {
    var W = 320, H = 160, padB = 24, padT = 14, padL = 6, padR = 6;
    var max = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.minutes; })));
    var n = data.length, stepX = (W - padL - padR) / (n - 1);
    var pts = data.map(function (d, i) {
      var x = padL + i * stepX, y = H - padB - (d.minutes / max) * (H - padB - padT);
      return [x, y];
    });
    var line = pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
    var area = "M" + pts[0][0].toFixed(1) + "," + (H - padB) + " L" + line + " L" + pts[n - 1][0].toFixed(1) + "," + (H - padB) + " Z";
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
    svg += '<polygon points="' + area + '" fill="var(--accent-light)"></polygon>';
    svg += '<polyline points="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2"></polyline>';
    pts.forEach(function (p, i) { if (i % 5 === 0 || i === n - 1) svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.5" fill="var(--accent)"></circle>'; });
    svg += '<text x="' + padL + '" y="' + (H - 6) + '">' + data[0].label + '</text>';
    svg += '<text x="' + (W - padR) + '" y="' + (H - 6) + '" text-anchor="end">' + data[n - 1].label + '</text>';
    svg += '</svg><p class="tertiary" style="font-size:12px;text-align:center;margin-top:4px">' + title + '</p>';
    return svg;
  }

  /* ===================== 设置页 ===================== */
  function initSettings() {
    var s = DM.settings;
    $("#dailyTarget").value = Math.round(s.dailyTargetMinutes / 60);
    setTgt("xingce", s.subjectTargets["行测"]); setTgt("shenlun", s.subjectTargets["申论"]);
    setTgt("mianshi", s.subjectTargets["面试"]); setTgt("zonghe", s.subjectTargets["综合"]);
    $("#examName").value = s.examName || "";
    $("#examDate").value = s.examDate || "";
    $("#reminderEnabled").checked = !!s.reminderEnabled;
    $("#reminderTime").value = s.reminderTime || "09:00";
    $("#targetNotMet").checked = !!s.targetNotMet;
    $("#streakBreak").checked = !!s.streakBreak;
    $("#restReminder").checked = s.restReminder !== false;
    $("#theme").value = s.theme;
    $("#timerStyle").value = s.timerStyle || "digital";
    syncAccentSwatch(s.accentColor);
    updateExamRemain(); updateDataInfo();

    function setTgt(k, v) { var el = $("#tgt_" + k); if (el) el.value = Math.round((v || 0) / 60); }
    function syncAccentSwatch(c) { $all("#accentSwatches .swatch").forEach(function (x) { x.classList.toggle("active", x.getAttribute("data-c").toLowerCase() === c.toLowerCase()); }); }

    function saveT() { DM.saveSettings(); Theme.apply(); }

    $("#dailyTarget").onchange = function () { s.dailyTargetMinutes = Math.max(0, parseInt(this.value, 10) || 0) * 60; saveT(); };
    ["xingce", "shenlun", "mianshi", "zonghe"].forEach(function (k, i) {
      var map = { xingce: "行测", shenlun: "申论", mianshi: "面试", zonghe: "综合" };
      $("#tgt_" + k).onchange = function () { s.subjectTargets[map[k]] = Math.max(0, parseInt(this.value, 10) || 0) * 60; saveT(); };
    });
    $("#examName").onchange = function () { s.examName = this.value; saveT(); updateExamRemain(); };
    $("#examDate").onchange = function () { s.examDate = this.value; saveT(); updateExamRemain(); };
    $("#reminderEnabled").onchange = function () { s.reminderEnabled = this.checked; saveT(); };
    $("#reminderTime").onchange = function () { s.reminderTime = this.value; saveT(); };
    $("#targetNotMet").onchange = function () { s.targetNotMet = this.checked; saveT(); };
    $("#streakBreak").onchange = function () { s.streakBreak = this.checked; saveT(); };
    $("#restReminder").onchange = function () { s.restReminder = this.checked; saveT(); };
    $("#theme").onchange = function () { s.theme = this.value; saveT(); };
    $("#timerStyle").onchange = function () { s.timerStyle = this.value; saveT(); };
    $all("#accentSwatches .swatch").forEach(function (x) {
      x.addEventListener("click", function () { s.accentColor = x.getAttribute("data-c"); syncAccentSwatch(s.accentColor); saveT(); });
    });

    function updateExamRemain() {
      var el = $("#examRemain");
      if (!s.examDate) { el.textContent = "未设置考试日期"; return; }
      var days = Math.round((new Date(s.examDate + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000);
      el.textContent = "距离考试还有 " + days + " 天";
    }
    function updateDataInfo() { $("#dataInfo").textContent = "总记录：" + DM.records.length + " 条 · 最早：" + (DM.records.length ? DM.records.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0].date : "—"); }

    $("#exportData").onclick = function () { exportData(); };
    $("#importData").onclick = function () { $("#importFile").click(); };
    $("#importFile").onchange = function () {
      var f = this.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try { DM.importAll(JSON.parse(rd.result)); Theme.apply(); closeModal; initSettings(); toast("导入成功"); setTimeout(function () { location.reload(); }, 600); }
        catch (e) { toast("导入失败：" + e.message); }
      };
      rd.readAsText(f);
    };
    $("#clearAll").onclick = function () {
      openModal('<h3>清除全部数据？</h3><p class="muted">将删除所有学习记录、设置与打卡数据。</p>' +
        '<div class="modal-actions"><button class="btn-secondary" id="x1">取消</button><button class="btn-primary btn-danger" id="x2">确认清除</button></div>',
        { onMount: function (m) { m.querySelector("#x1").onclick = function () { closeModal(m); }; m.querySelector("#x2").onclick = function () { DM.clearRecords(); DM.settings = Object.assign({}, DEFAULT_SETTINGS); DM.favorites = []; DM.streak = Object.assign({}, DEFAULT_STREAK); DM.saveSettings(); DM.saveFavorites(); DM.saveStreak(); closeModal(m); toast("已清除"); setTimeout(function () { location.reload(); }, 500); }; } });
    };
    $("#feedback").onclick = function () { toast("感谢反馈！可把建议发给开发者 💌"); };
    $("#rate").onclick = function () { toast("如果好用，记得给个 ⭐ 好评哦！"); };

    // 自定义科目管理列表
    function renderCsList() {
      var list = DM.settings.customSubjects || [];
      var box = $("#customSubjectsList"); if (!box) return;
      if (!list.length) { box.innerHTML = '<p class="muted" style="padding:6px 0">还没有自定义科目，点击下方按钮添加。</p>'; return; }
      box.innerHTML = list.map(function (s, i) {
        return '<div class="cs-row"><div class="cs-info"><b>' + esc(s.name) + '</b><span class="tertiary"> · ' + esc(s.items.join("、")) + '</span></div>' +
          '<div class="cs-acts"><button class="btn-ghost" id="ed_' + i + '">✏️ 编辑</button><button class="btn-ghost btn-danger" id="dl_' + i + '">🗑 删除</button></div></div>';
      }).join("");
      list.forEach(function (s, i) {
        var e = $("#ed_" + i); if (e) e.onclick = function () { openCustomSubjectModal(i); };
        var d = $("#dl_" + i); if (d) d.onclick = function () { removeCustomSubject(i); renderCsList(); };
      });
    }
    renderCsList();
    $("#addCustomSubject").onclick = function () { openCustomSubjectModal(null); };
    rerenderSubjectsList = renderCsList;
  }

  /* ===================== 导出 ===================== */
  function exportData() {
    var blob = new Blob([JSON.stringify(DM.exportAll(), null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "kaogong_timer_backup_" + todayStr() + ".json"; a.click();
    toast("已导出备份");
  }

  /* ===================== 启动 ===================== */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // 屏幕常亮（iOS 16.4+）
  function wakeLock() {
    if (navigator.wakeLock) { try { navigator.wakeLock.request("screen").catch(function () {}); } catch (e) {} }
  }

  // 测试/调试钩子（无害）
  window.KGT = { DM: DM, Stats: Stats, Timer: Timer, Theme: Theme, subjColor: subjColor, getAllSubjects: getAllSubjects, openCustomSubjectModal: openCustomSubjectModal, openSubjectManager: openSubjectManager, fmt: { fmtDur: fmtDur, fmtClock: fmtClock } };
})();
