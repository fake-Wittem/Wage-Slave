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

function minutesLabel(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  return `${(safeMinutes / 60).toFixed(1)} 小时`;
}

function percentLabel(value) {
  const safeValue = Math.max(0, Number(value) || 0);
  return `${Math.round(safeValue * 100)}%`;
}

function progressWidth(value) {
  return `${Math.min(100, Math.max(0, (Number(value) || 0) * 100))}%`;
}

function formFromSummary(summary) {
  const goal = summary?.goal;
  return {
    targetAmount: goal?.targetAmount ?? 0,
    targetWorkdays: goal?.targetWorkdays ?? 0,
    targetHours: Number(((goal?.targetMinutes ?? 0) / 60).toFixed(1))
  };
}

function GoalStat({ label, value, subValue, progress, status }) {
  return (
    <article className={`goal-stat ${status ? `is-${status}` : ""}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{subValue}</em>
      </div>
      <div className="goal-meter" aria-hidden="true">
        <i style={{ width: progressWidth(progress) }} />
      </div>
    </article>
  );
}

export function GoalsPanel({ privacyMode, onClose }) {
  const [periodKey, setPeriodKey] = useState(currentMonthKey());
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(() => formFromSummary(null));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const targetMinutes = useMemo(
    () => Math.max(0, Math.round((Number(form.targetHours) || 0) * 60)),
    [form.targetHours]
  );

  async function refreshSummary(nextPeriodKey = periodKey) {
    if (!window.wageApp?.goals?.getSummary) {
      setError("目标服务不可用");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const nextSummary = await window.wageApp.goals.getSummary(nextPeriodKey);
      setSummary(nextSummary);
      setForm(formFromSummary(nextSummary));
    } catch (goalError) {
      setError(goalError?.message || "读取目标失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSummary(periodKey);
  }, [periodKey]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function saveGoal() {
    setSaving(true);
    setError("");
    try {
      const nextSummary = await window.wageApp.goals.save({
        periodKey,
        targetAmount: Number(form.targetAmount) || 0,
        targetWorkdays: Number(form.targetWorkdays) || 0,
        targetMinutes
      });
      setSummary(nextSummary);
      setForm(formFromSummary(nextSummary));
    } catch (goalError) {
      setError(goalError?.message || "保存目标失败");
    } finally {
      setSaving(false);
    }
  }

  async function resetGoal() {
    setSaving(true);
    setError("");
    try {
      const nextSummary = await window.wageApp.goals.reset(periodKey);
      setSummary(nextSummary);
      setForm(formFromSummary(nextSummary));
    } catch (goalError) {
      setError(goalError?.message || "重置目标失败");
    } finally {
      setSaving(false);
    }
  }

  const goal = summary?.goal;
  const totals = summary?.totals || {};
  const progress = summary?.progress || {};
  const status = summary?.status || { code: "normal", label: loading ? "读取中" : "正常" };
  const projectedIncome = summary?.projectedIncome ?? 0;

  return (
    <section className="module-panel goals-panel" aria-label="目标面板">
      <div className="settings-head">
        <div>
          <strong>目标</strong>
          <span>{periodKey} 收入与工时进度</span>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭目标">
          <ControlIcon src={controlCloseIcon} className="close-icon" />
        </button>
      </div>

      <div className="goals-toolbar">
        <label className="field">
          <span>月份</span>
          <DatePicker
            type="month"
            value={periodKey}
            ariaLabel="选择目标月份"
            onChange={setPeriodKey}
          />
        </label>
        <div className={`goal-status is-${status.code}`}>
          <span>状态</span>
          <strong>{status.label}</strong>
        </div>
      </div>

      <div className="goal-hero">
        <div>
          <span>目标完成率</span>
          <strong>{percentLabel(progress.amount)}</strong>
          <em>{goal?.isDefault ? "默认目标" : "自定义目标"}</em>
        </div>
        <div>
          <span>预计月底收入</span>
          <strong>{formatMoney(projectedIncome, privacyMode).replace("¥", "")}</strong>
          <em>预期进度 {percentLabel(progress.expected)}</em>
        </div>
      </div>

      <div className="goal-stats">
        <GoalStat
          label="月收入"
          value={formatMoney(totals.earnedAmount || 0, privacyMode).replace("¥", "")}
          subValue={`目标 ${formatMoney(goal?.targetAmount || 0, privacyMode).replace("¥", "")}`}
          progress={progress.amount}
          status={status.code}
        />
        <GoalStat
          label="月工时"
          value={minutesLabel(totals.workedMinutes || 0)}
          subValue={`目标 ${minutesLabel(goal?.targetMinutes || 0)}`}
          progress={progress.minutes}
        />
        <GoalStat
          label="工作日"
          value={`${totals.completedWorkdays || 0} 天`}
          subValue={`目标 ${(Number(goal?.targetWorkdays) || 0).toFixed(1)} 天`}
          progress={progress.workdays}
        />
      </div>

      <form className="goal-editor" onSubmit={(event) => {
        event.preventDefault();
        saveGoal();
      }}>
        <div className="goal-editor-grid">
          <label className="field">
            <span>收入目标</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.targetAmount}
              onChange={(event) => patchForm({ targetAmount: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>工时目标</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.targetHours}
              onChange={(event) => patchForm({ targetHours: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>工作日目标</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.targetWorkdays}
              onChange={(event) => patchForm({ targetWorkdays: Number(event.target.value) })}
            />
          </label>
        </div>

        {error ? <p className="record-error">{error}</p> : null}

        <div className="goal-actions">
          <button className="update-action goal-reset" type="button" disabled={saving} onClick={resetGoal}>
            使用默认
          </button>
          <button className="update-action record-save" type="submit" disabled={saving}>
            {saving ? "保存中" : "保存目标"}
          </button>
        </div>
      </form>
    </section>
  );
}
