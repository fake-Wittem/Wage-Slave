const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function minutesFromTime(value) {
  const [hour = "0", minute = "0"] = String(value || "00:00").split(":");
  return Number(hour) * 60 + Number(minute);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function dateKey(date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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

function effectiveWorkMinutes(config) {
  const start = minutesFromTime(config.workStart);
  const end = minutesFromTime(config.workEnd);
  const breakStart = minutesFromTime(config.breakStart);
  const breakEnd = minutesFromTime(config.breakEnd);
  const breakMinutes = Math.max(0, breakEnd - breakStart);

  return Math.max(1, end - start - breakMinutes);
}

function elapsedWorkMinutes(now, config) {
  if (!isWorkday(now, config)) {
    return 0;
  }

  const current = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const start = minutesFromTime(config.workStart);
  const end = minutesFromTime(config.workEnd);
  const breakStart = minutesFromTime(config.breakStart);
  const breakEnd = minutesFromTime(config.breakEnd);

  const beforeBreak = clamp(Math.min(current, breakStart) - start, 0, Math.max(0, breakStart - start));
  const afterBreak = clamp(Math.min(current, end) - Math.max(breakEnd, start), 0, Math.max(0, end - Math.max(breakEnd, start)));

  return beforeBreak + afterBreak;
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function workdaysInMonth(date, config) {
  const total = daysInMonth(date);
  let count = 0;

  for (let day = 1; day <= total; day += 1) {
    if (isWorkday(new Date(date.getFullYear(), date.getMonth(), day), config)) {
      count += 1;
    }
  }

  return Math.max(1, count);
}

function completedWorkdaysBeforeToday(date, config) {
  let count = 0;

  for (let day = 1; day < date.getDate(); day += 1) {
    if (isWorkday(new Date(date.getFullYear(), date.getMonth(), day), config)) {
      count += 1;
    }
  }

  return count;
}

export function calculateWage(now, config) {
  const totalWorkMinutes = effectiveWorkMinutes(config);
  const elapsedMinutes = elapsedWorkMinutes(now, config);
  const dayProgress = clamp(elapsedMinutes / totalWorkMinutes, 0, 1);
  const monthlyWorkdays = config.monthlyWorkdayMode === "fixed"
    ? Number(config.fixedMonthlyWorkdays) || 21.75
    : workdaysInMonth(now, config);
  const dailyRate = config.salaryMode === "daily"
    ? Number(config.dailySalary) || 0
    : (Number(config.monthlySalary) || 0) / monthlyWorkdays;
  const todayEarned = dailyRate * dayProgress;
  const completedDays = completedWorkdaysBeforeToday(now, config);
  const monthEarned = config.salaryMode === "daily"
    ? completedDays * (Number(config.dailySalary) || 0) + todayEarned
    : completedDays * dailyRate + todayEarned;

  return {
    todayEarned,
    monthEarned,
    dailyRate,
    dayProgress,
    elapsedHours: elapsedMinutes / 60,
    totalHours: totalWorkMinutes / 60,
    completedDays,
    monthlyWorkdays,
    monthDayProgress: now.getDate() / daysInMonth(now),
    monthDayLabel: `${now.getDate()} / ${daysInMonth(now)} 天`,
    isWorkday: isWorkday(now, config)
  };
}

export function formatMoney(value, privacyMode = false) {
  if (privacyMode) {
    return "¥••••";
  }

  return moneyFormatter.format(value);
}

export function formatDate(date) {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long"
  });
}

export function formatTime(date) {
  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function isToday(date) {
  return isSameDate(date, new Date());
}
