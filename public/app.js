const form = document.getElementById("stats-form");
const robotInput = document.getElementById("robotId");
const queryDateInput = document.getElementById("queryDate");
const testBtn = document.getElementById("testBtn");
const runTimeValue = document.getElementById("runTimeValue");
const distanceValue = document.getElementById("distanceValue");
const taskCountValue = document.getElementById("taskCountValue");
const completedTaskCountValue = document.getElementById("completedTaskCountValue");
const callCountValue = document.getElementById("callCountValue");
const failedTaskCountValue = document.getElementById("failedTaskCountValue");
const totalMileageValue = document.getElementById("totalMileageValue");
const totalHoursValue = document.getElementById("totalHoursValue");
const dateLabel = document.getElementById("dateLabel");
const timezoneLabel = document.getElementById("timezoneLabel");
const notice = document.getElementById("notice");
const saveSettings = document.getElementById("saveSettings");
const appIdInput = document.getElementById("appIdInput");
const appSecretInput = document.getElementById("appSecretInput");
const appCodeInput = document.getElementById("appCodeInput");
const executeBtn = document.getElementById("executeBtn");
const stopBtn = document.getElementById("stopBtn");
const saveScheduleBtn = document.getElementById("saveScheduleBtn");
const addScheduleRuleBtn = document.getElementById("addScheduleRuleBtn");
const updateScheduleRuleBtn = document.getElementById("updateScheduleRuleBtn");
const saveRuleBtn = document.getElementById("saveRuleBtn");
const testLineBtn = document.getElementById("testLineBtn");
const testEmailBtn = document.getElementById("testEmailBtn");
const checkUpdateBtn = document.getElementById("checkUpdateBtn");
const currentVersion = document.getElementById("currentVersion");
const latestVersion = document.getElementById("latestVersion");
const loadLineSourcesBtn = document.getElementById("loadLineSourcesBtn");
const saveLineWebhookBtn = document.getElementById("saveLineWebhookBtn");
const lineWebhookPath = document.getElementById("lineWebhookPath");
const lineSources = document.getElementById("lineSources");
const scheduleStatus = document.getElementById("scheduleStatus");
const scheduleStatusText = document.getElementById("scheduleStatusText");
const logExportPath = document.getElementById("logExportPath");
const browseLogPathBtn = document.getElementById("browseLogPathBtn");
const saveLogPathBtn = document.getElementById("saveLogPathBtn");
const exportLogBtn = document.getElementById("exportLogBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const logView = document.getElementById("logView");
const scheduleName = document.getElementById("scheduleName");
const scheduleLineTo = document.getElementById("scheduleLineTo");
const scheduleCallThreshold = document.getElementById("scheduleCallThreshold");
const scheduleShowCallCount = document.getElementById("scheduleShowCallCount");
const scheduleSkipNationalHolidays = document.getElementById("scheduleSkipNationalHolidays");
const scheduleRulesList = document.getElementById("scheduleRulesList");
const scheduleEditModal = document.getElementById("scheduleEditModal");
const editScheduleName = document.getElementById("editScheduleName");
const editRuleTime = document.getElementById("editRuleTime");
const editRuleRobotId = document.getElementById("editRuleRobotId");
const editScheduleLineTo = document.getElementById("editScheduleLineTo");
const editScheduleCallThreshold = document.getElementById("editScheduleCallThreshold");
const editScheduleShowCallCount = document.getElementById("editScheduleShowCallCount");
const editScheduleSkipNationalHolidays = document.getElementById("editScheduleSkipNationalHolidays");
const closeScheduleEditBtn = document.getElementById("closeScheduleEditBtn");
const cancelScheduleEditBtn = document.getElementById("cancelScheduleEditBtn");
const saveScheduleEditBtn = document.getElementById("saveScheduleEditBtn");
const ruleTime = document.getElementById("ruleTime");
const ruleRobotId = document.getElementById("ruleRobotId");
const lineEnabled = document.getElementById("lineEnabled");
const emailEnabled = document.getElementById("emailEnabled");
const lineChannelId = document.getElementById("lineChannelId");
const lineChannelSecret = document.getElementById("lineChannelSecret");
const lineTestTo = document.getElementById("lineTestTo");
const lineTo = document.getElementById("lineTo");
const emailTo = document.getElementById("emailTo");
const smtpHost = document.getElementById("smtpHost");
const smtpPort = document.getElementById("smtpPort");
const smtpFrom = document.getElementById("smtpFrom");
const smtpUser = document.getElementById("smtpUser");
const smtpPass = document.getElementById("smtpPass");
const smtpSecure = document.getElementById("smtpSecure");

const SETTINGS_KEY = "amr_stats_settings_v1";
const RULES_KEY = "amr_stats_rules_v6";
const LINE_WEBHOOK_KEY = "amr_stats_line_webhook_url_v1";
const LOG_KEY = "amr_stats_logs_v1";
const LOG_PATH_KEY = "amr_stats_log_export_path_v1";
const HOLIDAY_CACHE_KEY = "amr_stats_national_holidays_v1";
const LEGACY_RULES_KEYS = ["amr_stats_rules_v5", "amr_stats_rules_v4", "amr_stats_rules_v3", "amr_stats_rules_v2", "amr_stats_rules_v1"];
const EMPTY_VALUE = "尚未查詢";

let nationalHolidayDates = new Set();
let nationalHolidayYears = new Set();
let nationalHolidayFetchedAt = "";

let scheduleTimers = new Map();
let scheduleEnabled = false;
let scheduleState = "off";
let selectedScheduleId = "";
let editingScheduleId = "";

loadSettings();
loadRules();
loadLineWebhookUrl();
loadLogExportPath();
loadHolidayCache();
initQueryDate();
initTabs();
initVersionInfo();
setScheduleStatus("off", "排程未開啟");
addLog("程式啟動");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await queryStats(robotInput.value.trim());
});

saveSettings.addEventListener("click", () => {
  const appId = appIdInput.value.trim();
  const appSecret = appSecretInput.value.trim();
  const appCode = appCodeInput.value.trim();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ appId, appSecret, appCode }));
  notice.textContent = "API 設定已儲存。";
  addLog("API 設定已儲存");
});

executeBtn.addEventListener("click", () => {
  const rule = getRule();
  if (!rule.robotId) {
    notice.textContent = "請先在新增排程填入機器人 ID。";
    setScheduleStatus("warning", "排程異常：缺少機器人 ID");
    addLog("啟用排程失敗：缺少機器人 ID", "WARN");
    return;
  }
  if (!rule.time) {
    notice.textContent = "請先在新增排程選擇查詢時間。";
    setScheduleStatus("warning", "排程異常：缺少查詢時間");
    addLog("啟用排程失敗：缺少查詢時間", "WARN");
    return;
  }
  if (!hasAnyNotificationTarget(rule)) {
    notice.textContent = "請至少啟用並設定 LINE 或 Email 通知。";
    setScheduleStatus("warning", "排程異常：缺少通知設定");
    addLog("啟用排程失敗：缺少通知設定", "WARN");
    return;
  }

  scheduleEnabled = true;
  setScheduleStatus("ok", "排程已啟用");
  addLog(`排程已啟用，機器人 ID：${rule.robotId}，查詢時間：${rule.time}`);
  scheduleNextRun();
});

stopBtn?.addEventListener("click", () => {
  stopSchedule();
  notice.textContent = "排程已停用。";
  setScheduleStatus("off", "排程未開啟");
  addLog("排程已停用");
});

saveScheduleBtn?.addEventListener("click", () => {
  saveRule("排程已儲存。");
});

saveRuleBtn.addEventListener("click", () => {
  saveRule("通知設定已儲存。");
});

testLineBtn.addEventListener("click", async () => {
  const rule = readRuleForm();
  const testTarget = lineTestTo?.value.trim() || "";
  const testRule = { ...rule, lineTo: testTarget || rule.lineTo };
  const validationError = validateLineRule(testRule);
  if (validationError) {
    notice.textContent = validationError;
    addLog(`LINE 測試取消：${validationError}`, "WARN");
    return;
  }

  testLineBtn.disabled = true;
  notice.textContent = "LINE 測試訊息寄送中...";
  addLog("LINE 測試訊息寄送中");
  try {
    await sendLineMessage(testRule, "AMR 統計 LINE 測試訊息");
    notice.textContent = "LINE 測試訊息已送出。";
    addLog("LINE 測試訊息已送出");
  } catch (err) {
    notice.textContent = `LINE 測試失敗：${err.message}`;
    addLog(`LINE 測試失敗：${err.message}`, "ERROR");
  } finally {
    testLineBtn.disabled = false;
  }
});

testEmailBtn.addEventListener("click", async () => {
  const rule = readRuleForm();
  const validationError = validateEmailRule(rule);
  if (validationError) {
    notice.textContent = validationError;
    addLog(`Email 測試取消：${validationError}`, "WARN");
    return;
  }

  testEmailBtn.disabled = true;
  notice.textContent = "Email 測試信寄送中...";
  addLog("Email 測試信寄送中");
  try {
    await sendEmailMessage(rule, "AMR 統計 Email 測試", "AMR 統計 Email 測試信");
    notice.textContent = "Email 測試信已送出。";
    addLog("Email 測試信已送出");
  } catch (err) {
    notice.textContent = `Email 測試失敗：${err.message}`;
    addLog(`Email 測試失敗：${err.message}`, "ERROR");
  } finally {
    testEmailBtn.disabled = false;
  }
});

saveLineWebhookBtn.addEventListener("click", () => {
  const value = lineWebhookPath.value.trim();
  localStorage.setItem(LINE_WEBHOOK_KEY, value);
  notice.textContent = "LINE Webhook URL 已儲存。";
  addLog("LINE Webhook URL 已儲存");
});

loadLineSourcesBtn.addEventListener("click", async () => {
  loadLineSourcesBtn.disabled = true;
  notice.textContent = "正在讀取 LINE webhook 收到的目標 ID...";
  try {
    const response = await fetch("/api/line/sources");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "讀取 LINE 目標 ID 失敗");
    renderLineSources(Array.isArray(payload.sources) ? payload.sources : []);
    notice.textContent = payload.sources?.length ? "已讀取 LINE 目標 ID。" : "尚未收到 LINE webhook 事件。";
    addLog(`讀取 LINE 目標 ID：${payload.sources?.length || 0} 筆`);
  } catch (err) {
    notice.textContent = err.message;
    addLog(`讀取 LINE 目標 ID 失敗：${err.message}`, "ERROR");
  } finally {
    loadLineSourcesBtn.disabled = false;
  }
});

browseLogPathBtn.addEventListener("click", async () => {
  if (!window.amrDesktop?.chooseLogDirectory) {
    notice.textContent = "目前環境不支援瀏覽選擇資料夾，請在桌面版中使用。";
    addLog("瀏覽選擇 Log 資料夾失敗：目前環境不支援", "WARN");
    return;
  }

  browseLogPathBtn.disabled = true;
  try {
    const selectedPath = await window.amrDesktop.chooseLogDirectory();
    if (!selectedPath) {
      notice.textContent = "已取消選擇 Log 儲存位置。";
      return;
    }
    logExportPath.value = selectedPath;
    localStorage.setItem(LOG_PATH_KEY, selectedPath);
    notice.textContent = "Log 儲存位置已選擇並儲存。";
    addLog(`Log 儲存位置已選擇：${selectedPath}`);
  } catch (err) {
    notice.textContent = `選擇 Log 儲存位置失敗：${err.message}`;
    addLog(`選擇 Log 儲存位置失敗：${err.message}`, "ERROR");
  } finally {
    browseLogPathBtn.disabled = false;
  }
});

saveLogPathBtn.addEventListener("click", () => {
  const value = logExportPath.value.trim();
  localStorage.setItem(LOG_PATH_KEY, value);
  notice.textContent = "Log 儲存位置已儲存。";
  addLog(`Log 儲存位置已儲存：${value || "預設位置"}`);
});

exportLogBtn.addEventListener("click", async () => {
  exportLogBtn.disabled = true;
  notice.textContent = "Log TXT 輸出中...";
  try {
    const response = await fetch("/api/log/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directoryPath: logExportPath.value.trim(),
        content: getLogText()
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Log 輸出失敗");
    notice.textContent = `Log 已輸出：${payload.path}`;
    addLog(`Log 已輸出：${payload.path}`);
  } catch (err) {
    notice.textContent = `Log 輸出失敗：${err.message}`;
    addLog(`Log 輸出失敗：${err.message}`, "ERROR");
  } finally {
    exportLogBtn.disabled = false;
  }
});

clearLogBtn.addEventListener("click", () => {
  localStorage.removeItem(LOG_KEY);
  renderLogs();
  notice.textContent = "Log 已清除。";
  addLog("Log 已清除");
});

checkUpdateBtn?.addEventListener("click", async () => {
  if (!window.amrDesktop?.checkForUpdates) {
    notice.textContent = "目前環境不支援 OTA 更新檢查。";
    addLog("OTA 更新檢查不可用", "WARN");
    return;
  }
  checkUpdateBtn.disabled = true;
  notice.textContent = "正在檢查軟體更新...";
  addLog("正在檢查軟體更新");
  try {
    const result = await window.amrDesktop.checkForUpdates();
    if (result?.message) {
      notice.textContent = result.message;
      addLog(result.message, result.ok ? "INFO" : "WARN");
    }
    if (result?.versionInfo) updateVersionInfo(result.versionInfo);
  } catch (err) {
    notice.textContent = `檢查更新失敗：${err.message}`;
    addLog(`檢查更新失敗：${err.message}`, "ERROR");
  } finally {
    checkUpdateBtn.disabled = false;
  }
});

window.amrDesktop?.onUpdateStatus?.((message) => {
  if (!message) return;
  notice.textContent = message;
  addLog(message, message.includes("失敗") ? "ERROR" : "INFO");
});

window.amrDesktop?.onVersionInfo?.((info) => {
  updateVersionInfo(info);
});

executeBtn.addEventListener("click", async (event) => {
  event.stopImmediatePropagation();
  if (scheduleEnabled) {
    stopSchedule();
    notice.textContent = "排程已停用。";
    setScheduleStatus("off", "排程未開啟");
    addLog("排程已停用");
    return;
  }
  const rules = ensureSavedScheduleRules();
  const invalid = rules.map(validateScheduleRule).find(Boolean);
  if (invalid) {
    notice.textContent = invalid;
    setScheduleStatus("warning", invalid);
    addLog(`啟用排程失敗：${invalid}`, "WARN");
    return;
  }
  scheduleEnabled = true;
  await scheduleAllRuns(rules);
}, true);

stopBtn?.addEventListener("click", (event) => {
  event.stopImmediatePropagation();
  stopSchedule();
  notice.textContent = "排程已停用。";
  setScheduleStatus("off", "排程未開啟");
  addLog("排程已停用");
}, true);

saveScheduleBtn?.addEventListener("click", (event) => {
  event.stopImmediatePropagation();
  saveCurrentScheduleRule("排程已儲存。");
}, true);

saveRuleBtn.addEventListener("click", (event) => {
  event.stopImmediatePropagation();
  saveNotificationSettings();
}, true);

addScheduleRuleBtn.addEventListener("click", addScheduleRule);
updateScheduleRuleBtn?.addEventListener("click", () => saveCurrentScheduleRule("選取排程已更新。"));
scheduleShowCallCount.addEventListener("change", syncCallThresholdState);
editScheduleShowCallCount.addEventListener("change", syncEditCallThresholdState);
closeScheduleEditBtn.addEventListener("click", closeScheduleEditModal);
cancelScheduleEditBtn.addEventListener("click", closeScheduleEditModal);
scheduleEditModal.addEventListener("click", (event) => {
  if (event.target === scheduleEditModal) closeScheduleEditModal();
});
saveScheduleEditBtn.addEventListener("click", saveScheduleEdit);

async function queryStats(robotId, sourceText = "查詢") {
  if (!robotId) {
    notice.textContent = "請輸入機器人 ID。";
    addLog(`${sourceText}取消：缺少機器人 ID`, "WARN");
    return null;
  }

  testBtn.disabled = true;
  executeBtn.disabled = true;
  testBtn.textContent = "查詢中...";
  notice.textContent = `${sourceText}中...`;
  addLog(`${sourceText}中，機器人 ID：${robotId}，日期：${queryDateInput.value || "今日"}`);

  try {
    const settings = getSettings();
    const response = await fetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        date: queryDateInput.value,
        appId: settings.appId,
        appSecret: settings.appSecret,
        appCode: settings.appCode
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "查詢失敗");

    renderStats(robotId, data);
    notice.textContent =
      data.partialMileageTasks > 0
        ? `查詢完成。有 ${data.partialMileageTasks} 筆任務跨日，里程只計算當日開始的任務。`
        : "查詢完成。";
    addLog(`${sourceText}完成，累計任務總數：${totalTasksFromData(data)}，當日異常任務數：${Number(data.canceledTaskCount ?? 0)}`);
    return data;
  } catch (err) {
    notice.textContent = err.message;
    resetResults();
    if (sourceText.includes("排程")) setScheduleStatus("warning", "排程異常：查詢失敗");
    addLog(`${sourceText}失敗：${err.message}`, "ERROR");
    return null;
  } finally {
    testBtn.disabled = false;
    executeBtn.disabled = false;
    testBtn.textContent = "查詢統計";
  }
}

async function verifyRobotIdExists(robotId) {
  const settings = getSettings();
  const response = await fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      robotId,
      date: queryDateInput.value,
      appId: settings.appId,
      appSecret: settings.appSecret,
      appCode: settings.appCode
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "查詢機器人 ID 失敗");
  if (!data || data.robotId !== robotId) throw new Error("查詢結果與機器人 ID 不一致");
  return data;
}

function renderStats(robotId, data) {
  const totalTasks = Number(data.taskCount ?? 0);
  const completedTasks = Number(data.completedTaskCount ?? Math.max(0, totalTasks - Number(data.canceledTaskCount ?? 0)));
  const failedTasks = Number(data.canceledTaskCount ?? 0);

  robotInput.value = robotId;
  runTimeValue.value = formatHours(data.totalRunMs || 0);
  distanceValue.value = formatDistance(data.totalMileage, data.mileageUnit, data.totalMileageKm);
  taskCountValue.value = String(totalTasks);
  completedTaskCountValue.value = String(completedTasks);
  if (callCountValue) callCountValue.value = String(getCallCount(completedTasks, getActiveCallThreshold()));
  failedTaskCountValue.value = String(failedTasks);
  totalMileageValue.value = formatDistance(data.machineTotalMileage, data.mileageUnit, data.machineTotalMileageKm);
  totalHoursValue.value = formatHours(data.machineTotalRunMs);
  dateLabel.textContent = `日期：${data.date || "未知"}`;
  timezoneLabel.textContent = `時區：${data.timezone || "未知"}`;
}

function legacyScheduleNextRun() {
  if (scheduleTimer) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }

  const rule = getRule();
  const nextRun = getNextRun(rule);
  if (!nextRun || !rule.robotId) {
    notice.textContent = "排程資料不完整，請重新確認新增排程。";
    setScheduleStatus("warning", "排程異常：資料不完整");
    addLog("排程資料不完整，無法安排下次執行", "WARN");
    return;
  }

  const delayMs = Math.max(0, nextRun.getTime() - Date.now());
  scheduleTimer = setTimeout(async () => {
    queryDateInput.value = formatDate(new Date());
    const data = await queryStats(rule.robotId, "排程查詢");
    if (data) {
      const results = await sendScheduleNotifications(rule, data);
      notice.textContent = formatNotificationResult(results);
      setScheduleStatus(results.some((item) => !item.ok) ? "warning" : "ok", results.some((item) => !item.ok) ? "排程異常：通知失敗" : "排程正常");
      addLog(notice.textContent, results.some((item) => !item.ok) ? "WARN" : "INFO");
    }
    if (scheduleEnabled) scheduleNextRun();
  }, delayMs);

  notice.textContent = `排程已啟用，下次執行：${formatDateTime(nextRun)}。`;
  setScheduleStatus("ok", `排程正常：${formatDateTime(nextRun)}`);
  addLog(`排程下次執行：${formatDateTime(nextRun)}`);
}

async function sendScheduleNotifications(rule, data) {
  const jobs = [];
  if (isLineReady(rule)) {
    jobs.push(sendScheduleLine(rule, data).then(
      () => ({ channel: "LINE", ok: true }),
      (err) => ({ channel: "LINE", ok: false, error: err.message })
    ));
  }
  if (isEmailReady(rule)) {
    jobs.push(sendScheduleEmail(rule, data).then(
      () => ({ channel: "Email", ok: true }),
      (err) => ({ channel: "Email", ok: false, error: err.message })
    ));
  }
  return Promise.all(jobs);
}

function formatNotificationResult(results) {
  if (!results.length) return "排程查詢完成，但尚未啟用通知。";
  const ok = results.filter((item) => item.ok).map((item) => item.channel);
  const failed = results.filter((item) => !item.ok).map((item) => `${item.channel} 失敗：${item.error}`);
  if (!failed.length) return `排程查詢完成，已寄出 ${ok.join("、")} 通知。`;
  if (!ok.length) return `排程查詢完成，但通知寄送失敗：${failed.join("；")}`;
  return `排程查詢完成，已寄出 ${ok.join("、")}；${failed.join("；")}`;
}

async function sendScheduleLine(rule, data) {
  return sendLineMessage(rule, buildNotificationBody(data, rule));
}

async function sendLineMessage(rule, text) {
  const response = await fetch("/api/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channelId: rule.lineChannelId,
      channelSecret: rule.lineChannelSecret,
      to: rule.lineTo,
      text
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "LINE 寄送失敗");
}

async function sendScheduleEmail(rule, data) {
  return sendEmailMessage(rule, "每日 AMR 統計", buildNotificationBody(data, rule));
}

async function sendEmailMessage(rule, subject, text) {
  const response = await fetch("/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: rule.emailTo,
      subject,
      text,
      smtp: {
        host: rule.smtpHost,
        port: Number(rule.smtpPort || 587),
        secure: rule.smtpSecure,
        user: rule.smtpUser,
        pass: rule.smtpPass,
        from: rule.smtpFrom || rule.smtpUser
      }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Email 寄送失敗");
}

function buildNotificationBody(data, rule = defaultRule()) {
  const totalTasks = Number(data.taskCount ?? 0);
  const completedTasks = Number(data.completedTaskCount ?? Math.max(0, totalTasks - Number(data.canceledTaskCount ?? 0)));
  const failedTasks = Number(data.canceledTaskCount ?? 0);

  return [
    "每日 AMR 統計",
    `日期：${data.date || ""}`,
    `機器人 ID：${data.robotId || ""}`,
    "",
    `累計任務總數：${totalTasks}`,
    `當日完成任務數：${completedTasks}`,
    rule.showCallCount === false ? null : `當日叫車次數：${getCallCount(completedTasks, rule.callThreshold)}`,
    `當日異常任務數：${failedTasks}`,
    "",
    `累計運行時間：${formatHourNumber(data.machineTotalRunMs)} H`,
    `當日運行時間：${formatHourNumber(data.totalRunMs || 0)} H`,
    "",
    `累計里程：${formatKmNumber(data.machineTotalMileage, data.mileageUnit, data.machineTotalMileageKm)} km`,
    `當日任務里程：${formatKmNumber(data.totalMileage, data.mileageUnit, data.totalMileageKm)} km`
  ].filter((line) => line !== null).join("\n");
}

function legacyStopSchedule() {
  scheduleEnabled = false;
  if (scheduleTimer) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }
}

function getNextRun(ruleOrTime) {
  const rule = typeof ruleOrTime === "object" && ruleOrTime !== null ? ruleOrTime : { time: ruleOrTime };
  const timeText = rule.time;
  const parts = String(timeText || "").split(":");
  if (parts.length < 2) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;

  const next = new Date();
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  if (rule.skipNationalHolidays) {
    while (isNationalHoliday(next)) {
      next.setDate(next.getDate() + 1);
      next.setHours(hours, minutes, 0, 0);
    }
  }
  return next;
}

function isNationalHoliday(date) {
  return nationalHolidayDates.has(formatDate(date));
}

async function ensureNationalHolidayData(rules) {
  const years = getRequiredHolidayYears(rules);
  if (!years.length) return;
  const missingYears = years.filter((year) => !nationalHolidayYears.has(year));
  if (!missingYears.length) return;

  const response = await fetch(`/api/national-holidays?years=${missingYears.join(",")}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "讀取政府國定假日失敗");
  mergeHolidayData(Array.isArray(payload.holidays) ? payload.holidays : [], payload.fetchedAt || "");
  persistHolidayCache();

  const stillMissing = missingYears.filter((year) => !nationalHolidayYears.has(year));
  if (stillMissing.length) {
    throw new Error(`政府國定假日資料缺少年份：${stillMissing.join("、")}`);
  }
}

function getRequiredHolidayYears(rules) {
  const years = new Set();
  for (const rule of rules) {
    if (!rule.skipNationalHolidays) continue;
    const candidate = getNextRun({ ...rule, skipNationalHolidays: false });
    if (!candidate) continue;
    years.add(candidate.getFullYear());
  }
  return [...years].sort((a, b) => a - b);
}

function mergeHolidayData(holidays, fetchedAt = "") {
  for (const item of holidays) {
    const date = typeof item === "string" ? item : item?.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) continue;
    nationalHolidayDates.add(date);
    nationalHolidayYears.add(Number(date.slice(0, 4)));
  }
  if (fetchedAt) nationalHolidayFetchedAt = fetchedAt;
}

function persistHolidayCache() {
  localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify({
    fetchedAt: nationalHolidayFetchedAt,
    holidays: [...nationalHolidayDates].sort().map((date) => ({ date }))
  }));
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateTime(date) {
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function loadSettings() {
  const data = getSettings();
  appIdInput.value = data.appId || "";
  appSecretInput.value = data.appSecret || "";
  appCodeInput.value = data.appCode || "";
}

function legacySaveRule(message) {
  const payload = readRuleForm();
  localStorage.setItem(RULES_KEY, JSON.stringify(payload));
  if (scheduleEnabled) scheduleNextRun();
  notice.textContent = message;
  addLog(message);
}

function initQueryDate() {
  queryDateInput.value = formatDate(new Date());
}

function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { appId: "", appSecret: "", appCode: "" };
    const data = JSON.parse(raw);
    return {
      appId: typeof data.appId === "string" ? data.appId : "",
      appSecret: typeof data.appSecret === "string" ? data.appSecret : "",
      appCode: typeof data.appCode === "string" ? data.appCode : ""
    };
  } catch {
    return { appId: "", appSecret: "", appCode: "" };
  }
}

function legacyLoadRules() {
  const data = getRule();
  ruleTime.value = data.time || "";
  ruleRobotId.value = data.robotId || "";
  lineEnabled.checked = data.lineEnabled;
  emailEnabled.checked = data.emailEnabled;
  lineChannelId.value = data.lineChannelId || "";
  lineChannelSecret.value = data.lineChannelSecret || "";
  if (lineTestTo) lineTestTo.value = data.lineTestTo || "";
  lineTo.value = data.lineTo || "";
  emailTo.value = data.emailTo || "";
  smtpHost.value = data.smtpHost || "";
  smtpPort.value = data.smtpPort || "587";
  smtpFrom.value = data.smtpFrom || "";
  smtpUser.value = data.smtpUser || "";
  smtpPass.value = data.smtpPass || "";
  smtpSecure.value = data.smtpSecure ? "true" : "false";
}

function loadLineWebhookUrl() {
  const saved = localStorage.getItem(LINE_WEBHOOK_KEY);
  if (saved) lineWebhookPath.value = saved;
}

function loadLogExportPath() {
  logExportPath.value = localStorage.getItem(LOG_PATH_KEY) || "";
  renderLogs();
}

function loadHolidayCache() {
  try {
    const raw = localStorage.getItem(HOLIDAY_CACHE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const holidays = Array.isArray(data.holidays) ? data.holidays : [];
    mergeHolidayData(holidays, data.fetchedAt || "");
  } catch {
    localStorage.removeItem(HOLIDAY_CACHE_KEY);
  }
}

function legacyGetRule() {
  try {
    const raw = [RULES_KEY, ...LEGACY_RULES_KEYS].map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return defaultRule();
    const data = JSON.parse(raw);
    return {
      ...defaultRule(),
      time: typeof data.time === "string" ? data.time : "",
      robotId: typeof data.robotId === "string" ? data.robotId : "",
      lineEnabled: typeof data.lineEnabled === "boolean" ? data.lineEnabled : true,
      emailEnabled: typeof data.emailEnabled === "boolean" ? data.emailEnabled : true,
      lineChannelId: typeof data.lineChannelId === "string" ? data.lineChannelId : "",
      lineChannelSecret: typeof data.lineChannelSecret === "string" ? data.lineChannelSecret : "",
      lineTestTo: typeof data.lineTestTo === "string" ? data.lineTestTo : "",
      lineTo: typeof data.lineTo === "string" ? data.lineTo : "",
      skipNationalHolidays: typeof data.skipNationalHolidays === "boolean" ? data.skipNationalHolidays : false,
      emailTo: typeof data.emailTo === "string" ? data.emailTo : "",
      smtpHost: typeof data.smtpHost === "string" ? data.smtpHost : "",
      smtpPort: typeof data.smtpPort === "string" ? data.smtpPort : "587",
      smtpFrom: typeof data.smtpFrom === "string" ? data.smtpFrom : "",
      smtpUser: typeof data.smtpUser === "string" ? data.smtpUser : "",
      smtpPass: typeof data.smtpPass === "string" ? data.smtpPass : "",
      smtpSecure: Boolean(data.smtpSecure)
    };
  } catch {
    return defaultRule();
  }
}

function legacyReadRuleForm() {
  return {
    time: ruleTime.value || "",
    robotId: ruleRobotId.value.trim(),
    lineEnabled: lineEnabled.checked,
    emailEnabled: emailEnabled.checked,
    lineChannelId: lineChannelId.value.trim(),
    lineChannelSecret: lineChannelSecret.value.trim(),
    lineTestTo: lineTestTo?.value.trim() || "",
    lineTo: lineTo.value.trim(),
    skipNationalHolidays: scheduleSkipNationalHolidays.checked,
    emailTo: emailTo.value.trim(),
    smtpHost: smtpHost.value.trim(),
    smtpPort: smtpPort.value.trim(),
    smtpFrom: smtpFrom.value.trim(),
    smtpUser: smtpUser.value.trim(),
    smtpPass: smtpPass.value,
    smtpSecure: smtpSecure.value === "true"
  };
}

function legacyDefaultRule() {
  return {
    time: "",
    robotId: "",
    lineEnabled: true,
    emailEnabled: true,
    lineChannelId: "",
    lineChannelSecret: "",
    lineTestTo: "",
    lineTo: "",
    skipNationalHolidays: false,
    emailTo: "",
    smtpHost: "",
    smtpPort: "587",
    smtpFrom: "",
    smtpUser: "",
    smtpPass: "",
    smtpSecure: false
  };
}

function hasAnyNotificationTarget(rule) {
  return isLineReady(rule) || isEmailReady(rule);
}

function isLineReady(rule) {
  return Boolean(rule.lineEnabled && rule.lineChannelId && rule.lineChannelSecret && rule.lineTo);
}

function isEmailReady(rule) {
  return Boolean(rule.emailEnabled && rule.emailTo);
}

function validateLineRule(rule) {
  if (!rule.lineEnabled) return "LINE 目前未啟用。";
  if (!rule.lineChannelId || !rule.lineChannelSecret) return "請填 LINE Channel ID 和 Channel secret。";
  if (!rule.lineTo) return "請填 LINE 目標 ID。";
  if (!/^[UCR][0-9a-f]{32}$/i.test(rule.lineTo)) {
    return "LINE 目標 ID 必須是 U...、C... 或 R... 開頭的實際 ID，不能填名稱或暱稱。";
  }
  return "";
}

function validateEmailRule(rule) {
  if (!rule.emailEnabled) return "Email 目前未啟用。";
  if (!rule.emailTo) return "請填收件者 Email。";
  if (!rule.smtpHost) return "請填 SMTP 主機。";
  if (!rule.smtpUser) return "請填 SMTP 帳號。";
  if (!rule.smtpPass) return "請填 SMTP 密碼 / App Password。";
  return "";
}

function setScheduleStatus(state, text) {
  scheduleState = state;
  scheduleStatus.classList.remove("status-ok", "status-warning", "status-off");
  scheduleStatus.classList.add(state === "ok" ? "status-ok" : state === "warning" ? "status-warning" : "status-off");
  scheduleStatusText.textContent = text;
  updateScheduleToggleButton();
}

function updateScheduleToggleButton() {
  executeBtn.textContent = scheduleEnabled ? "停用排程" : "啟用排程";
  executeBtn.classList.toggle("schedule-toggle-start", !scheduleEnabled);
  executeBtn.classList.toggle("schedule-toggle-stop", scheduleEnabled);
}

async function initVersionInfo() {
  updateVersionInfo({});
  if (!window.amrDesktop?.getVersionInfo) return;
  try {
    updateVersionInfo(await window.amrDesktop.getVersionInfo());
  } catch {
    updateVersionInfo({});
  }
}

function updateVersionInfo(info = {}) {
  if (currentVersion) currentVersion.textContent = info.currentVersion ? `v${info.currentVersion}` : "--";
  if (latestVersion) latestVersion.textContent = info.latestVersion ? `v${info.latestVersion}` : "檢查中";
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((btn) => {
        const isActive = btn === tab;
        btn.classList.toggle("active", isActive);
        if (isActive) btn.setAttribute("aria-current", "page");
        else btn.removeAttribute("aria-current");
      });
      panels.forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${target}`));
    });
  });
}

function legacyRenderLineSources(sources) {
  if (!sources.length) {
    lineSources.innerHTML = "";
    return;
  }
  lineSources.innerHTML = sources.map((source) => {
    const label = source.type === "group" ? "群組" : source.type === "room" ? "聊天室" : "個人";
    return `
      <button class="source-row" type="button" data-id="${escapeHtml(source.id)}">
        <span>${label}</span>
        <strong>${escapeHtml(source.id)}</strong>
      </button>
    `;
  }).join("");
  lineSources.querySelectorAll(".source-row").forEach((button) => {
    button.addEventListener("click", () => {
      if (lineTo) lineTo.value = button.dataset.id || "";
      if (lineTestTo) lineTestTo.value = button.dataset.id || "";
      notice.textContent = "已填入 LINE 目標 ID。";
      addLog("已填入 LINE 目標 ID");
    });
  });
}

function addLog(message, level = "INFO") {
  const logs = getLogs();
  logs.push({
    time: formatLogTime(new Date()),
    level,
    message: String(message || "")
  });
  const trimmed = logs.slice(-1000);
  localStorage.setItem(LOG_KEY, JSON.stringify(trimmed));
  renderLogs(trimmed);
}

function getLogs() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.filter((item) => item && item.time && item.message) : [];
  } catch {
    return [];
  }
}

function renderLogs(logs = getLogs()) {
  logView.textContent = logs.length ? logs.map(formatLogEntry).join("\n") : "尚無 Log";
  logView.scrollTop = logView.scrollHeight;
}

function getLogText() {
  const logs = getLogs();
  return logs.length ? logs.map(formatLogEntry).join("\r\n") : "尚無 Log";
}

function formatLogEntry(item) {
  return `[${item.time}] [${item.level || "INFO"}] ${item.message}`;
}

function formatLogTime(date) {
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function totalTasksFromData(data) {
  return Number(data.taskCount ?? 0);
}

function resetResults() {
  runTimeValue.value = EMPTY_VALUE;
  distanceValue.value = EMPTY_VALUE;
  taskCountValue.value = EMPTY_VALUE;
  completedTaskCountValue.value = EMPTY_VALUE;
  if (callCountValue) callCountValue.value = EMPTY_VALUE;
  failedTaskCountValue.value = EMPTY_VALUE;
  totalMileageValue.value = EMPTY_VALUE;
  totalHoursValue.value = EMPTY_VALUE;
  dateLabel.textContent = "日期：尚未查詢";
  timezoneLabel.textContent = "時區：尚未查詢";
}

function formatDistance(total, unit, kmValue) {
  if (!Number.isFinite(total)) return EMPTY_VALUE;
  if (unit === "m" && Number.isFinite(kmValue)) {
    return `${total.toFixed(2)} m (${kmValue.toFixed(3)} km)`;
  }
  return `${total.toFixed(2)} ${unit || ""}`.trim();
}

function getCallCount(completedTasks, threshold = 30) {
  return Math.max(0, Number(completedTasks || 0) - normalizeCallThreshold(threshold));
}

function normalizeCallThreshold(value) {
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0) return 30;
  return Math.floor(threshold);
}

function getActiveCallThreshold() {
  const selected = getRules().find((rule) => rule.id === selectedScheduleId) || readRuleForm();
  return selected.callThreshold;
}

function formatHours(ms) {
  if (!Number.isFinite(ms)) return EMPTY_VALUE;
  return `${formatHourNumber(ms)} H`;
}

function formatHourNumber(ms) {
  if (!Number.isFinite(ms)) return "0.00";
  return (Math.max(0, ms) / 3600000).toFixed(2);
}

function formatKmNumber(total, unit, kmValue) {
  if (unit === "m" && Number.isFinite(kmValue)) return kmValue.toFixed(3);
  if (!Number.isFinite(total)) return "0.000";
  return Number(total).toFixed(3);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function getRules() {
  try {
    const raw = [RULES_KEY, ...LEGACY_RULES_KEYS].map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : [data];
    return list.map(normalizeRule).filter((rule) => rule.time || rule.robotId || rule.lineTo || rule.emailTo);
  } catch {
    return [];
  }
}

function getRule() {
  return getRules()[0] || defaultRule();
}

function loadRules() {
  const rules = getRules();
  const first = rules[0] || defaultRule();
  selectedScheduleId = first.id || "";
  writeRuleForm(first);
  renderScheduleRules(rules);
}

function readRuleForm() {
  return normalizeRule({
    id: selectedScheduleId || createRuleId(),
    name: scheduleName.value.trim(),
    time: ruleTime.value || "",
    robotId: ruleRobotId.value.trim(),
    lineEnabled: lineEnabled.checked,
    emailEnabled: emailEnabled.checked,
    lineChannelId: lineChannelId.value.trim(),
    lineChannelSecret: lineChannelSecret.value.trim(),
    lineTestTo: lineTestTo?.value.trim() || "",
    lineTo: scheduleLineTo.value.trim(),
    callThreshold: normalizeCallThreshold(scheduleCallThreshold.value),
    showCallCount: scheduleShowCallCount.checked,
    skipNationalHolidays: scheduleSkipNationalHolidays.checked,
    emailTo: emailTo.value.trim(),
    smtpHost: smtpHost.value.trim(),
    smtpPort: smtpPort.value.trim(),
    smtpFrom: smtpFrom.value.trim(),
    smtpUser: smtpUser.value.trim(),
    smtpPass: smtpPass.value,
    smtpSecure: smtpSecure.value === "true"
  });
}

function writeRuleForm(rule) {
  const normalized = normalizeRule(rule);
  scheduleName.value = normalized.name || "";
  ruleTime.value = normalized.time || "";
  ruleRobotId.value = normalized.robotId || "";
  scheduleLineTo.value = normalized.lineTo || "";
  scheduleCallThreshold.value = String(normalized.callThreshold);
  scheduleShowCallCount.checked = normalized.showCallCount !== false;
  scheduleSkipNationalHolidays.checked = normalized.skipNationalHolidays === true;
  syncCallThresholdState();
  lineEnabled.checked = normalized.lineEnabled;
  emailEnabled.checked = normalized.emailEnabled;
  lineChannelId.value = normalized.lineChannelId || "";
  lineChannelSecret.value = normalized.lineChannelSecret || "";
  if (lineTestTo) lineTestTo.value = normalized.lineTestTo || "";
  if (lineTo) lineTo.value = normalized.lineTo || "";
  emailTo.value = normalized.emailTo || "";
  smtpHost.value = normalized.smtpHost || "";
  smtpPort.value = normalized.smtpPort || "587";
  smtpFrom.value = normalized.smtpFrom || "";
  smtpUser.value = normalized.smtpUser || "";
  smtpPass.value = normalized.smtpPass || "";
  smtpSecure.value = normalized.smtpSecure ? "true" : "false";
}

function defaultRule() {
  return {
    id: createRuleId(),
    name: "",
    time: "",
    robotId: "",
    lineEnabled: true,
    emailEnabled: true,
    lineChannelId: "",
    lineChannelSecret: "",
    lineTestTo: "",
    lineTo: "",
    callThreshold: 30,
    showCallCount: true,
    skipNationalHolidays: false,
    emailTo: "",
    smtpHost: "",
    smtpPort: "587",
    smtpFrom: "",
    smtpUser: "",
    smtpPass: "",
    smtpSecure: false
  };
}

function normalizeRule(data = {}) {
  const base = defaultRule();
  return {
    ...base,
    id: typeof data.id === "string" && data.id ? data.id : base.id,
    name: typeof data.name === "string" ? data.name : "",
    time: typeof data.time === "string" ? data.time : "",
    robotId: typeof data.robotId === "string" ? data.robotId : "",
    lineEnabled: typeof data.lineEnabled === "boolean" ? data.lineEnabled : true,
    emailEnabled: typeof data.emailEnabled === "boolean" ? data.emailEnabled : true,
    lineChannelId: typeof data.lineChannelId === "string" ? data.lineChannelId : "",
    lineChannelSecret: typeof data.lineChannelSecret === "string" ? data.lineChannelSecret : "",
    lineTestTo: typeof data.lineTestTo === "string" ? data.lineTestTo : "",
    lineTo: typeof data.lineTo === "string" ? data.lineTo : "",
    callThreshold: normalizeCallThreshold(data.callThreshold ?? data.callCountThreshold ?? 30),
    showCallCount: typeof data.showCallCount === "boolean" ? data.showCallCount : true,
    skipNationalHolidays: typeof data.skipNationalHolidays === "boolean" ? data.skipNationalHolidays : false,
    emailTo: typeof data.emailTo === "string" ? data.emailTo : "",
    smtpHost: typeof data.smtpHost === "string" ? data.smtpHost : "",
    smtpPort: typeof data.smtpPort === "string" ? data.smtpPort : "587",
    smtpFrom: typeof data.smtpFrom === "string" ? data.smtpFrom : "",
    smtpUser: typeof data.smtpUser === "string" ? data.smtpUser : "",
    smtpPass: typeof data.smtpPass === "string" ? data.smtpPass : "",
    smtpSecure: Boolean(data.smtpSecure)
  };
}

function createRuleId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function persistRules(rules) {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules.map(normalizeRule)));
  LEGACY_RULES_KEYS.forEach((key) => localStorage.removeItem(key));
  renderScheduleRules(rules);
}

function saveRule(message) {
  saveCurrentScheduleRule(message);
}

async function addScheduleRule() {
  const rule = { ...readRuleForm(), id: createRuleId() };
  const invalid = validateScheduleRule(rule);
  if (invalid) {
    notice.textContent = invalid;
    addLog(`新增排程失敗：${invalid}`, "WARN");
    return;
  }
  addScheduleRuleBtn.disabled = true;
  notice.textContent = "正在檢查機器人 ID...";
  try {
    await verifyRobotIdExists(rule.robotId);
  } catch (err) {
    notice.textContent = `新增排程失敗：查不到機器人 ID「${rule.robotId}」。${err.message}`;
    addLog(notice.textContent, "WARN");
    addScheduleRuleBtn.disabled = false;
    return;
  }
  const rules = [...getRules(), rule];
  selectedScheduleId = rule.id;
  persistRules(rules);
  writeRuleForm(rule);
  if (scheduleEnabled) scheduleAllRuns(rules);
  notice.textContent = "排程已新增。";
  addLog(`排程已新增：${getRuleLabel(rule)}`);
  addScheduleRuleBtn.disabled = false;
}

function saveCurrentScheduleRule(message) {
  const rule = readRuleForm();
  const invalid = validateScheduleRule(rule);
  if (invalid) {
    notice.textContent = invalid;
    addLog(`儲存排程失敗：${invalid}`, "WARN");
    return;
  }
  const rules = getRules();
  const index = selectedScheduleId ? rules.findIndex((item) => item.id === selectedScheduleId) : -1;
  if (index >= 0) {
    rules[index] = { ...rule, id: selectedScheduleId };
  } else {
    rules.push(rule);
    selectedScheduleId = rule.id;
  }
  persistRules(rules);
  writeRuleForm(rules.find((item) => item.id === selectedScheduleId) || rule);
  if (scheduleEnabled) scheduleAllRuns(rules);
  notice.textContent = message;
  addLog(message);
}

function saveNotificationSettings() {
  const current = readRuleForm();
  const rules = getRules().map((rule) => ({
    ...rule,
    lineEnabled: current.lineEnabled,
    emailEnabled: current.emailEnabled,
    lineChannelId: current.lineChannelId,
    lineChannelSecret: current.lineChannelSecret,
    lineTestTo: current.lineTestTo,
    emailTo: current.emailTo,
    smtpHost: current.smtpHost,
    smtpPort: current.smtpPort,
    smtpFrom: current.smtpFrom,
    smtpUser: current.smtpUser,
    smtpPass: current.smtpPass,
    smtpSecure: current.smtpSecure
  }));
  persistRules(rules.length ? rules : [current]);
  notice.textContent = "通知設定已儲存。";
  addLog("通知設定已儲存");
}

function ensureSavedScheduleRules() {
  const rules = getRules();
  if (rules.length) return rules;
  const rule = readRuleForm();
  persistRules([rule]);
  selectedScheduleId = rule.id;
  return [rule];
}

function validateScheduleRule(rule) {
  if (!rule.robotId) return "請先填入機器人 ID。";
  if (!rule.time) return "請先選擇查詢時間。";
  if (!hasAnyNotificationTarget(rule)) return "請至少啟用並設定 LINE 或 Email 通知。";
  if (rule.lineEnabled) return validateLineRule(rule);
  if (rule.emailEnabled) return validateEmailRule(rule);
  return "";
}

function renderScheduleRules(rules = getRules()) {
  if (!scheduleRulesList) return;
  if (!rules.length) {
    scheduleRulesList.innerHTML = `<p class="schedule-empty">尚未新增排程。</p>`;
    return;
  }
  scheduleRulesList.innerHTML = rules.map((rule) => `
    <div class="schedule-row ${rule.id === selectedScheduleId ? "active" : ""}" data-id="${escapeHtml(rule.id)}">
      <div>
        <h3>${escapeHtml(getRuleLabel(rule))}</h3>
        <p>${escapeHtml(rule.time || "--:--")} / ${escapeHtml(rule.robotId || "未設定機器人")} / LINE: ${escapeHtml(rule.lineTo || "未設定 LINE 目標")}</p>
      </div>
      <div class="schedule-meta">
        <span ${rule.showCallCount === false ? "hidden" : ""}>叫車門檻：${escapeHtml(rule.callThreshold)}</span>
        <span>${rule.showCallCount === false ? "輸出不顯示叫車次數" : "輸出顯示叫車次數"}</span>
        <span>${rule.skipNationalHolidays ? "跳過國定假日" : "國定假日照常通知"}</span>
      </div>
      <div class="schedule-row-actions">
        <button type="button" class="ghost" data-action="edit">編輯</button>
        <button type="button" class="ghost" data-action="duplicate">複製</button>
        <button type="button" class="ghost" data-action="delete">刪除</button>
      </div>
    </div>
  `).join("");
  scheduleRulesList.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleScheduleListAction(button.closest(".schedule-row")?.dataset.id, button.dataset.action));
  });
}

function openScheduleEditModal(rule) {
  const normalized = normalizeRule(rule);
  editingScheduleId = normalized.id;
  editScheduleName.value = normalized.name || "";
  editRuleTime.value = normalized.time || "";
  editRuleRobotId.value = normalized.robotId || "";
  editScheduleLineTo.value = normalized.lineTo || "";
  editScheduleCallThreshold.value = String(normalized.callThreshold);
  editScheduleShowCallCount.checked = normalized.showCallCount !== false;
  editScheduleSkipNationalHolidays.checked = normalized.skipNationalHolidays === true;
  syncEditCallThresholdState();
  scheduleEditModal.hidden = false;
  editScheduleName.focus();
}

function closeScheduleEditModal() {
  scheduleEditModal.hidden = true;
  editingScheduleId = "";
}

function syncCallThresholdState() {
  scheduleCallThreshold.disabled = !scheduleShowCallCount.checked;
}

function syncEditCallThresholdState() {
  editScheduleCallThreshold.disabled = !editScheduleShowCallCount.checked;
}

function readScheduleEditForm(originalRule) {
  return normalizeRule({
    ...originalRule,
    name: editScheduleName.value.trim(),
    time: editRuleTime.value || "",
    robotId: editRuleRobotId.value.trim(),
    lineTo: editScheduleLineTo.value.trim(),
    callThreshold: normalizeCallThreshold(editScheduleCallThreshold.value),
    showCallCount: editScheduleShowCallCount.checked,
    skipNationalHolidays: editScheduleSkipNationalHolidays.checked
  });
}

function saveScheduleEdit() {
  const rules = getRules();
  const index = rules.findIndex((item) => item.id === editingScheduleId);
  if (index < 0) {
    closeScheduleEditModal();
    return;
  }
  const updated = readScheduleEditForm(rules[index]);
  const invalid = validateScheduleRule(updated);
  if (invalid) {
    notice.textContent = invalid;
    addLog(`編輯排程失敗：${invalid}`, "WARN");
    return;
  }
  rules[index] = updated;
  selectedScheduleId = updated.id;
  persistRules(rules);
  if (scheduleEnabled) scheduleAllRuns(rules);
  closeScheduleEditModal();
  notice.textContent = "排程已更新。";
  addLog(`排程已更新：${getRuleLabel(updated)}`);
}

function handleScheduleListAction(id, action) {
  const rules = getRules();
  const rule = rules.find((item) => item.id === id);
  if (!rule) return;
  if (action === "edit") {
    openScheduleEditModal(rule);
    return;
    selectedScheduleId = rule.id;
    writeRuleForm(rule);
    renderScheduleRules(rules);
    notice.textContent = `正在編輯：${getRuleLabel(rule)}`;
    return;
  }
  if (action === "duplicate") {
    const copy = { ...rule, id: createRuleId(), name: `${rule.name || getRuleLabel(rule)} 複製` };
    selectedScheduleId = copy.id;
    persistRules([...rules, copy]);
    writeRuleForm(copy);
    notice.textContent = "排程已複製。";
    return;
  }
  if (action === "delete") {
    const nextRules = rules.filter((item) => item.id !== id);
    selectedScheduleId = nextRules[0]?.id || "";
    persistRules(nextRules);
    writeRuleForm(nextRules[0] || defaultRule());
    if (scheduleEnabled) scheduleAllRuns(nextRules);
    notice.textContent = "排程已刪除。";
  }
}

function getRuleLabel(rule) {
  return rule.name || `${rule.robotId || "未命名排程"} ${rule.time || ""}`.trim();
}

function stopSchedule() {
  scheduleEnabled = false;
  for (const timer of scheduleTimers.values()) clearTimeout(timer);
  scheduleTimers.clear();
}

function scheduleNextRun() {
  scheduleAllRuns(getRules());
}

async function scheduleAllRuns(rules = getRules()) {
  for (const timer of scheduleTimers.values()) clearTimeout(timer);
  scheduleTimers.clear();

  const validRules = rules.filter((rule) => !validateScheduleRule(rule));
  if (!validRules.length) {
    setScheduleStatus("warning", "排程異常：沒有可執行的排程");
    notice.textContent = "沒有可執行的排程。";
    return;
  }

  try {
    await ensureNationalHolidayData(validRules);
  } catch (err) {
    scheduleEnabled = false;
    const message = `排程異常：${err.message}`;
    notice.textContent = message;
    setScheduleStatus("warning", message);
    addLog(message, "ERROR");
    return;
  }

  validRules.forEach(scheduleRuleNextRun);
  const nextItems = validRules
    .map((rule) => ({ rule, nextRun: getNextRun(rule) }))
    .filter((item) => item.nextRun)
    .sort((a, b) => a.nextRun - b.nextRun);
  const first = nextItems[0];
  const text = first ? `排程已啟用：${validRules.length} 組，下一次 ${getRuleLabel(first.rule)} ${formatDateTime(first.nextRun)}` : `排程已啟用：${validRules.length} 組`;
  notice.textContent = text;
  setScheduleStatus("ok", text);
  addLog(text);
}

function scheduleRuleNextRun(rule) {
  const nextRun = getNextRun(rule);
  if (!nextRun) return;
  const delayMs = Math.max(0, nextRun.getTime() - Date.now());
  const timer = setTimeout(async () => {
    queryDateInput.value = formatDate(new Date());
    const label = `排程查詢 ${getRuleLabel(rule)}`;
    const data = await queryStats(rule.robotId, label);
    if (data) {
      const results = await sendScheduleNotifications(rule, data);
      const resultText = `${getRuleLabel(rule)}：${formatNotificationResult(results)}`;
      notice.textContent = resultText;
      setScheduleStatus(results.some((item) => !item.ok) ? "warning" : "ok", resultText);
      addLog(resultText, results.some((item) => !item.ok) ? "WARN" : "INFO");
    }
    if (scheduleEnabled) scheduleRuleNextRun(rule);
  }, delayMs);
  scheduleTimers.set(rule.id, timer);
}

function renderLineSources(sources) {
  if (!sources.length) {
    lineSources.innerHTML = "";
    return;
  }
  lineSources.innerHTML = sources.map((source) => {
    const label = source.type === "group" ? "群組" : source.type === "room" ? "聊天室" : "使用者";
    return `
      <button class="source-row" type="button" data-id="${escapeHtml(source.id)}">
        <span>${label}</span>
        <strong>${escapeHtml(source.id)}</strong>
      </button>
    `;
  }).join("");
  lineSources.querySelectorAll(".source-row").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id || "";
      if (lineTo) lineTo.value = id;
      if (lineTestTo) lineTestTo.value = id;
      scheduleLineTo.value = id;
      notice.textContent = "已帶入 LINE 目標 ID。";
      addLog("已帶入 LINE 目標 ID");
    });
  });
}
