import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  CloudSun,
  Eye,
  EyeOff,
  GripHorizontal,
  Monitor,
  Moon,
  Pin,
  Settings,
  Sun,
  X
} from "lucide-react";
import { calculateWage, formatDate, formatMoney, formatTime } from "./salary.js";

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
  edgeCollapseDelayMs: 800,
  edgeCollapseHandleSize: 12,
  privacyMode: false
};

function ThemeIcon({ mode }) {
  if (mode === "light") {
    return <Sun size={15} />;
  }
  if (mode === "dark") {
    return <Moon size={15} />;
  }
  return <Monitor size={15} />;
}

function themeLabel(mode) {
  if (mode === "dark") {
    return "深色";
  }
  if (mode === "light") {
    return "浅色";
  }

  return "跟随系统";
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
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

function SettingsPanel({ config, version, onClose, onPatch }) {
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
          <select
            value={config.salaryMode}
            onChange={(event) => onPatch({ salaryMode: event.target.value })}
          >
            <option value="monthly">月薪</option>
            <option value="daily">日薪</option>
          </select>
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
          <input
            type="time"
            value={config.workStart}
            onChange={(event) => onPatch({ workStart: event.target.value })}
          />
        </Field>

        <Field label="下班">
          <input
            type="time"
            value={config.workEnd}
            onChange={(event) => onPatch({ workEnd: event.target.value })}
          />
        </Field>

        <Field label="午休开始">
          <input
            type="time"
            value={config.breakStart}
            onChange={(event) => onPatch({ breakStart: event.target.value })}
          />
        </Field>

        <Field label="午休结束">
          <input
            type="time"
            value={config.breakEnd}
            onChange={(event) => onPatch({ breakEnd: event.target.value })}
          />
        </Field>

        <Field label="主题">
          <select
            value={config.themeMode}
            onChange={(event) => onPatch({ themeMode: event.target.value })}
          >
            <option value="system">跟随系统</option>
            <option value="dark">深色</option>
            <option value="light">浅色</option>
          </select>
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
    </section>
  );
}

export function App() {
  const [now, setNow] = useState(new Date());
  const [config, setConfig] = useState(fallbackConfig);
  const [version, setVersion] = useState("0.1.0");
  const [resolvedTheme, setResolvedTheme] = useState("dark");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [collapseEdge, setCollapseEdge] = useState("right");

  useEffect(() => {
    window.wageApp?.getInitialState().then((state) => {
      setConfig({ ...fallbackConfig, ...state.config });
      setVersion(state.version);
      setResolvedTheme(state.resolvedTheme);
    });

    window.wageApp?.onConfigUpdated(({ config: nextConfig, resolvedTheme: nextTheme }) => {
      setConfig({ ...fallbackConfig, ...nextConfig });
      setResolvedTheme(nextTheme);
    });
    window.wageApp?.onThemeUpdated(setResolvedTheme);
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

  const wage = useMemo(() => calculateWage(now, config), [now, config]);

  function patchConfig(patch) {
    const next = { ...config, ...patch };
    setConfig(next);
    window.wageApp?.updateConfig(patch);
  }

  if (collapsed) {
    return (
      <main
        className={`collapse-handle ${collapseEdge}`}
        onMouseEnter={() => window.wageApp?.expandWindow()}
        onClick={() => window.wageApp?.expandWindow()}
      >
        <span>¥</span>
      </main>
    );
  }

  return (
    <main className="widget-shell">
      <div className="drag-strip">
        <GripHorizontal size={18} />
      </div>

      <header className="top-row">
        <div>
          <p>{formatDate(now)}</p>
          <span>{config.city} · 多云 27°C · AQI 42</span>
        </div>
        <CloudSun size={30} />
      </header>

      <section className="time-block">
        <span>当前时间</span>
        <strong>{formatTime(now)}</strong>
      </section>

      <section className="earned-block">
        <span>今日已赚工薪</span>
        <strong>{formatMoney(wage.todayEarned, config.privacyMode)}</strong>
        <p>
          {config.salaryMode === "monthly" ? "按月薪折算" : "按日薪计算"}
          {" · "}
          {wage.isWorkday ? "工作日实时增长" : "今日非工作日"}
        </p>
      </section>

      <section className="progress-block">
        <div>
          <span>今日工时进度</span>
          <strong>{Math.round(wage.dayProgress * 100)}%</strong>
        </div>
        <div className="progress-track">
          <i style={{ width: `${wage.dayProgress * 100}%` }} />
        </div>
        <p>
          已过 {wage.elapsedHours.toFixed(1)}h / 总计 {wage.totalHours.toFixed(1)}h
        </p>
      </section>

      <section className="stat-grid">
        <article>
          <CalendarDays size={17} />
          <span>本月已赚</span>
          <strong>{formatMoney(wage.monthEarned, config.privacyMode)}</strong>
        </article>
        <article>
          <ChevronRight size={17} />
          <span>本月已过</span>
          <strong>{wage.monthDayLabel}</strong>
        </article>
      </section>

      <footer className="status-row">
        <div>
          <span className="live-dot" />
          <span>
            v{version} · <ThemeIcon mode={config.themeMode} /> {themeLabel(config.themeMode)}
          </span>
        </div>
        <div className="footer-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => patchConfig({ privacyMode: !config.privacyMode })}
            aria-label="切换隐私金额"
          >
            {config.privacyMode ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => window.wageApp?.collapseWindow(config.edgeCollapsePosition?.edge || "right")}
            aria-label="收起到屏幕边缘"
          >
            <Pin size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="打开设置"
          >
            <Settings size={17} />
          </button>
        </div>
      </footer>

      {settingsOpen ? (
        <SettingsPanel
          config={config}
          version={version}
          onClose={() => setSettingsOpen(false)}
          onPatch={patchConfig}
        />
      ) : null}
    </main>
  );
}
