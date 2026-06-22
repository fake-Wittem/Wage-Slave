const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const schemaVersion = 1;

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function periodDate(periodKey) {
  const [yearText, monthText] = String(periodKey || monthKey(new Date())).slice(0, 7).split("-");
  const year = Number(yearText) || new Date().getFullYear();
  const month = Math.min(12, Math.max(1, Number(monthText) || (new Date().getMonth() + 1)));
  return new Date(year, month - 1, 1);
}

function minutesFromTime(value) {
  const [hour = "0", minute = "0"] = String(value || "00:00").split(":");
  return (Number(hour) || 0) * 60 + (Number(minute) || 0);
}

function isWorkday(date, config) {
  const key = dateKey(date);
  if (config.holidays?.includes(key)) {
    return false;
  }
  if (config.makeupWorkdays?.includes(key)) {
    return true;
  }

  const mondayBased = date.getDay() === 0 ? 7 : date.getDay();
  return config.workdays?.includes(mondayBased);
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function workdaysInMonth(date, config) {
  let count = 0;
  for (let day = 1; day <= daysInMonth(date); day += 1) {
    if (isWorkday(new Date(date.getFullYear(), date.getMonth(), day), config)) {
      count += 1;
    }
  }
  return Math.max(1, count);
}

function remainingWorkdaysInPeriod(periodKey, config, now = new Date()) {
  const date = periodDate(periodKey);
  const key = monthKey(date);
  const currentKey = monthKey(now);

  if (key < currentKey) {
    return 0;
  }

  let count = 0;
  const startDay = key === currentKey ? now.getDate() + 1 : 1;
  for (let day = startDay; day <= daysInMonth(date); day += 1) {
    if (isWorkday(new Date(date.getFullYear(), date.getMonth(), day), config)) {
      count += 1;
    }
  }

  return count;
}

function effectiveWorkMinutes(config) {
  const start = minutesFromTime(config.workStart);
  const end = minutesFromTime(config.workEnd);
  const breakMinutes = Math.max(0, minutesFromTime(config.breakEnd) - minutesFromTime(config.breakStart));
  return Math.max(1, end - start - breakMinutes);
}

function calculateWorkedMinutes(now, config) {
  if (!isWorkday(now, config)) {
    return 0;
  }

  const current = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const start = minutesFromTime(config.workStart);
  const end = minutesFromTime(config.workEnd);
  const breakStart = minutesFromTime(config.breakStart);
  const breakEnd = minutesFromTime(config.breakEnd);
  const beforeBreak = Math.min(Math.max(Math.min(current, breakStart) - start, 0), Math.max(0, breakStart - start));
  const afterBreak = Math.min(Math.max(Math.min(current, end) - Math.max(breakEnd, start), 0), Math.max(0, end - Math.max(breakEnd, start)));
  return Math.round(beforeBreak + afterBreak);
}

function calculateEarnedAmount(recordDate, workedMinutes, config) {
  const totalMinutes = effectiveWorkMinutes(config);
  const monthlyWorkdays = config.monthlyWorkdayMode === "fixed"
    ? Number(config.fixedMonthlyWorkdays) || 21.75
    : workdaysInMonth(recordDate, config);
  const dailyRate = config.salaryMode === "daily"
    ? Number(config.dailySalary) || 0
    : (Number(config.monthlySalary) || 0) / monthlyWorkdays;

  return Number((dailyRate * Math.max(0, workedMinutes) / totalMinutes).toFixed(2));
}

function salarySnapshot(config) {
  return {
    salaryMode: config.salaryMode,
    dailySalary: Number(config.dailySalary) || 0,
    monthlySalary: Number(config.monthlySalary) || 0,
    monthlyWorkdayMode: config.monthlyWorkdayMode,
    fixedMonthlyWorkdays: Number(config.fixedMonthlyWorkdays) || 21.75,
    workStart: config.workStart,
    workEnd: config.workEnd,
    breakStart: config.breakStart,
    breakEnd: config.breakEnd,
    workdays: Array.isArray(config.workdays) ? config.workdays : []
  };
}

function defaultGoalForPeriod(periodKey, config) {
  const date = periodDate(periodKey);
  const targetWorkdays = config.monthlyWorkdayMode === "fixed"
    ? Number(config.fixedMonthlyWorkdays) || 21.75
    : workdaysInMonth(date, config);
  const targetAmount = config.salaryMode === "daily"
    ? (Number(config.dailySalary) || 0) * targetWorkdays
    : Number(config.monthlySalary) || 0;

  return {
    periodType: "month",
    periodKey: monthKey(date),
    targetAmount: Number(targetAmount.toFixed(2)),
    targetWorkdays,
    targetMinutes: Math.round(targetWorkdays * effectiveWorkMinutes(config)),
    status: "default",
    isDefault: true,
    createdAt: null,
    updatedAt: null
  };
}

function expectedProgressForPeriod(periodKey, targetMinutes, config, now = new Date()) {
  const key = String(periodKey || monthKey(now)).slice(0, 7);
  const currentKey = monthKey(now);
  const totalTarget = Math.max(1, Number(targetMinutes) || 0);

  if (key < currentKey) {
    return 1;
  }
  if (key > currentKey) {
    return 0;
  }

  let expectedMinutes = 0;
  for (let day = 1; day < now.getDate(); day += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    if (isWorkday(date, config)) {
      expectedMinutes += effectiveWorkMinutes(config);
    }
  }

  expectedMinutes += calculateWorkedMinutes(now, config);
  return clamp(expectedMinutes / totalTarget, 0, 1);
}

function goalStatus(amountProgress, expectedProgress) {
  if (amountProgress >= 1) {
    return { code: "done", label: "已完成" };
  }

  const delta = amountProgress - expectedProgress;
  if (delta >= 0.08) {
    return { code: "ahead", label: "超前" };
  }
  if (delta <= -0.08) {
    return { code: "behind", label: "落后" };
  }

  return { code: "normal", label: "正常" };
}

function normalizeRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    date: row.date,
    workdayType: row.workday_type,
    workStart: row.work_start,
    workEnd: row.work_end,
    breakStart: row.break_start,
    breakEnd: row.break_end,
    workedMinutes: row.worked_minutes,
    earnedAmount: row.earned_amount,
    salaryMode: row.salary_mode,
    salarySnapshot: row.salary_snapshot ? JSON.parse(row.salary_snapshot) : null,
    note: row.note || "",
    source: row.source || "auto",
    manualLock: Boolean(row.manual_lock),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeGoal(row, periodKey, config) {
  const fallback = defaultGoalForPeriod(periodKey, config);
  if (!row) {
    return fallback;
  }

  return {
    id: row.id,
    periodType: row.period_type || "month",
    periodKey: row.period_key,
    targetAmount: row.target_amount ?? fallback.targetAmount,
    targetWorkdays: row.target_workdays ?? fallback.targetWorkdays,
    targetMinutes: row.target_minutes ?? fallback.targetMinutes,
    status: row.status || "active",
    isDefault: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function anomalyPeriodEndDay(periodKey, now = new Date()) {
  const date = periodDate(periodKey);
  const key = monthKey(date);
  const currentKey = monthKey(now);

  if (key > currentKey) {
    return 0;
  }

  return key === currentKey ? now.getDate() : daysInMonth(date);
}

function buildDailySeries(periodKey, records, now = new Date()) {
  const date = periodDate(periodKey);
  const key = monthKey(date);
  const currentKey = monthKey(now);

  if (key > currentKey) {
    return [];
  }

  const endDay = key === currentKey ? now.getDate() : daysInMonth(date);
  const recordsByDate = new Map(records.map((record) => [record.date, record]));

  return Array.from({ length: endDay }, (_item, index) => {
    const day = index + 1;
    const itemDate = new Date(date.getFullYear(), date.getMonth(), day);
    const record = recordsByDate.get(dateKey(itemDate));
    return {
      date: dateKey(itemDate),
      earnedAmount: Number(record?.earnedAmount) || 0,
      workedMinutes: Number(record?.workedMinutes) || 0,
      workdayType: record?.workdayType || null,
      manualLock: Boolean(record?.manualLock)
    };
  });
}

function buildAnomalies(periodKey, records, config, now = new Date()) {
  const date = periodDate(periodKey);
  const recordsByDate = new Map(records.map((record) => [record.date, record]));
  const anomalies = [];
  const endDay = anomalyPeriodEndDay(periodKey, now);
  const normalWorkMinutes = effectiveWorkMinutes(config);

  for (let day = 1; day <= endDay; day += 1) {
    const itemDate = new Date(date.getFullYear(), date.getMonth(), day);
    const key = dateKey(itemDate);
    const record = recordsByDate.get(key);
    const plannedWorkday = isWorkday(itemDate, config);

    if (plannedWorkday && !record) {
      anomalies.push({
        date: key,
        type: "missing",
        severity: "warning",
        label: "工作日无记录"
      });
      continue;
    }

    if (!record) {
      continue;
    }

    const workedMinutes = Number(record.workedMinutes) || 0;
    const earnedAmount = Number(record.earnedAmount) || 0;
    const nonWorkdayRecord = !plannedWorkday || ["rest", "holiday", "leave"].includes(record.workdayType);

    if (nonWorkdayRecord && earnedAmount > 0) {
      anomalies.push({
        date: key,
        type: "non_workday_income",
        severity: "notice",
        label: "非工作日存在收入"
      });
    }

    if (plannedWorkday && workedMinutes === 0 && !["rest", "holiday", "leave"].includes(record.workdayType)) {
      anomalies.push({
        date: key,
        type: "zero_hours",
        severity: "warning",
        label: "当日工时为 0"
      });
    }

    if (workedMinutes > normalWorkMinutes * 1.25) {
      anomalies.push({
        date: key,
        type: "long_hours",
        severity: "warning",
        label: "工时明显超出配置"
      });
    }

    if (record.manualLock) {
      anomalies.push({
        date: key,
        type: "manual",
        severity: "info",
        label: "手动修正记录"
      });
    }
  }

  return anomalies;
}

class RecordsStore {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.dbPath = path.join(userDataPath, "wage-slave.db");
    this.db = null;
    this.ready = null;
  }

  async init() {
    if (this.ready) {
      return this.ready;
    }

    this.ready = this.load();
    return this.ready;
  }

  async load() {
    fs.mkdirSync(this.userDataPath, { recursive: true });
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(path.dirname(require.resolve("sql.js")), file)
    });
    const bytes = fs.existsSync(this.dbPath) ? fs.readFileSync(this.dbPath) : null;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.migrate();
    this.persist();
  }

  migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        workday_type TEXT NOT NULL DEFAULT 'workday',
        work_start TEXT,
        work_end TEXT,
        break_start TEXT,
        break_end TEXT,
        worked_minutes INTEGER NOT NULL DEFAULT 0,
        earned_amount REAL NOT NULL DEFAULT 0,
        salary_mode TEXT NOT NULL,
        salary_snapshot TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'auto',
        manual_lock INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_type TEXT NOT NULL DEFAULT 'month',
        period_key TEXT NOT NULL,
        target_amount REAL,
        target_workdays REAL,
        target_minutes INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(period_type, period_key)
      );
      CREATE TABLE IF NOT EXISTS record_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id INTEGER,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(record_id) REFERENCES daily_records(id)
      );
      CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records(date);
      CREATE INDEX IF NOT EXISTS idx_record_events_record_id ON record_events(record_id);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (${schemaVersion}, datetime('now'));
      PRAGMA user_version = ${schemaVersion};
    `);
  }

  persist() {
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  selectAll(sql, params = []) {
    const statement = this.db.prepare(sql);
    statement.bind(params);
    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    statement.free();
    return rows;
  }

  selectOne(sql, params = []) {
    return this.selectAll(sql, params)[0] || null;
  }

  async autoSaveToday(config, now = new Date()) {
    await this.init();
    const key = dateKey(now);
    const existing = this.selectOne("SELECT * FROM daily_records WHERE date = ?", [key]);
    if (existing?.manual_lock) {
      return { record: normalizeRecord(existing), skipped: true };
    }

    const workedMinutes = calculateWorkedMinutes(now, config);
    const payload = {
      date: key,
      workdayType: isWorkday(now, config) ? "workday" : "rest",
      workStart: config.workStart,
      workEnd: config.workEnd,
      breakStart: config.breakStart,
      breakEnd: config.breakEnd,
      workedMinutes,
      earnedAmount: calculateEarnedAmount(now, workedMinutes, config),
      salaryMode: config.salaryMode,
      salarySnapshot: JSON.stringify(salarySnapshot(config)),
      now: new Date().toISOString()
    };

    if (existing) {
      this.db.run(`
        UPDATE daily_records
        SET workday_type = ?, work_start = ?, work_end = ?, break_start = ?, break_end = ?,
            worked_minutes = ?, earned_amount = ?, salary_mode = ?, salary_snapshot = ?,
            source = 'auto', updated_at = ?
        WHERE date = ? AND manual_lock = 0
      `, [
        payload.workdayType,
        payload.workStart,
        payload.workEnd,
        payload.breakStart,
        payload.breakEnd,
        payload.workedMinutes,
        payload.earnedAmount,
        payload.salaryMode,
        payload.salarySnapshot,
        payload.now,
        payload.date
      ]);
    } else {
      this.db.run(`
        INSERT INTO daily_records (
          date, workday_type, work_start, work_end, break_start, break_end,
          worked_minutes, earned_amount, salary_mode, salary_snapshot,
          note, source, manual_lock, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'auto', 0, ?, ?)
      `, [
        payload.date,
        payload.workdayType,
        payload.workStart,
        payload.workEnd,
        payload.breakStart,
        payload.breakEnd,
        payload.workedMinutes,
        payload.earnedAmount,
        payload.salaryMode,
        payload.salarySnapshot,
        payload.now,
        payload.now
      ]);
      const record = this.selectOne("SELECT * FROM daily_records WHERE date = ?", [key]);
      this.db.run("INSERT INTO record_events(record_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)", [
        record.id,
        "auto_create",
        JSON.stringify({ record: normalizeRecord(record) }),
        payload.now
      ]);
    }

    this.persist();
    return { record: await this.getRecord(key), skipped: false };
  }

  async listMonth(periodKey) {
    await this.init();
    const key = String(periodKey || monthKey(new Date())).slice(0, 7);
    return this.selectAll(
      "SELECT * FROM daily_records WHERE date LIKE ? ORDER BY date DESC",
      [`${key}-%`]
    ).map(normalizeRecord);
  }

  async getRecord(date) {
    await this.init();
    return normalizeRecord(this.selectOne("SELECT * FROM daily_records WHERE date = ?", [date]));
  }

  async saveManualRecord(input, config) {
    await this.init();
    const now = new Date().toISOString();
    const recordDate = new Date(`${input.date}T12:00:00`);
    const workedMinutes = Math.max(0, Math.round(Number(input.workedMinutes) || this.minutesFromInput(input)));
    const next = {
      date: input.date,
      workdayType: input.workdayType || "workday",
      workStart: input.workStart || config.workStart,
      workEnd: input.workEnd || config.workEnd,
      breakStart: input.breakStart || config.breakStart,
      breakEnd: input.breakEnd || config.breakEnd,
      workedMinutes,
      earnedAmount: calculateEarnedAmount(recordDate, workedMinutes, config),
      salaryMode: config.salaryMode,
      salarySnapshot: JSON.stringify(salarySnapshot(config)),
      note: String(input.note || "").trim()
    };
    const before = await this.getRecord(next.date);

    this.db.run(`
      INSERT INTO daily_records (
        date, workday_type, work_start, work_end, break_start, break_end,
        worked_minutes, earned_amount, salary_mode, salary_snapshot,
        note, source, manual_lock, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        workday_type = excluded.workday_type,
        work_start = excluded.work_start,
        work_end = excluded.work_end,
        break_start = excluded.break_start,
        break_end = excluded.break_end,
        worked_minutes = excluded.worked_minutes,
        earned_amount = excluded.earned_amount,
        salary_mode = excluded.salary_mode,
        salary_snapshot = excluded.salary_snapshot,
        note = excluded.note,
        source = 'manual',
        manual_lock = 1,
        updated_at = excluded.updated_at
    `, [
      next.date,
      next.workdayType,
      next.workStart,
      next.workEnd,
      next.breakStart,
      next.breakEnd,
      next.workedMinutes,
      next.earnedAmount,
      next.salaryMode,
      next.salarySnapshot,
      next.note,
      now,
      now
    ]);

    const after = await this.getRecord(next.date);
    this.db.run("INSERT INTO record_events(record_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)", [
      after.id,
      before ? "manual_update" : "manual_create",
      JSON.stringify({ before, after }),
      now
    ]);
    this.persist();
    return after;
  }

  minutesFromInput(input) {
    const start = minutesFromTime(input.workStart);
    const end = minutesFromTime(input.workEnd);
    const breakMinutes = Math.max(0, minutesFromTime(input.breakEnd) - minutesFromTime(input.breakStart));
    return Math.max(0, end - start - breakMinutes);
  }

  async exportMonth(periodKey, format) {
    const records = await this.listMonth(periodKey);
    if (format === "json") {
      return {
        filename: `wage-records-${periodKey}.json`,
        mime: "application/json;charset=utf-8",
        content: JSON.stringify(records, null, 2)
      };
    }

    const headers = [
      "date",
      "workday_type",
      "work_start",
      "work_end",
      "break_start",
      "break_end",
      "worked_minutes",
      "earned_amount",
      "salary_mode",
      "source",
      "note"
    ];
    const rows = records.map((record) => [
      record.date,
      record.workdayType,
      record.workStart,
      record.workEnd,
      record.breakStart,
      record.breakEnd,
      record.workedMinutes,
      record.earnedAmount,
      record.salaryMode,
      record.source,
      record.note
    ]);
    const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    return {
      filename: `wage-records-${periodKey}.csv`,
      mime: "text/csv;charset=utf-8",
      content: [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n")
    };
  }

  async getGoalSummary(periodKey, config, now = new Date()) {
    await this.init();
    const key = String(periodKey || monthKey(now)).slice(0, 7);
    const row = this.selectOne(
      "SELECT * FROM goals WHERE period_type = 'month' AND period_key = ?",
      [key]
    );
    const goal = normalizeGoal(row, key, config);
    const defaultGoal = defaultGoalForPeriod(key, config);
    const records = await this.listMonth(key);
    const totals = records.reduce((sum, record) => ({
      earnedAmount: sum.earnedAmount + (Number(record.earnedAmount) || 0),
      workedMinutes: sum.workedMinutes + (Number(record.workedMinutes) || 0),
      completedWorkdays: sum.completedWorkdays + ((Number(record.workedMinutes) || 0) > 0 ? 1 : 0)
    }), {
      earnedAmount: 0,
      workedMinutes: 0,
      completedWorkdays: 0
    });
    const amountProgress = clamp(totals.earnedAmount / Math.max(1, Number(goal.targetAmount) || 0), 0, 1.5);
    const minutesProgress = clamp(totals.workedMinutes / Math.max(1, Number(goal.targetMinutes) || 0), 0, 1.5);
    const workdayProgress = clamp(totals.completedWorkdays / Math.max(1, Number(goal.targetWorkdays) || 0), 0, 1.5);
    const expectedProgress = expectedProgressForPeriod(key, goal.targetMinutes, config, now);
    const projectedIncome = expectedProgress > 0
      ? Number((totals.earnedAmount / expectedProgress).toFixed(2))
      : 0;

    return {
      goal,
      defaultGoal,
      totals: {
        earnedAmount: Number(totals.earnedAmount.toFixed(2)),
        workedMinutes: totals.workedMinutes,
        completedWorkdays: totals.completedWorkdays
      },
      progress: {
        amount: amountProgress,
        minutes: minutesProgress,
        workdays: workdayProgress,
        expected: expectedProgress
      },
      projectedIncome,
      status: goalStatus(amountProgress, expectedProgress)
    };
  }

  async getStatsSummary(periodKey, config, now = new Date()) {
    await this.init();
    const key = String(periodKey || monthKey(now)).slice(0, 7);
    const records = await this.listMonth(key);
    const ascendingRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const totals = ascendingRecords.reduce((sum, record) => ({
      earnedAmount: sum.earnedAmount + (Number(record.earnedAmount) || 0),
      workedMinutes: sum.workedMinutes + (Number(record.workedMinutes) || 0),
      completedWorkdays: sum.completedWorkdays + ((Number(record.workedMinutes) || 0) > 0 ? 1 : 0)
    }), {
      earnedAmount: 0,
      workedMinutes: 0,
      completedWorkdays: 0
    });
    const activeDays = Math.max(1, ascendingRecords.filter((record) => (
      (Number(record.workedMinutes) || 0) > 0 || (Number(record.earnedAmount) || 0) > 0
    )).length);
    const todayRecord = key === monthKey(now)
      ? ascendingRecords.find((record) => record.date === dateKey(now))
      : null;
    const goalSummary = await this.getGoalSummary(key, config, now);
    const dailySeries = buildDailySeries(key, ascendingRecords, now);

    return {
      periodKey: key,
      records: ascendingRecords,
      totals: {
        earnedAmount: Number(totals.earnedAmount.toFixed(2)),
        todayEarnedAmount: Number(todayRecord?.earnedAmount || 0),
        workedMinutes: totals.workedMinutes,
        completedWorkdays: totals.completedWorkdays,
        remainingWorkdays: remainingWorkdaysInPeriod(key, config, now),
        plannedWorkdays: workdaysInMonth(periodDate(key), config),
        averageDailyAmount: Number((totals.earnedAmount / activeDays).toFixed(2)),
        averageDailyMinutes: Math.round(totals.workedMinutes / activeDays)
      },
      goal: goalSummary.goal,
      progress: goalSummary.progress,
      projectedIncome: goalSummary.projectedIncome,
      status: goalSummary.status,
      dailySeries,
      recentSeries: dailySeries.slice(-7),
      anomalies: buildAnomalies(key, ascendingRecords, config, now)
    };
  }

  async saveGoal(input, config) {
    await this.init();
    const now = new Date().toISOString();
    const key = String(input?.periodKey || monthKey(new Date())).slice(0, 7);
    const fallback = defaultGoalForPeriod(key, config);
    const targetAmount = Math.max(0, Number(input?.targetAmount ?? fallback.targetAmount) || 0);
    const targetWorkdays = Math.max(0, Number(input?.targetWorkdays ?? fallback.targetWorkdays) || 0);
    const targetMinutes = Math.max(0, Math.round(Number(input?.targetMinutes ?? fallback.targetMinutes) || 0));

    this.db.run(`
      INSERT INTO goals (
        period_type, period_key, target_amount, target_workdays, target_minutes, status, created_at, updated_at
      )
      VALUES ('month', ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(period_type, period_key) DO UPDATE SET
        target_amount = excluded.target_amount,
        target_workdays = excluded.target_workdays,
        target_minutes = excluded.target_minutes,
        status = 'active',
        updated_at = excluded.updated_at
    `, [key, targetAmount, targetWorkdays, targetMinutes, now, now]);

    this.persist();
    return this.getGoalSummary(key, config);
  }

  async resetGoal(periodKey, config) {
    await this.init();
    const key = String(periodKey || monthKey(new Date())).slice(0, 7);
    this.db.run("DELETE FROM goals WHERE period_type = 'month' AND period_key = ?", [key]);
    this.persist();
    return this.getGoalSummary(key, config);
  }
}

module.exports = {
  RecordsStore,
  dateKey,
  monthKey
};
