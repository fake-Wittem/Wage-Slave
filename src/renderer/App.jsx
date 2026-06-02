import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Download, RefreshCw, X } from "lucide-react";
import brandLogo from "../assets/brand-logo.png";
import featureGoalIcon from "../assets/feature-goal.png";
import featureHideMoneyIcon from "../assets/feature-hide-money.png";
import featureRecordIcon from "../assets/feature-record.png";
import featureSettingsIcon from "../assets/feature-settings.png";
import featureStatsIcon from "../assets/feature-stats.png";
import infoDateIcon from "../assets/info-date.png";
import infoMonthEarnedIcon from "../assets/info-month-earned.png";
import infoMonthPassedIcon from "../assets/info-month-passed.png";
import sealMottoIcon from "../assets/seal-motto.png";
import infoTodayEarnedIcon from "../assets/info-today-earned.png";
import infoWeatherIcon from "../assets/info-weather.png";
import { calculateWage, formatMoney, formatTime } from "./salary.js";

const fallbackConfig = {
  salaryMode: "monthly",
  dailySalary: 500,
  monthlySalary: 12000,
  monthlyWorkdayMode: "actual",
  fixedMonthlyWorkdays: 21.75,
  workStart: "09:00",
  workEnd: "18:00",
  breakStart: "12:00",
  breakEnd: "13:30",
  workdays: [1, 2, 3, 4, 5],
  city: "珠海",
  alwaysOnTop: true,
  launchAtStartup: false,
  lockPosition: false,
  clickThrough: false,
  opacity: 0.94,
  themeMode: "system",
  edgeCollapseEnabled: true,
  edgeCollapseDelayMs: 260,
  edgeCollapseHandleSize: 4,
  privacyMode: false
};

function dateParts(date) {
  return {
    date: date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }),
    weekday: date.toLocaleDateString("zh-CN", { weekday: "long" })
  };
}

function weatherParts(city, weather) {
  if (!weather.data) {
    return {
      city,
      condition: weather.status === "loading" ? "加载中" : "暂不可用",
      temperature: "--"
    };
  }

  return {
    city: weather.data.city || city,
    condition: weather.data.condition || "天气",
    temperature: weather.data.temperature === null ? "--" : `${weather.data.temperature}°C`
  };
}

function Field({ label, children }) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
    </div>
  );
}

function CustomSelect({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div className="custom-select" onBlur={() => setOpen(false)}>
      <button
        className={`control-button ${open ? "is-open" : ""}`}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
      >
        <span>{selected.label}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="select-menu" role="listbox">
          {options.map((option) => (
            <button
              className={`select-option ${option.value === value ? "is-selected" : ""}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TimePicker({ value, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);
  const [scrollbars, setScrollbars] = useState({
    hour: { top: 0, height: 32 },
    minute: { top: 0, height: 32 }
  });
  const [hour = "00", minute = "00"] = String(value || "00:00").split(":");
  const hours = Array.from({ length: 24 }, (_, index) => `${index}`.padStart(2, "0"));
  const minutes = Array.from({ length: 12 }, (_, index) => `${index * 5}`.padStart(2, "0"));

  function updateScrollbar(type, element) {
    if (!element) {
      return;
    }

    const maxScroll = Math.max(1, element.scrollHeight - element.clientHeight);
    const height = Math.max(26, (element.clientHeight / element.scrollHeight) * element.clientHeight);
    const top = (element.scrollTop / maxScroll) * (element.clientHeight - height);
    setScrollbars((current) => ({
      ...current,
      [type]: { top, height }
    }));
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    window.requestAnimationFrame(() => {
      updateScrollbar("hour", hourListRef.current);
      updateScrollbar("minute", minuteListRef.current);
    });
  }, [open]);

  function updateTime(nextHour, nextMinute) {
    onChange(`${nextHour}:${nextMinute}`);
  }

  return (
    <div className="time-picker" onBlur={() => setOpen(false)}>
      <button
        className={`control-button time-trigger ${open ? "is-open" : ""}`}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
      >
        <span>{hour}</span>
        <b>:</b>
        <span>{minute}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="time-menu" role="dialog" aria-label={ariaLabel}>
          <div className="time-column">
            <strong>时</strong>
            <div className="time-scroll-shell">
              <div
                className="time-scroll-list"
                ref={hourListRef}
                onScroll={(event) => updateScrollbar("hour", event.currentTarget)}
              >
                {hours.map((item) => (
                  <button
                    className={item === hour ? "is-selected" : ""}
                    type="button"
                    key={item}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => updateTime(item, minute)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <span className="time-scrollbar" aria-hidden="true">
                <i style={{ height: scrollbars.hour.height, transform: `translateY(${scrollbars.hour.top}px)` }} />
              </span>
            </div>
          </div>
          <div className="time-column">
            <strong>分</strong>
            <div className="time-scroll-shell">
              <div
                className="time-scroll-list"
                ref={minuteListRef}
                onScroll={(event) => updateScrollbar("minute", event.currentTarget)}
              >
                {minutes.map((item) => (
                  <button
                    className={item === minute ? "is-selected" : ""}
                    type="button"
                    key={item}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      updateTime(hour, item);
                      setOpen(false);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <span className="time-scrollbar" aria-hidden="true">
                <i style={{ height: scrollbars.minute.height, transform: `translateY(${scrollbars.minute.top}px)` }} />
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <button
      className={`toggle ${checked ? "is-on" : ""}`}
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <i aria-hidden="true" />
    </button>
  );
}

function FeatureIcon({ src, label }) {
  return <img className="feature-icon" src={src} alt="" aria-hidden="true" title={label} />;
}

function InfoIcon({ src, label }) {
  return <img className="info-icon" src={src} alt="" aria-hidden="true" title={label} />;
}

function LineIcon({ name }) {
  const common = {
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  if (name === "calendar") {
    return (
      <svg {...common}>
        <rect x="9" y="11" width="30" height="29" rx="4" />
        <path d="M15 7v9M33 7v9M9 20h30" />
        <path d="M16 27h3M23 27h3M30 27h3M16 34h3M23 34h3M30 34h3" />
      </svg>
    );
  }

  if (name === "weather") {
    return (
      <svg {...common}>
        <path d="M31 18a9 9 0 0 0-17.4 3.2A8.5 8.5 0 0 0 15 38h21a7 7 0 0 0 1.1-13.9A9 9 0 0 0 31 18Z" />
        <path d="M33 9v4M42 18h-4M38.8 11.2 36 14M23 10l1.6 3.5" />
      </svg>
    );
  }

  if (name === "coin") {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className="coin-glyph">
        <circle cx="24" cy="24" r="17" />
        <text x="24" y="31" textAnchor="middle">￥</text>
      </svg>
    );
  }

  if (name === "hide-money") {
    return (
      <svg {...common}>
        <path d="M5 24s7-11 19-11 19 11 19 11-7 11-19 11S5 24 5 24Z" />
        <circle cx="24" cy="24" r="5" />
        <path d="M9 39 39 9" />
      </svg>
    );
  }

  if (name === "wallet") {
    return (
      <svg {...common}>
        <path d="M10 18h27a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V17a4 4 0 0 1 4-4h23" />
        <path d="m13 15 17-8 4 8M34 27h7v8h-7a4 4 0 0 1 0-8Z" />
      </svg>
    );
  }

  if (name === "cup") {
    return (
      <svg {...common}>
        <path d="M12 21h21v9a9 9 0 0 1-9 9h-3a9 9 0 0 1-9-9v-9Z" />
        <path d="M33 24h3a5 5 0 0 1 0 10h-4M15 16c-2-3 3-4 1-7M24 16c-2-3 3-4 1-7M31 16c-2-3 3-4 1-7M9 39h29" />
      </svg>
    );
  }

  if (name === "pie") {
    return (
      <svg {...common}>
        <path d="M24 8v17h16A16 16 0 1 1 24 8Z" />
        <path d="M29 7.8A16 16 0 0 1 40.2 20H29V7.8Z" />
      </svg>
    );
  }

  if (name === "flower") {
    return (
      <svg {...common}>
        <path d="M24 26c5 0 9-4 9-9-5 0-9 4-9 9Zm0 0c-5 0-9-4-9-9 5 0 9 4 9 9Zm0 0v14" />
        <path d="M14 40h20M19 34c-4 0-7-3-7-7 4 0 7 3 7 7Zm10 0c4 0 7-3 7-7-4 0-7 3-7 7Z" />
      </svg>
    );
  }

  if (name === "record") {
    return (
      <svg {...common}>
        <path d="M12 8h20l6 6v26H12V8Z" />
        <path d="M31 8v7h7M18 22h14M18 29h14M18 36h8M31 36l8-8 3 3-8 8-5 2 2-5Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="24" cy="24" r="6" />
      <path d="M24 5v7M24 36v7M5 24h7M36 24h7M10.6 10.6l5 5M32.4 32.4l5 5M37.4 10.6l-5 5M15.6 32.4l-5 5" />
    </svg>
  );
}

function updateStatusText(updateState) {
  const versionText = updateState?.latestVersion ? ` v${updateState.latestVersion}` : "";

  if (updateState?.status === "checking") {
    return "正在检查更新";
  }
  if (updateState?.status === "available") {
    return `发现新版本${versionText}，正在下载`;
  }
  if (updateState?.status === "downloading") {
    const percent = Number(updateState?.progress?.percent);
    return Number.isFinite(percent) ? `正在下载 ${Math.round(percent)}%` : "正在下载更新";
  }
  if (updateState?.status === "downloaded") {
    return `新版本${versionText}已下载`;
  }
  if (updateState?.status === "installing") {
    return "正在重启安装";
  }
  if (updateState?.status === "not-available") {
    return "已是最新版本";
  }
  if (updateState?.status === "error") {
    return updateState?.error || "更新检查失败";
  }

  return updateState?.message || "可手动检查新版本";
}

function SettingsPanel({ config, version, updateState, onClose, onPatch, onCheckForUpdates, onInstallUpdate }) {
  const updateBusy = updateState?.status === "checking" || updateState?.status === "downloading" || updateState?.status === "installing";
  const updateReady = updateState?.status === "downloaded";

  return (
    <section className="settings-panel" aria-label="设置面板">
      <div className="settings-head">
        <div>
          <strong>设置</strong>
          <span>版本 {version}</span>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭设置">
          <X size={17} />
        </button>
      </div>

      <div className="settings-grid">
        <Field label="薪资模式">
          <CustomSelect
            value={config.salaryMode}
            ariaLabel="选择薪资模式"
            options={[
              { value: "monthly", label: "月薪" },
              { value: "daily", label: "日薪" }
            ]}
            onChange={(value) => onPatch({ salaryMode: value })}
          />
        </Field>

        {config.salaryMode === "monthly" ? (
          <Field label="月薪">
            <input
              type="number"
              min="0"
              value={config.monthlySalary}
              onChange={(event) => onPatch({ monthlySalary: Number(event.target.value) })}
            />
          </Field>
        ) : (
          <Field label="日薪">
            <input
              type="number"
              min="0"
              value={config.dailySalary}
              onChange={(event) => onPatch({ dailySalary: Number(event.target.value) })}
            />
          </Field>
        )}

        <Field label="上班">
          <TimePicker
            value={config.workStart}
            ariaLabel="选择上班时间"
            onChange={(value) => onPatch({ workStart: value })}
          />
        </Field>

        <Field label="下班">
          <TimePicker
            value={config.workEnd}
            ariaLabel="选择下班时间"
            onChange={(value) => onPatch({ workEnd: value })}
          />
        </Field>

        <Field label="午休开始">
          <TimePicker
            value={config.breakStart}
            ariaLabel="选择午休开始时间"
            onChange={(value) => onPatch({ breakStart: value })}
          />
        </Field>

        <Field label="午休结束">
          <TimePicker
            value={config.breakEnd}
            ariaLabel="选择午休结束时间"
            onChange={(value) => onPatch({ breakEnd: value })}
          />
        </Field>

        <Field label="主题">
          <CustomSelect
            value={config.themeMode}
            ariaLabel="选择主题模式"
            options={[
              { value: "system", label: "跟随系统" },
              { value: "dark", label: "深色" },
              { value: "light", label: "浅色" }
            ]}
            onChange={(value) => onPatch({ themeMode: value })}
          />
        </Field>

        <Field label="透明度">
          <input
            type="range"
            min="0.72"
            max="1"
            step="0.01"
            value={config.opacity}
            onChange={(event) => onPatch({ opacity: Number(event.target.value) })}
          />
        </Field>
      </div>

      <div className="toggle-list">
        <Toggle label="窗口置顶" checked={config.alwaysOnTop} onChange={(value) => onPatch({ alwaysOnTop: value })} />
        <Toggle label="开机自启动" checked={config.launchAtStartup} onChange={(value) => onPatch({ launchAtStartup: value })} />
        <Toggle label="靠边收起" checked={config.edgeCollapseEnabled} onChange={(value) => onPatch({ edgeCollapseEnabled: value })} />
        <Toggle label="隐私金额" checked={config.privacyMode} onChange={(value) => onPatch({ privacyMode: value })} />
      </div>

      <div className={`update-card ${updateReady ? "is-ready" : ""} ${updateState?.status === "error" ? "is-error" : ""}`}>
        <div>
          <span>软件更新</span>
          <strong>{updateStatusText(updateState)}</strong>
        </div>
        <button
          className="update-action"
          type="button"
          disabled={updateBusy}
          onClick={updateReady ? onInstallUpdate : onCheckForUpdates}
        >
          {updateReady ? <Download size={15} /> : <RefreshCw size={15} className={updateBusy ? "is-spinning" : ""} />}
          <span>{updateReady ? "重启安装" : "检查更新"}</span>
        </button>
      </div>
    </section>
  );
}

function TimeFace({ value }) {
  return (
    <strong className="time-face" aria-label={`当前时间 ${value}`}>
      {value.split("").map((char, index) => (
        <span className={char === ":" ? "time-colon" : ""} key={`${char}-${index}`}>
          {char}
        </span>
      ))}
    </strong>
  );
}

export function App() {
  const [now, setNow] = useState(new Date());
  const [config, setConfig] = useState(fallbackConfig);
  const [version, setVersion] = useState("0.1.0");
  const [resolvedTheme, setResolvedTheme] = useState("dark");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [collapseEdge, setCollapseEdge] = useState("right");
  const [weather, setWeather] = useState({ status: "loading", data: null, error: null });
  const [updateState, setUpdateState] = useState({ status: "idle", message: null });

  useEffect(() => {
    window.wageApp?.getInitialState().then((state) => {
      setConfig({ ...fallbackConfig, ...state.config });
      setVersion(state.version);
      setResolvedTheme(state.resolvedTheme);
    });
    window.wageApp?.getUpdateState?.().then(setUpdateState);

    window.wageApp?.onConfigUpdated(({ config: nextConfig, resolvedTheme: nextTheme }) => {
      setConfig({ ...fallbackConfig, ...nextConfig });
      setResolvedTheme(nextTheme);
    });
    window.wageApp?.onThemeUpdated(setResolvedTheme);
    window.wageApp?.onUpdateStatus?.(setUpdateState);
    window.wageApp?.onWindowCollapsed(({ edge }) => {
      setCollapseEdge(edge);
      setCollapsed(true);
    });
    window.wageApp?.onWindowExpanded(() => {
      setCollapsed(false);
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    let cancelled = false;

    async function refreshWeather() {
      if (!window.wageApp?.getWeather) {
        setWeather({ status: "error", data: null, error: "Weather API unavailable" });
        return;
      }

      setWeather((current) => ({
        status: current.data ? "ready" : "loading",
        data: current.data,
        error: null
      }));

      try {
        const data = await window.wageApp.getWeather(config.city);
        if (!cancelled) {
          setWeather({ status: "ready", data, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setWeather((current) => ({
            status: "error",
            data: current.data,
            error: error?.message || "Weather request failed"
          }));
        }
      }
    }

    refreshWeather();
    const timer = window.setInterval(refreshWeather, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [config.city]);

  const wage = useMemo(() => calculateWage(now, config), [now, config]);
  const date = dateParts(now);
  const weatherInfo = weatherParts(config.city, weather);
  const remainingDays = Math.max(0, Math.ceil(wage.monthlyWorkdays - wage.completedDays - wage.dayProgress));

  function patchConfig(patch) {
    const next = { ...config, ...patch };
    setConfig(next);
    if (patch.themeMode) {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      setResolvedTheme(
        patch.themeMode === "system"
          ? (prefersDark ? "dark" : "light")
          : patch.themeMode
      );
    }
    window.wageApp?.updateConfig(patch);
  }

  async function checkForUpdates() {
    const nextState = await window.wageApp?.checkForUpdates?.();
    if (nextState) {
      setUpdateState(nextState);
    }
  }

  async function installUpdate() {
    const nextState = await window.wageApp?.installUpdate?.();
    if (nextState) {
      setUpdateState(nextState);
    }
  }

  const navItems = [
    { image: featureHideMoneyIcon, label: "隐藏金额", onClick: () => patchConfig({ privacyMode: !config.privacyMode }) },
    { image: featureStatsIcon, label: "统计" },
    { image: featureGoalIcon, label: "目标" },
    { image: featureRecordIcon, label: "记录" },
    { image: featureSettingsIcon, label: "设置", onClick: () => setSettingsOpen(true) }
  ];

  if (collapsed) {
    return (
      <main
        className={`collapse-handle ${collapseEdge}`}
        onMouseEnter={() => window.wageApp?.expandWindow({ activate: false })}
        onClick={() => window.wageApp?.expandWindow({ activate: true })}
        aria-label="展开工薪小卡片"
      />
    );
  }

  return (
    <main
      className="widget-shell"
      onMouseEnter={() => window.wageApp?.setPointerInside(true)}
      onMouseLeave={() => window.wageApp?.setPointerInside(false)}
    >
      <header className="brand-bar">
        <div className="brand-left">
          <img className="brand-logo" src={brandLogo} alt="" aria-hidden="true" />
          <strong>WAGE SLAVE</strong>
        </div>
        <div className="drag-dots" aria-hidden="true">
          {Array.from({ length: 20 }, (_, index) => <i key={index} />)}
        </div>
        <div className="window-actions">
          <button
            className="window-button"
            type="button"
            onClick={() => window.wageApp?.minimizeWindow()}
            aria-label="收起到屏幕边缘"
            title="收起到边缘"
          >
            <span />
          </button>
          <button
            className="window-button close"
            type="button"
            onClick={() => window.wageApp?.closeWindowToTray()}
            aria-label="关闭到系统托盘"
            title="关闭"
          >
            <span />
          </button>
        </div>
      </header>

      <section className="info-strip">
        <div className="info-cell date-cell">
          <InfoIcon src={infoDateIcon} label="日期" />
          <div>
            <span>日期</span>
            <strong>{date.date}</strong>
            <em>{date.weekday}</em>
          </div>
        </div>
        <div className="info-cell weather-cell">
          <div>
            <span>天气</span>
            <strong>{weatherInfo.condition}</strong>
            <em>{weatherInfo.temperature}</em>
          </div>
          <InfoIcon src={infoWeatherIcon} label="天气" />
        </div>
      </section>

      <section className="time-section">
        <div className="ornament-title"><span>当前时间</span></div>
        <TimeFace value={formatTime(now)} />
        <img className="seal-note" src={sealMottoIcon} alt="" aria-hidden="true" />
      </section>

      <section className="earned-section">
        <div className="ornament-title plain"><span>今日已赚工资</span></div>
        <div className="money-row">
          <img className="money-icon" src={infoTodayEarnedIcon} alt="" aria-hidden="true" />
          <strong>{formatMoney(wage.todayEarned, config.privacyMode).replace("¥", "")}</strong>
        </div>
      </section>

      <section className="progress-section">
        <div className="progress-head">
          <span>今日工时进度</span>
          <strong>{wage.elapsedHours.toFixed(1)} / {wage.totalHours.toFixed(1)} 小时</strong>
        </div>
        <div className="progress-track">
          <i style={{ width: `${wage.dayProgress * 100}%` }} />
          <b style={{ left: `${Math.min(100, Math.max(0, wage.dayProgress * 100))}%` }} />
        </div>
        <div className="progress-scale">
          <span>0</span>
          <span>{(wage.totalHours / 2).toFixed(wage.totalHours % 2 ? 1 : 0)}</span>
          <span>{wage.totalHours.toFixed(wage.totalHours % 1 ? 1 : 0)}</span>
        </div>
      </section>

      <section className="month-section">
        <article>
          <InfoIcon src={infoMonthEarnedIcon} label="本月已赚" />
          <div>
            <span>本月已赚</span>
            <strong>{formatMoney(wage.monthEarned, config.privacyMode).replace("¥", "")}</strong>
            <em>目标 {formatMoney(config.monthlySalary, config.privacyMode).replace("¥", "")}</em>
          </div>
        </article>
        <article>
          <InfoIcon src={infoMonthPassedIcon} label="本月已过" />
          <div>
            <span>本月已过</span>
            <strong>{wage.monthDayLabel}</strong>
            <em>剩余 {remainingDays} 天</em>
          </div>
        </article>
      </section>

      <aside
        className={`side-nav ${navOpen ? "is-open" : ""}`}
        aria-label="功能区"
      >
        <button
          className="nav-toggle"
          type="button"
          onClick={() => setNavOpen((next) => !next)}
          aria-label={navOpen ? "收起功能区" : "展开功能区"}
          aria-expanded={navOpen}
        >
          <span />
        </button>
        <p>专注当下<br />认真生活</p>
        <div>
          {navItems.map((item) => (
            <button
              className={item.label === "设置" || (item.label === "隐藏金额" && config.privacyMode) ? "is-active" : ""}
              type="button"
              key={item.label}
              onClick={item.onClick}
              aria-label={item.label}
            >
              {item.image ? <FeatureIcon src={item.image} label={item.label} /> : <LineIcon name={item.icon} />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {settingsOpen ? (
        <SettingsPanel
          config={config}
          version={version}
          updateState={updateState}
          onClose={() => setSettingsOpen(false)}
          onPatch={patchConfig}
          onCheckForUpdates={checkForUpdates}
          onInstallUpdate={installUpdate}
        />
      ) : null}
    </main>
  );
}
