import { useEffect, useMemo, useState } from "react";
import controlCloseIcon from "../assets/control-close.png";
import { ControlIcon, DatePicker } from "./controls.jsx";
import { formatMoney } from "./salary.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function hoursLabel(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  return `${(safeMinutes / 60).toFixed(1)} 小时`;
}

function percentLabel(value) {
  const safeValue = Math.max(0, Number(value) || 0);
  return `${Math.round(safeValue * 100)}%`;
}

function moneyLabel(value, privacyMode) {
  return formatMoney(value || 0, privacyMode).replace("¥", "");
}

function barWidth(value, max) {
  if (!max) {
    return "0%";
  }

  return `${Math.min(100, Math.max(0, (Number(value) || 0) / max * 100))}%`;
}

function StatCard({ label, value, subValue, tone = "default" }) {
  return (
    <article className={`stats-card is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{subValue}</em>
    </article>
  );
}

function TrendRow({ item, maxAmount, maxMinutes, privacyMode }) {
  return (
    <div className={`stats-trend-row ${item.manualLock ? "is-manual" : ""}`}>
      <span>{item.date.slice(5)}</span>
      <div className="stats-trend-bars" aria-hidden="true">
        <i className="amount-bar" style={{ width: barWidth(item.earnedAmount, maxAmount) }} />
        <i className="time-bar" style={{ width: barWidth(item.workedMinutes, maxMinutes) }} />
      </div>
      <strong>{moneyLabel(item.earnedAmount, privacyMode)}</strong>
      <em>{hoursLabel(item.workedMinutes)}</em>
    </div>
  );
}

function AnomalyItem({ anomaly }) {
  return (
    <div className={`stats-anomaly is-${anomaly.severity}`}>
      <span>{anomaly.date.slice(5)}</span>
      <strong>{anomaly.label}</strong>
    </div>
  );
}

export function StatsPanel({ privacyMode, onClose }) {
  const [periodKey, setPeriodKey] = useState(currentMonthKey());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSummary(nextPeriodKey = periodKey) {
    if (!window.wageApp?.stats?.getSummary) {
      setError("统计服务不可用");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const nextSummary = await window.wageApp.stats.getSummary(nextPeriodKey);
      setSummary(nextSummary);
    } catch (statsError) {
      setError(statsError?.message || "读取统计失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSummary(periodKey);
  }, [periodKey]);

  const totals = summary?.totals || {};
  const progress = summary?.progress || {};
  const status = summary?.status || { code: "normal", label: loading ? "读取中" : "正常" };
  const recentSeries = summary?.recentSeries || [];
  const anomalies = summary?.anomalies || [];
  const maxAmount = useMemo(
    () => Math.max(1, ...recentSeries.map((item) => Number(item.earnedAmount) || 0)),
    [recentSeries]
  );
  const maxMinutes = useMemo(
    () => Math.max(1, ...recentSeries.map((item) => Number(item.workedMinutes) || 0)),
    [recentSeries]
  );

  return (
    <section className="module-panel stats-panel" aria-label="统计面板">
      <div className="settings-head">
        <div>
          <strong>统计</strong>
          <span>{periodKey} 收入、工时与目标达成</span>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭统计">
          <ControlIcon src={controlCloseIcon} className="close-icon" />
        </button>
      </div>

      <div className="stats-toolbar">
        <label className="field">
          <span>月份</span>
          <DatePicker
            type="month"
            value={periodKey}
            ariaLabel="选择统计月份"
            onChange={setPeriodKey}
          />
        </label>
        <div className={`goal-status is-${status.code}`}>
          <span>状态</span>
          <strong>{status.label}</strong>
        </div>
      </div>

      {error ? <p className="record-error">{error}</p> : null}

      <div className="stats-scroll">
        <div className="stats-grid">
          <StatCard
            label="本月累计收入"
            value={moneyLabel(totals.earnedAmount, privacyMode)}
            subValue={`目标完成 ${percentLabel(progress.amount)}`}
            tone={status.code}
          />
          <StatCard
            label="今日已赚收入"
            value={moneyLabel(totals.todayEarnedAmount, privacyMode)}
            subValue={periodKey === currentMonthKey() ? "来自今日记录" : "非当前月份"}
          />
          <StatCard
            label="完成工作日"
            value={`${totals.completedWorkdays || 0} 天`}
            subValue={`计划 ${Number(totals.plannedWorkdays || 0).toFixed(0)} 天`}
          />
          <StatCard
            label="剩余工作日"
            value={`${totals.remainingWorkdays || 0} 天`}
            subValue="按工作日配置计算"
          />
          <StatCard
            label="累计工时"
            value={hoursLabel(totals.workedMinutes)}
            subValue={`目标 ${percentLabel(progress.minutes)}`}
          />
          <StatCard
            label="平均每日收入"
            value={moneyLabel(totals.averageDailyAmount, privacyMode)}
            subValue="按有效记录日均值"
          />
          <StatCard
            label="平均每日工时"
            value={hoursLabel(totals.averageDailyMinutes)}
            subValue="按有效记录日均值"
          />
          <StatCard
            label="目标完成率"
            value={percentLabel(progress.amount)}
            subValue={`预期 ${percentLabel(progress.expected)}`}
            tone={status.code}
          />
          <StatCard
            label="预计月底收入"
            value={moneyLabel(summary?.projectedIncome, privacyMode)}
            subValue="按当前进度推算"
          />
        </div>

        <div className="stats-section-head">
          <strong>最近 7 天概览</strong>
          <span>收入 / 工时</span>
        </div>
        <div className="stats-trend">
          {recentSeries.length ? recentSeries.map((item) => (
            <TrendRow
              key={item.date}
              item={item}
              maxAmount={maxAmount}
              maxMinutes={maxMinutes}
              privacyMode={privacyMode}
            />
          )) : (
            <div className="stats-empty">{loading ? "正在读取" : "暂无趋势数据"}</div>
          )}
        </div>

        <div className="stats-section-head">
          <strong>异常提示</strong>
          <span>{anomalies.length ? `${anomalies.length} 项` : "稳定"}</span>
        </div>
        <div className="stats-anomalies">
          {anomalies.length ? anomalies.slice(0, 8).map((anomaly) => (
            <AnomalyItem anomaly={anomaly} key={`${anomaly.date}-${anomaly.type}`} />
          )) : (
            <div className="stats-empty">未发现明显异常</div>
          )}
        </div>
      </div>
    </section>
  );
}
