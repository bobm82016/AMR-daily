import http from "node:http";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import sdkPkg from "@autoxing/robot-js-sdk";

const { AXRobot, AppMode } = sdkPkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

loadDotEnv();

const PORT = Number(process.env.PORT || 5177);
const APP_ID = process.env.APP_ID || "";
const APP_SECRET = process.env.APP_SECRET || "";
const APP_CODE = process.env.APP_CODE || process.env.APPCODE || process.env.APP_CODE_VALUE || "";
const APP_MODE_NAME = (process.env.APP_MODE || "WAN_APP").trim();
const SERVER_URL = process.env.SERVER_URL || "https://apiglobal.autoxing.com";
const WEBSOCKET_URL = process.env.WEBSOCKET_URL || "";
const MILEAGE_UNIT = (process.env.MILEAGE_UNIT || "m").toLowerCase();
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);
const MAX_PAGES = Number(process.env.MAX_PAGES || 100);
const MILEAGE_CONCURRENCY = Number(process.env.MILEAGE_CONCURRENCY || 40);
const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS || 9000);
const TASK_PAGE_TIMEOUT_MS = Number(process.env.TASK_PAGE_TIMEOUT_MS || 2500);
const MILEAGE_REQUEST_TIMEOUT_MS = Number(process.env.MILEAGE_REQUEST_TIMEOUT_MS || 1500);
const TOTAL_STATS_TIMEOUT_MS = Number(process.env.TOTAL_STATS_TIMEOUT_MS || 8000);
const TOTAL_STATS_FALLBACK_TIMEOUT_MS = Number(process.env.TOTAL_STATS_FALLBACK_TIMEOUT_MS || 20000);
const TOTAL_TASK_MAX_PAGES = Number(process.env.TOTAL_TASK_MAX_PAGES || 200);
const STATS_CACHE_TTL_MS = Number(process.env.STATS_CACHE_TTL_MS || 30000);
const TASK_CACHE_TTL_MS = Number(process.env.TASK_CACHE_TTL_MS || 60000);
const MILEAGE_CACHE_TTL_MS = Number(process.env.MILEAGE_CACHE_TTL_MS || 3600000);
const TOTAL_STATS_CACHE_TTL_MS = Number(process.env.TOTAL_STATS_CACHE_TTL_MS || 300000);
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = isTruthy(process.env.SMTP_SECURE);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 10000);
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID || "";
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || "";
const LINE_TO = process.env.LINE_TO || "";
const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_TOKEN_URL = "https://api.line.me/oauth2/v3/token";
const LINE_TIMEOUT_MS = Number(process.env.LINE_TIMEOUT_MS || 10000);
const HOLIDAY_API_URL = process.env.HOLIDAY_API_URL || "https://data.ntpc.gov.tw/api/datasets/308dcd75-6434-45bc-a95f-584da4fed251/json?page=0&size=5000";
const HOLIDAY_CACHE_TTL_MS = Number(process.env.HOLIDAY_CACHE_TTL_MS || 86400000);
const HOLIDAY_TIMEOUT_MS = Number(process.env.HOLIDAY_TIMEOUT_MS || 10000);

const axRobotCache = new Map();
const statsCache = new Map();
const statsInflight = new Map();
const taskListCache = new Map();
const taskListInflight = new Map();
const mileageCache = new Map();
const mileageInflight = new Map();
const totalStatsCache = new Map();
const totalStatsInflight = new Map();
const robotExistsCache = new Map();
const robotExistsInflight = new Map();
let holidayCache = null;
let holidayInflight = null;
const recentLineSources = [];

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      return sendFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html");
    }
    if (req.method === "GET" && req.url === "/app.js") {
      return sendFile(res, path.join(PUBLIC_DIR, "app.js"), "text/javascript");
    }
    if (req.method === "GET" && req.url === "/style.css") {
      return sendFile(res, path.join(PUBLIC_DIR, "style.css"), "text/css");
    }
    if (req.method === "POST" && req.url === "/api/stats") {
      const body = await readJsonBody(req);
      const robotId = String(body.robotId || "").trim();
      const providedAppId = String(body.appId || "").trim();
      const providedAppSecret = String(body.appSecret || "").trim();
      const providedAppCode = String(body.appCode || "").trim();
      const dateStr = String(body.date || "").trim();
      if (!robotId) {
        return sendJson(res, 400, { error: "robotId is required" });
      }
      const appId = providedAppId || APP_ID;
      const appSecret = providedAppSecret || APP_SECRET;
      const appCode = providedAppCode || APP_CODE;
      if (!appId || !appSecret) {
        return sendJson(res, 500, {
          error: "Missing APP_ID or APP_SECRET. Set them in .env or environment variables."
        });
      }

      const { dayStartMs, dayEndMs, dayLabel } = getDayRange(dateStr);
      const nowMs = Date.now();
      const axRobot = await getAxRobot(appId, appSecret, appCode);
      const robotExists = await validateRobotExists(axRobot, robotId, {
        appId,
        appSecret,
        appCode
      });
      if (!robotExists) {
        return sendJson(res, 404, { error: `Robot ID not found: ${robotId}` });
      }
      const {
        taskCount,
        completedTaskCount,
        canceledTaskCount,
        partialMileageTasks,
        totalRunMs,
        totalMileage,
        machineTotalRunMs,
        machineTotalMileage,
        isPartial
      } =
        await fetchDailyStats(robotId, dayStartMs, dayEndMs, nowMs, {
          appId,
          appSecret,
          appCode
        });

      const response = {
        robotId,
        date: dayLabel,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        taskCount,
        completedTaskCount,
        canceledTaskCount,
        partialMileageTasks,
        totalRunMs,
        totalMileage,
        machineTotalRunMs,
        machineTotalMileage,
        isPartial,
        mileageUnit: MILEAGE_UNIT,
        totalMileageKm:
          MILEAGE_UNIT === "m" ? Number((totalMileage / 1000).toFixed(3)) : null,
        machineTotalMileageKm:
          MILEAGE_UNIT === "m" && Number.isFinite(machineTotalMileage)
            ? Number((machineTotalMileage / 1000).toFixed(3))
            : null
      };
      return sendJson(res, 200, response);
    }
    if (req.method === "POST" && req.url === "/api/email") {
      const body = await readJsonBody(req);
      const to = String(body.to || "").trim();
      const subject = String(body.subject || "每日 AMR 統計").trim();
      const text = String(body.text || "").trim();
      const smtp = body.smtp && typeof body.smtp === "object" ? body.smtp : {};

      if (!to) return sendJson(res, 400, { error: "Email recipient is required" });
      if (!text) return sendJson(res, 400, { error: "Email content is required" });

      await sendEmail({
        to,
        subject,
        text,
        smtp: {
          host: String(smtp.host || SMTP_HOST).trim(),
          port: Number(smtp.port || SMTP_PORT),
          secure: smtp.secure === undefined ? SMTP_SECURE : Boolean(smtp.secure),
          user: String(smtp.user || SMTP_USER).trim(),
          pass: String(smtp.pass || SMTP_PASS),
          from: String(smtp.from || SMTP_FROM).trim()
        }
      });
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/api/line") {
      const body = await readJsonBody(req);
      const channelAccessToken = String(body.channelAccessToken || LINE_CHANNEL_ACCESS_TOKEN).trim();
      const channelId = String(body.channelId || LINE_CHANNEL_ID).trim();
      const channelSecret = String(body.channelSecret || LINE_CHANNEL_SECRET).trim();
      const to = String(body.to || LINE_TO).trim();
      const text = String(body.text || "").trim();

      if (!channelAccessToken && (!channelId || !channelSecret)) {
        return sendJson(res, 400, { error: "LINE channel access token or Channel ID/secret is required" });
      }
      if (!to) return sendJson(res, 400, { error: "LINE target ID is required" });
      if (!text) return sendJson(res, 400, { error: "LINE message content is required" });

      await sendLinePush({ channelAccessToken, channelId, channelSecret, to, text });
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/api/line/webhook") {
      const body = await readJsonBody(req);
      const events = Array.isArray(body.events) ? body.events : [];
      for (const event of events) {
        rememberLineSource(event);
      }
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "GET" && req.url === "/api/line/sources") {
      return sendJson(res, 200, { sources: recentLineSources });
    }
    if (req.method === "GET" && req.url.startsWith("/api/national-holidays")) {
      const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const years = String(requestUrl.searchParams.get("years") || "")
        .split(",")
        .map((year) => Number(year.trim()))
        .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100);
      const calendar = await getGovernmentHolidayCalendar();
      const selectedYears = years.length ? years : calendar.years;
      const yearSet = new Set(selectedYears);
      return sendJson(res, 200, {
        ok: true,
        source: calendar.source,
        fetchedAt: calendar.fetchedAt,
        years: selectedYears,
        holidays: calendar.holidays.filter((item) => yearSet.has(Number(item.date.slice(0, 4)))),
        workdays: calendar.workdays.filter((item) => yearSet.has(Number(item.date.slice(0, 4))))
      });
    }
    if (req.method === "POST" && req.url === "/api/log/export") {
      const body = await readJsonBody(req);
      const content = String(body.content || "");
      const requestedDir = String(body.directoryPath || "").trim();
      const exportDir = requestedDir || path.join(__dirname, "logs");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filePath = path.join(exportDir, `amr-log-${timestamp}.txt`);

      await mkdir(exportDir, { recursive: true });
      await writeFile(filePath, content || "尚無 Log", "utf8");
      return sendJson(res, 200, { ok: true, path: filePath });
    }

    res.writeHead(404);
    res.end("Not Found");
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Internal error" });
  }
});

export async function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      console.log(`AMR daily stats server running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (isRunDirectly()) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function getGovernmentHolidayCalendar() {
  const now = Date.now();
  if (holidayCache && now - holidayCache.cachedAt < HOLIDAY_CACHE_TTL_MS) {
    return holidayCache;
  }
  if (!holidayInflight) {
    holidayInflight = fetchGovernmentHolidayCalendar()
      .then((calendar) => {
        holidayCache = { ...calendar, cachedAt: Date.now() };
        return holidayCache;
      })
      .finally(() => {
        holidayInflight = null;
      });
  }
  return holidayInflight;
}

async function fetchGovernmentHolidayCalendar() {
  const response = await fetchWithTimeout(HOLIDAY_API_URL, HOLIDAY_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`政府行事曆 API 回應 ${response.status}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("政府行事曆 API 格式不正確");
  const holidays = rows
    .map(normalizeHolidayRow)
    .filter((item) => item && item.isHoliday && !isWeekendOnlyHoliday(item))
    .map(({ isHoliday, ...item }) => item)
    .sort((a, b) => a.date.localeCompare(b.date));
  const workdays = rows
    .map(normalizeHolidayRow)
    .filter((item) => item && !item.isHoliday && isWeekendDate(item.date))
    .map(({ isHoliday, ...item }) => item)
    .sort((a, b) => a.date.localeCompare(b.date));
  const years = [...new Set([...holidays, ...workdays].map((item) => Number(item.date.slice(0, 4))))].sort((a, b) => a - b);
  if (!holidays.length) throw new Error("政府行事曆 API 未回傳假日資料");
  return {
    source: HOLIDAY_API_URL,
    fetchedAt: new Date().toISOString(),
    years,
    holidays,
    workdays
  };
}

function normalizeHolidayRow(row) {
  if (!row || typeof row !== "object") return null;
  const date = normalizeHolidayDate(row.date ?? row.Date ?? row.DATE);
  if (!date) return null;
  return {
    date,
    name: String(row.name ?? row.Name ?? "").trim(),
    category: String(row.holidaycategory ?? row.holidayCategory ?? row.category ?? "").trim(),
    description: String(row.description ?? row.Description ?? "").trim(),
    isHoliday: isHolidayValue(row.isholiday ?? row.isHoliday ?? row.IsHoliday)
  };
}

function normalizeHolidayDate(value) {
  const text = String(value || "").trim();
  const compact = text.replace(/[^\d]/g, "");
  if (compact.length !== 8) return "";
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function isHolidayValue(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["是", "yes", "y", "true", "1"].includes(text);
}

function isWeekendOnlyHoliday(item) {
  return String(item.category || "").includes("星期六、星期日");
}

function isWeekendDate(dateText) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getDayRange(dateStr) {
  if (dateStr) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        const start = new Date(year, month, day);
        const end = new Date(year, month, day + 1);
        return { dayStartMs: start.getTime(), dayEndMs: end.getTime(), dayLabel: dateStr };
      }
    }
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  const dayLabel = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
    start.getDate()
  ).padStart(2, "0")}`;
  return { dayStartMs: start.getTime(), dayEndMs: end.getTime(), dayLabel };
}

function resolveAppMode() {
  const mode = AppMode[APP_MODE_NAME];
  if (mode === undefined) {
    const valid = Object.keys(AppMode).join(", ");
    throw new Error(`Invalid APP_MODE: ${APP_MODE_NAME}. Valid values: ${valid}`);
  }
  return mode;
}

function createAxRobot(appId, appSecret, appCode) {
  const mode = resolveAppMode();
  return new AXRobot({
    appId,
    secret: appSecret,
    mode,
    serverUrl: SERVER_URL || undefined,
    wsUrl: WEBSOCKET_URL || undefined,
    appCode: formatAppCode(appCode),
    viewLanguage: "en"
  });
}

function formatAppCode(appCode) {
  if (!appCode) return undefined;
  return appCode.toUpperCase().startsWith("APPCODE ") ? appCode : `APPCODE ${appCode}`;
}

async function fetchDailyStats(robotId, dayStartMs, dayEndMs, nowMs, creds) {
  const deadlineMs = nowMs + QUERY_TIMEOUT_MS;
  const cacheKey = [
    robotId,
    dayStartMs,
    dayEndMs,
    creds.appId,
    creds.appSecret,
    creds.appCode,
    SERVER_URL,
    WEBSOCKET_URL,
    APP_MODE_NAME
  ].join("|");
  const cached = getFreshCache(statsCache, cacheKey, nowMs);
  if (cached) return cached;
  if (statsInflight.has(cacheKey)) return statsInflight.get(cacheKey);

  const promise = (async () => {
    const axRobot = await getAxRobot(creds.appId, creds.appSecret, creds.appCode);
    setSdkCurrentRobotId(axRobot, robotId);
    const machineTotalPromise = getMachineTotalStats(axRobot, robotId, creds);
    const { tasks, isPartial } = await getAllTasks(axRobot, robotId, creds, dayStartMs, dayEndMs, deadlineMs, nowMs);
    const stats = await calculateDailyStats(axRobot, tasks, dayStartMs, dayEndMs, nowMs, deadlineMs, isPartial);
    const machineTotal = await machineTotalPromise.catch(() => null);
    if (machineTotal) {
      if (Number.isFinite(machineTotal.machineTotalTaskCount)) {
        stats.taskCount = machineTotal.machineTotalTaskCount;
      }
      if (Number.isFinite(machineTotal.machineTotalRunMs)) {
        stats.machineTotalRunMs = machineTotal.machineTotalRunMs;
      }
      if (Number.isFinite(machineTotal.machineTotalMileage)) {
        stats.machineTotalMileage = machineTotal.machineTotalMileage;
      }
    }
    return stats;
  })();

  statsInflight.set(cacheKey, promise);
  try {
    const value = await promise;
    setCache(statsCache, cacheKey, value, STATS_CACHE_TTL_MS, nowMs);
    return value;
  } finally {
    statsInflight.delete(cacheKey);
  }
}

async function validateRobotExists(axRobot, robotId, creds) {
  const cacheKey = [robotId, creds.appId, creds.appSecret, creds.appCode, SERVER_URL, WEBSOCKET_URL, APP_MODE_NAME].join("|");
  const nowMs = Date.now();
  const cached = getFreshCache(robotExistsCache, cacheKey, nowMs);
  if (cached !== undefined) return cached;
  if (robotExistsInflight.has(cacheKey)) return robotExistsInflight.get(cacheKey);

  const promise = (async () => {
    const exists = await fetchRobotExists(axRobot, robotId);
    setCache(robotExistsCache, cacheKey, exists, 300000, nowMs);
    return exists;
  })();

  robotExistsInflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    robotExistsInflight.delete(cacheKey);
  }
}

async function fetchRobotExists(axRobot, robotId) {
  const engine = axRobot.axDispatch?.aXRobotEngin || axRobot.aXRobotEngin;
  const timeoutMs = Math.min(QUERY_TIMEOUT_MS, 6000);
  const previousRobotId = getSdkCurrentRobotId(axRobot);

  try {
    if (typeof engine?.requestRobotList === "function") {
      const result = await withTimeout(engine.requestRobotList(robotId), timeoutMs, null);
      const list = extractRobotList(result);
      if (Array.isArray(list)) return list.some((item) => robotCandidateMatches(item, robotId));
    }

    if (typeof axRobot.getRobotList === "function") {
      const result = await withTimeout(axRobot.getRobotList(), timeoutMs, null);
      const list = extractRobotList(result);
      if (Array.isArray(list)) return list.some((item) => robotCandidateMatches(item, robotId));
    }

    if (typeof axRobot.getState === "function") {
      const state = await withTimeout(axRobot.getState(robotId), timeoutMs, null);
      return robotStateLooksValid(state, robotId);
    }

    throw new Error("The installed AXRobot SDK does not expose a robot validation API.");
  } finally {
    if (previousRobotId) setSdkCurrentRobotId(axRobot, previousRobotId);
  }
}

function getSdkCurrentRobotId(axRobot) {
  return String(axRobot.axDispatch?.aXRobotEngin?.mCurrentRobotId || axRobot.aXRobotEngin?.mCurrentRobotId || "");
}

function setSdkCurrentRobotId(axRobot, robotId) {
  const dispatch = axRobot.axDispatch || axRobot;
  for (const key of [
    "aXRobotEngin",
    "aXMotionEngin",
    "aXTaskEngin",
    "aXRobotsEngin",
    "aXTaskQueueEngin",
    "aXOutlineStatisEngin",
    "aXCustomTaskEngin",
    "aXStatis"
  ]) {
    if (dispatch[key] && "mCurrentRobotId" in dispatch[key]) {
      dispatch[key].mCurrentRobotId = robotId;
    }
  }
}

function extractRobotList(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.data?.list)) return value.data.list;
  if (Array.isArray(value.data?.records)) return value.data.records;
  if (Array.isArray(value.data?.rows)) return value.data.rows;
  if (Array.isArray(value.list)) return value.list;
  if (Array.isArray(value.records)) return value.records;
  if (Array.isArray(value.rows)) return value.rows;
  return null;
}

function robotCandidateMatches(value, robotId) {
  if (!value || typeof value !== "object") return false;
  const keys = [
    "robotId",
    "robotSn",
    "sn",
    "id",
    "deviceId",
    "deviceSn",
    "robotNo",
    "robotCode"
  ];
  return keys.some((key) => String(value[key] || "").trim() === robotId);
}

function robotStateLooksValid(value, robotId) {
  if (!value || typeof value !== "object") return false;
  if (value.errCode === 34001 || value.errCode === 34010) return false;
  if (value.status !== undefined && Number(value.status) !== 200) return false;
  const data = value.data && typeof value.data === "object" ? value.data : value;
  return robotCandidateMatches(data, robotId) || Boolean(data.robotState || data.battery || data.pose || data.mapId);
}

async function calculateDailyStats(axRobot, tasks, dayStartMs, dayEndMs, nowMs, deadlineMs, isPartial = false) {
  let totalRunMs = 0;
  let totalMileage = 0;
  let machineTotalRunMs = 0;
  let machineTotalMileage = 0;
  let partialMileageTasks = 0;
  let taskCount = 0;
  let completedTaskCount = 0;
  let canceledTaskCount = 0;
  const dailyMileageTasks = [];

  for (const task of tasks) {
    const start = firstPositiveNumber(task.cStartTime, task.startTime, task.createTime);
    if (!Number.isFinite(start)) continue;
    const end = firstPositiveNumber(task.cEndTime, task.endTime, task.finishTime, task.cFinishTime);
    const hasFinished = Number.isFinite(end) && end > start;
    const isStartedOnSelectedDay = start >= dayStartMs && start < dayEndMs;
    const effectiveEnd = hasFinished ? end : isStartedOnSelectedDay ? nowMs : NaN;

    if (hasFinished) {
      const taskRunMs = Math.max(0, end - start);
      machineTotalRunMs += taskRunMs;
    }

    if (!Number.isFinite(effectiveEnd)) continue;

    const overlapMs = Math.max(0, Math.min(effectiveEnd, dayEndMs) - Math.max(start, dayStartMs));
    if (overlapMs <= 0) continue;
    taskCount += 1;
    totalRunMs += overlapMs;
    if (isCanceledTask(task)) {
      canceledTaskCount += 1;
    } else if (hasFinished) {
      completedTaskCount += 1;
    }

    if (start >= dayStartMs && start < dayEndMs) {
      dailyMileageTasks.push(task);
    } else {
      partialMileageTasks += 1;
    }
  }

  const mileageByTaskId = await getTaskMileageMap(axRobot, dailyMileageTasks, deadlineMs);
  for (const mileage of mileageByTaskId.values()) {
    if (Number.isFinite(mileage)) {
      totalMileage += mileage;
      machineTotalMileage += mileage;
    }
  }

  return {
    taskCount,
    completedTaskCount,
    canceledTaskCount,
    partialMileageTasks,
    totalRunMs,
    totalMileage,
    machineTotalRunMs,
    machineTotalMileage,
    isPartial
  };
}

function isCanceledTask(task) {
  if (!task || typeof task !== "object") return false;

  const textValues = [
    task.status,
    task.statusText,
    task.statusName,
    task.executeStatusName,
    task.executeStatusText,
    task.taskStatus,
    task.taskStatusName,
    task.result,
    task.resultText,
    task.errorText,
    task.remark
  ];
  if (textValues.some((value) => isCancelText(value))) return true;

  const boolValues = [task.isCancel, task.isCanceled, task.isCancelled, task.canceled, task.cancelled];
  if (boolValues.some((value) => value === true || value === 1 || value === "1" || value === "true")) return true;

  const cancelCodeValues = [
    task.cancelStatus,
    task.cancelState,
    task.cancelType,
    task.cancelFlag,
    task.canceledStatus,
    task.cancelledStatus
  ];
  if (cancelCodeValues.some((value) => Number(value) > 0)) return true;

  const executeStatus = firstFiniteNumber(task.executeStatus, task.statusCode);
  return [4, 5, 6, 7, 8, 9, -1].includes(executeStatus);
}

function isCancelText(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return text.includes("cancel") || text.includes("取消") || text.includes("異常") || text.includes("失敗") || text.includes("failed") || text.includes("error");
}

async function getTaskMileageMap(axRobot, tasks, deadlineMs = Date.now() + QUERY_TIMEOUT_MS) {
  const result = new Map();
  const pending = [];
  const nowMs = Date.now();

  for (const task of tasks) {
    const directMileage = firstFiniteNumber(task.taskMileage, task.mileage, task.distance);
    if (Number.isFinite(directMileage)) {
      result.set(task.taskId, directMileage);
      setCache(mileageCache, task.taskId, directMileage, MILEAGE_CACHE_TTL_MS, nowMs);
    } else if (task.taskId) {
      const cached = getFreshCache(mileageCache, task.taskId, nowMs);
      if (cached !== undefined) {
        result.set(task.taskId, cached);
        continue;
      }
      pending.push(task);
    }
  }

  const getSingleTaskStatistics =
    axRobot.getSingleTaskStatistics?.bind(axRobot) ||
    axRobot.axDispatch?.getSingleTaskStatistics?.bind(axRobot.axDispatch);
  if (!getSingleTaskStatistics || pending.length === 0) return result;

  let index = 0;
  const workers = Array.from({ length: Math.min(MILEAGE_CONCURRENCY, pending.length) }, async () => {
    while (index < pending.length && Date.now() < deadlineMs - 100) {
      const task = pending[index];
      index += 1;
      try {
        const mileage = await getSingleTaskMileage(getSingleTaskStatistics, task.taskId);
        result.set(task.taskId, mileage);
      } catch {
        result.set(task.taskId, 0);
      }
    }
  });
  await Promise.all(workers);
  return result;
}

async function getSingleTaskMileage(getSingleTaskStatistics, taskId) {
  const nowMs = Date.now();
  const cached = getFreshCache(mileageCache, taskId, nowMs);
  if (cached !== undefined) return cached;
  if (mileageInflight.has(taskId)) return mileageInflight.get(taskId);

  const promise = (async () => {
    try {
      const stat = await withTimeout(
        getSingleTaskStatistics(
          {
            taskId,
            fields: ["mileage"]
          },
          0
        ),
        MILEAGE_REQUEST_TIMEOUT_MS,
        null
      );
      return firstFiniteNumber(stat?.mileage, stat?.data?.mileage, 0);
    } catch {
      return 0;
    }
  })();

  mileageInflight.set(taskId, promise);
  try {
    const mileage = await promise;
    setCache(mileageCache, taskId, mileage, MILEAGE_CACHE_TTL_MS, nowMs);
    return mileage;
  } finally {
    mileageInflight.delete(taskId);
  }
}

function isRunDirectly() {
  if (!process.argv[1]) return false;
  const entry = path.resolve(process.argv[1]);
  const self = fileURLToPath(import.meta.url);
  return entry === self;
}

async function getAllTasks(axRobot, robotId, creds, dayStartMs, dayEndMs, deadlineMs, nowMs = Date.now()) {
  const cacheKey = [
    robotId,
    dayStartMs,
    dayEndMs,
    creds.appId,
    creds.appSecret,
    creds.appCode,
    PAGE_SIZE,
    MAX_PAGES,
    SERVER_URL,
    WEBSOCKET_URL,
    APP_MODE_NAME
  ].join("|");
  const cached = getFreshCache(taskListCache, cacheKey, nowMs);
  if (cached) return cached;
  if (taskListInflight.has(cacheKey)) return taskListInflight.get(cacheKey);

  const promise = fetchAllTasks(axRobot, robotId, dayStartMs, dayEndMs, deadlineMs);
  taskListInflight.set(cacheKey, promise);
  try {
    const tasks = await promise;
    setCache(taskListCache, cacheKey, tasks, TASK_CACHE_TTL_MS, nowMs);
    return tasks;
  } finally {
    taskListInflight.delete(cacheKey);
  }
}

async function fetchAllTasks(axRobot, robotId, dayStartMs, dayEndMs, deadlineMs) {
  const all = [];
  let totalCount = null;
  let isPartial = false;
  const getTaskList = axRobot.getTaskList?.bind(axRobot) || axRobot.axDispatch?.getTaskList?.bind(axRobot.axDispatch);
  if (!getTaskList) {
    throw new Error("The installed AXRobot SDK does not expose getTaskList.");
  }

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum += 1) {
    if (Date.now() >= deadlineMs - 250) {
      isPartial = true;
      break;
    }
    const params = {
      pageNum,
      pageSize: PAGE_SIZE,
      robotId,
      startTime: dayStartMs,
      endTime: dayEndMs,
      beginTime: dayStartMs,
      finishTime: dayEndMs,
      startCreateTime: dayStartMs,
      endCreateTime: dayEndMs,
      executeStatus: 0,
      orderField: 1,
      orderType: -1,
      isTaskStatic: true
    };

    const result = await getTaskListPage(getTaskList, params, deadlineMs);
    if (!result) {
      isPartial = true;
      break;
    }
    totalCount = firstFiniteNumber(result?.data?.count, result?.count, totalCount);
    const list =
      result?.data?.list ||
      result?.data?.records ||
      result?.data?.rows ||
      result?.list ||
      result?.records ||
      result?.rows ||
      [];
    if (!Array.isArray(list)) {
      throw new Error("Task list response format is not supported.");
    }
    all.push(...list);
    if (isOlderThanSelectedDay(list, dayStartMs)) break;
    if (Number.isFinite(totalCount) && all.length >= totalCount) break;
    if (list.length === 0) break;
  }
  return { tasks: all, isPartial };
}

async function getMachineTotalStats(axRobot, robotId, creds) {
  const cacheKey = [robotId, creds.appId, creds.appSecret, creds.appCode, SERVER_URL, APP_MODE_NAME].join("|");
  const nowMs = Date.now();
  const cached = getFreshCache(totalStatsCache, cacheKey, nowMs);
  if (cached) return cached;
  if (totalStatsInflight.has(cacheKey)) return totalStatsInflight.get(cacheKey);

  const promise = fetchMachineTotalStatsWithFallback(axRobot, robotId);
  totalStatsInflight.set(cacheKey, promise);
  try {
    const value = await promise;
    setCache(totalStatsCache, cacheKey, value, TOTAL_STATS_CACHE_TTL_MS, nowMs);
    return value;
  } finally {
    totalStatsInflight.delete(cacheKey);
  }
}

async function fetchMachineTotalStatsWithFallback(axRobot, robotId) {
  const apiTotal = await fetchMachineTotalStats(axRobot, robotId, Date.now() + TOTAL_STATS_TIMEOUT_MS).catch(() => null);
  const taskCount = Number.isFinite(apiTotal?.machineTotalTaskCount) && apiTotal.machineTotalTaskCount > 0
    ? apiTotal.machineTotalTaskCount
    : await fetchMachineTotalTaskCount(axRobot, robotId, Date.now() + TOTAL_STATS_TIMEOUT_MS).catch(() => null);
  if (hasUsefulMachineTotal(apiTotal)) {
    return {
      ...apiTotal,
      machineTotalTaskCount: Number.isFinite(taskCount) ? taskCount : null
    };
  }
  const fallback = await fetchMachineTotalStatsFromTasks(axRobot, robotId, Date.now() + TOTAL_STATS_FALLBACK_TIMEOUT_MS);
  return {
    ...fallback,
    machineTotalTaskCount: Number.isFinite(taskCount) ? taskCount : fallback.machineTotalTaskCount
  };
}

async function fetchMachineTotalTaskCount(axRobot, robotId, deadlineMs) {
  const getTaskList = axRobot.getTaskList?.bind(axRobot) || axRobot.axDispatch?.getTaskList?.bind(axRobot.axDispatch);
  if (!getTaskList) return null;
  const result = await getTaskListPage(
    getTaskList,
    {
      pageNum: 1,
      pageSize: 1,
      robotId,
      executeStatus: 0,
      orderField: 1,
      orderType: -1,
      isTaskStatic: true
    },
    deadlineMs
  );
  const count = firstFiniteNumber(result?.data?.count, result?.count);
  return Number.isFinite(count) ? count : null;
}

async function fetchMachineTotalStats(axRobot, robotId, deadlineMs) {
  const timeoutMs = Math.min(TOTAL_STATS_TIMEOUT_MS, timeLeft(deadlineMs));
  const dispatch = axRobot.axDispatch;
  if (!dispatch?.aXStatis?.mBaseListener) return null;
  setSdkCurrentRobotId(axRobot, robotId);

  const headers = await dispatch.aXStatis.mBaseListener.getHeader();
  const response = await withTimeout(
    fetch(`${trimTrailingSlash(SERVER_URL)}/statis/v2.0/total`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dataItems: ["taskCount", "taskNum", "taskTotal", "taskDuration", "taskMileage", "mileage", "duration"],
        deviceIds: [robotId]
      })
    }),
    timeoutMs,
    null
  );
  if (!response?.ok) return null;
  const payload = await response.json();
  if (payload.status !== undefined && payload.status !== 200) return null;
  return extractMachineTotalStats(payload, robotId);
}

async function fetchMachineTotalStatsFromTasks(axRobot, robotId, deadlineMs) {
  const tasks = await fetchAllMachineTasks(axRobot, robotId, deadlineMs);
  let machineTotalRunMs = 0;
  let machineTotalMileage = 0;
  const mileageTasks = [];

  for (const task of tasks) {
    const start = firstPositiveNumber(task.cStartTime, task.startTime, task.createTime);
    const end = firstPositiveNumber(task.cEndTime, task.endTime, task.finishTime, task.cFinishTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      machineTotalRunMs += Math.max(0, end - start);
    }

    const directMileage = firstFiniteNumber(task.taskMileage, task.mileage, task.distance);
    if (Number.isFinite(directMileage)) {
      machineTotalMileage += directMileage;
    } else {
      mileageTasks.push(task);
    }
  }

  if (mileageTasks.length > 0 && Date.now() < deadlineMs - 250) {
    const mileageByTaskId = await getTaskMileageMap(axRobot, mileageTasks, deadlineMs);
    for (const mileage of mileageByTaskId.values()) {
      if (Number.isFinite(mileage)) machineTotalMileage += mileage;
    }
  }

  return {
    machineTotalTaskCount: Number.isFinite(tasks.totalCount) ? tasks.totalCount : tasks.length,
    machineTotalRunMs,
    machineTotalMileage
  };
}

async function fetchAllMachineTasks(axRobot, robotId, deadlineMs) {
  const all = [];
  let totalCount = null;
  const getTaskList = axRobot.getTaskList?.bind(axRobot) || axRobot.axDispatch?.getTaskList?.bind(axRobot.axDispatch);
  if (!getTaskList) return all;

  for (let pageNum = 1; pageNum <= TOTAL_TASK_MAX_PAGES; pageNum += 1) {
    if (Date.now() >= deadlineMs - 250) break;
    const result = await getTaskListPage(
      getTaskList,
      {
        pageNum,
        pageSize: PAGE_SIZE,
        robotId,
        executeStatus: 0,
        orderField: 1,
        orderType: -1,
        isTaskStatic: true
      },
      deadlineMs
    );
    if (!result) break;
    totalCount = firstFiniteNumber(result?.data?.count, result?.count, totalCount);
    const list =
      result?.data?.list ||
      result?.data?.records ||
      result?.data?.rows ||
      result?.list ||
      result?.records ||
      result?.rows ||
      [];
    if (!Array.isArray(list) || list.length === 0) break;
    all.push(...list);
    if (Number.isFinite(totalCount) && all.length >= totalCount) break;
  }

  all.totalCount = Number.isFinite(totalCount) ? totalCount : all.length;
  return all;
}

function hasUsefulMachineTotal(total) {
  return (
    total &&
    ((Number.isFinite(total.machineTotalRunMs) && total.machineTotalRunMs > 0) ||
      (Number.isFinite(total.machineTotalMileage) && total.machineTotalMileage > 0) ||
      (Number.isFinite(total.machineTotalTaskCount) && total.machineTotalTaskCount > 0))
  );
}

function extractMachineTotalStats(payload, robotId) {
  const direct = readMachineTotalCandidate(payload?.data, robotId) || readMachineTotalCandidate(payload, robotId);
  if (!direct) return null;

  return {
    machineTotalRunMs: direct.machineTotalRunMs,
    machineTotalMileage: direct.machineTotalMileage,
    machineTotalTaskCount: direct.machineTotalTaskCount
  };
}

function readMachineTotalCandidate(value, robotId) {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    const robotMatched = value
      .map((item) => readMachineTotalCandidate(item, robotId))
      .find((item) => item && (!item.deviceId || item.deviceId === robotId));
    return robotMatched || value.map((item) => readMachineTotalCandidate(item, robotId)).find(Boolean) || null;
  }

  const nestedByRobot = value[robotId];
  if (nestedByRobot && typeof nestedByRobot === "object") {
    const parsed = readMachineTotalCandidate(nestedByRobot, robotId);
    if (parsed) return parsed;
  }

  const source = value.data && typeof value.data === "object" ? { ...value, ...value.data } : value;
  const runMs = firstFiniteNumber(
    source.taskDuration,
    source.taskDurationMs,
    source.totalTaskDuration,
    source.totalTaskDurationMs,
    source.duration,
    source.durationMs,
    source.totalDuration,
    source.totalDurationMs,
    source.runTime,
    source.runTimeMs
  );
  const mileage = firstFiniteNumber(
    source.taskMileage,
    source.totalTaskMileage,
    source.mileage,
    source.totalMileage,
    source.distance,
    source.totalDistance
  );
  const taskCount = firstFiniteNumber(
    source.taskCount,
    source.taskNum,
    source.taskTotal,
    source.totalTaskCount,
    source.totalTaskNum,
    source.totalTasks,
    source.count,
    source.num
  );

  if (Number.isFinite(runMs) || Number.isFinite(mileage) || Number.isFinite(taskCount)) {
    return {
      deviceId: String(source.deviceId || source.robotId || source.id || ""),
      machineTotalRunMs: Number.isFinite(runMs) ? runMs : null,
      machineTotalMileage: Number.isFinite(mileage) ? mileage : null,
      machineTotalTaskCount: Number.isFinite(taskCount) ? taskCount : null
    };
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const parsed = readMachineTotalCandidate(child, robotId);
      if (parsed) return parsed;
    }
  }

  return null;
}

async function getTaskListPage(getTaskList, params, deadlineMs) {
  try {
    return await withTimeout(getTaskList(params), Math.min(TASK_PAGE_TIMEOUT_MS, timeLeft(deadlineMs)), null);
  } catch {
    const fallbackParams = {
      pageNum: params.pageNum,
      pageSize: params.pageSize,
      robotId: params.robotId,
      executeStatus: params.executeStatus,
      orderField: params.orderField,
      orderType: params.orderType,
      isTaskStatic: params.isTaskStatic
    };
    return await withTimeout(getTaskList(fallbackParams), Math.min(TASK_PAGE_TIMEOUT_MS, timeLeft(deadlineMs)), null);
  }
}

async function getAxRobot(appId, appSecret, appCode) {
  const cacheKey = [appId, appSecret, appCode, SERVER_URL, WEBSOCKET_URL, APP_MODE_NAME].join("|");
  const cached = axRobotCache.get(cacheKey);
  if (cached) return cached.initPromise;

  const axRobot = createAxRobot(appId, appSecret, appCode);
  const initPromise = (async () => {
    const initialized = await axRobot.init();
    if (!initialized) {
      axRobotCache.delete(cacheKey);
      if (typeof axRobot.destroy === "function") axRobot.destroy();
      throw new Error("AXRobot init failed. Please check APP_ID, APP_SECRET and APP_CODE.");
    }
    return axRobot;
  })();

  axRobotCache.set(cacheKey, { axRobot, initPromise });
  try {
    return await initPromise;
  } catch (err) {
    axRobotCache.delete(cacheKey);
    throw err;
  }
}

function getFreshCache(cache, key, nowMs = Date.now()) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= nowMs) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCache(cache, key, value, ttlMs, nowMs = Date.now()) {
  if (ttlMs <= 0) return;
  cache.set(key, { value, expiresAt: nowMs + ttlMs });
}

function isOlderThanSelectedDay(tasks, dayStartMs) {
  return tasks.some((task) => {
    const start = firstPositiveNumber(task.cStartTime, task.startTime, task.createTime);
    return Number.isFinite(start) && start < dayStartMs;
  });
}

function timeLeft(deadlineMs) {
  return Math.max(1, deadlineMs - Date.now());
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function withTimeout(promise, timeoutMs, fallbackValue) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), Math.max(1, timeoutMs));
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendLinePush({ channelAccessToken, channelId, channelSecret, to, text }) {
  const token = channelAccessToken || (await issueLineChannelAccessToken({ channelId, channelSecret }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINE_TIMEOUT_MS);
  try {
    const response = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        to,
        messages: [
          {
            type: "text",
            text: text.slice(0, 5000)
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload?.message || payload?.error_description || payload?.error || response.statusText;
      throw new Error(`LINE API error ${response.status}: ${detail}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function rememberLineSource(event) {
  const source = event?.source;
  if (!source || typeof source !== "object") return;
  const id = source.groupId || source.roomId || source.userId || "";
  if (!id) return;

  const type = source.groupId ? "group" : source.roomId ? "room" : "user";
  const item = {
    id,
    type,
    eventType: String(event.type || ""),
    receivedAt: new Date().toISOString()
  };
  const existingIndex = recentLineSources.findIndex((sourceItem) => sourceItem.id === id);
  if (existingIndex !== -1) recentLineSources.splice(existingIndex, 1);
  recentLineSources.unshift(item);
  recentLineSources.splice(20);
}

async function issueLineChannelAccessToken({ channelId, channelSecret }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINE_TIMEOUT_MS);
  try {
    const form = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: channelId,
      client_secret: channelSecret
    });
    const response = await fetch(LINE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload.error_description || payload.error || response.statusText;
      throw new Error(`LINE token error ${response.status}: ${detail}`);
    }
    if (!payload.access_token) throw new Error("LINE token response did not include access_token");
    return payload.access_token;
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmail({ to, subject, text, smtp }) {
  if (!smtp.host || !smtp.port || !smtp.from) {
    throw new Error("Missing SMTP settings. Please set host, port and sender.");
  }

  const client = new SmtpClient(smtp.host, smtp.port, smtp.secure);
  try {
    await client.connect();
    await client.ehlo();
    if (!smtp.secure) {
      await client.startTls();
      await client.ehlo();
    }
    if (smtp.user || smtp.pass) {
      await client.auth(smtp.user, smtp.pass);
    }
    await client.mail(smtp.from);
    await client.rcpt(to);
    await client.data(buildEmailMessage({ from: smtp.from, to, subject, text }));
    await client.quit();
  } finally {
    client.close();
  }
}

class SmtpClient {
  constructor(host, port, secure) {
    this.host = host;
    this.port = port;
    this.secure = secure;
    this.socket = null;
    this.buffer = "";
    this.pending = [];
  }

  async connect() {
    this.socket = this.secure
      ? tls.connect({ host: this.host, port: this.port, servername: this.host })
      : net.connect({ host: this.host, port: this.port });
    this.socket.setEncoding("utf8");
    this.socket.setTimeout(SMTP_TIMEOUT_MS);
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", (err) => this.rejectPending(err));
    this.socket.on("timeout", () => this.rejectPending(new Error("SMTP connection timed out")));
    await new Promise((resolve, reject) => {
      this.socket.once("connect", resolve);
      this.socket.once("error", reject);
    });
    await this.expect([220]);
  }

  onData(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      if (/^\d{3} /.test(line)) {
        const pending = this.pending.shift();
        if (pending) pending.resolve(line);
      }
    }
  }

  rejectPending(err) {
    while (this.pending.length > 0) {
      this.pending.shift().reject(err);
    }
  }

  async command(command, okCodes = [250]) {
    this.socket.write(`${command}\r\n`);
    return this.expect(okCodes);
  }

  async expect(okCodes) {
    const line = await new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
    const code = Number(line.slice(0, 3));
    if (!okCodes.includes(code)) throw new Error(`SMTP error: ${line}`);
    return line;
  }

  async ehlo() {
    await this.command(`EHLO ${this.host}`, [250]);
  }

  async startTls() {
    await this.command("STARTTLS", [220]);
    this.socket = tls.connect({ socket: this.socket, servername: this.host });
    this.socket.setEncoding("utf8");
    this.socket.setTimeout(SMTP_TIMEOUT_MS);
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", (err) => this.rejectPending(err));
    this.socket.on("timeout", () => this.rejectPending(new Error("SMTP connection timed out")));
    await new Promise((resolve, reject) => {
      this.socket.once("secureConnect", resolve);
      this.socket.once("error", reject);
    });
  }

  async auth(user, pass) {
    await this.command("AUTH LOGIN", [334]);
    await this.command(Buffer.from(user).toString("base64"), [334]);
    await this.command(Buffer.from(pass).toString("base64"), [235]);
  }

  async mail(from) {
    await this.command(`MAIL FROM:<${from}>`, [250]);
  }

  async rcpt(to) {
    await this.command(`RCPT TO:<${to}>`, [250, 251]);
  }

  async data(message) {
    await this.command("DATA", [354]);
    this.socket.write(`${message.replace(/^\./gm, "..")}\r\n.\r\n`);
    await this.expect([250]);
  }

  async quit() {
    if (this.socket && !this.socket.destroyed) await this.command("QUIT", [221]);
  }

  close() {
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
  }
}

function buildEmailMessage({ from, to, subject, text }) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n")
  ].join("\r\n");
}

function isTruthy(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on";
}

function toNumber(value) {
  if (value === null || value === undefined) return NaN;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const num = toNumber(value);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const num = toNumber(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return NaN;
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function sendFile(res, filePath, contentType) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      res.writeHead(404);
      return res.end("Not Found");
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": data.length
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

function sendJson(res, status, payload) {
  const data = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data)
  });
  res.end(data);
}
