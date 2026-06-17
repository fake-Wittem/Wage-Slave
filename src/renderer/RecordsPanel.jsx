import { useEffect, useMemo, useState } from "react";
import controlCloseIcon from "../assets/control-close.png";
import controlDownloadIcon from "../assets/control-download.png";
import { ControlIcon, CustomSelect, DatePicker, TimePicker } from "./controls.jsx";
import { formatMoney } from "./salary.js";

const workdayOptions = [
  { value: "workday", label: "工作日" },
  { value: "rest", label: "休息日" },
  { value: "leave", label: "请假" },
  { value: "overtime", label: "加班" },
  { value: "makeup", label: "调休补班" },
  { value: "holiday", label: "节假日" }
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey() {
  return todayKey().slice(0, 7);
}

function emptyForm(config) {
  return {
    date: todayKey(),
    workdayType: "workday",
    workStart: config.workStart || "09:00",
    workEnd: config.workEnd || "18:00",
    breakStart: config.breakStart || "12:00",
    breakEnd: config.breakEnd || "13:30",
    workedMinutes: 0,
    note: ""
  };
}

function formFromRecord(record, config) {
  if (!record) {
    return emptyForm(config);
  }

  return {
    date: record.date,
    workdayType: record.workdayType || "workday",
    workStart: record.workStart || config.workStart || "09:00",
    workEnd: record.workEnd || config.workEnd || "18:00",
    breakStart: record.breakStart || config.breakStart || "12:00",
    breakEnd: record.breakEnd || config.breakEnd || "13:30",
    workedMinutes: record.workedMinutes || 0,
    note: record.note || ""
  };
}

function minutesLabel(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return `${hours}小时${String(rest).padStart(2, "0")}分`;
}

function RecordRow({ record, selected, privacyMode, onSelect }) {
  const option = workdayOptions.find((item) => item.value === record.workdayType);
  return (
    <button
      className={`record-row ${selected ? "is-selected" : ""} ${record.manualLock ? "is-manual" : ""}`}
      type="button"
      onClick={() => onSelect(record)}
    >
      <span>
        <strong>{record.date.slice(5)}</strong>
        <em>{option?.label || record.workdayType}</em>
      </span>
      <span>
        <strong>{minutesLabel(record.workedMinutes)}</strong>
        <em>{record.manualLock ? "已修正" : "自动"}</em>
      </span>
      <span>
        <strong>{formatMoney(record.earnedAmount, privacyMode).replace("¥", "")}</strong>
        <em>{record.salaryMode === "daily" ? "日薪" : "月薪"}</em>
      </span>
    </button>
  );
}

export function RecordsPanel({ config, privacyMode, onClose }) {
  const [periodKey, setPeriodKey] = useState(monthKey());
  const [records, setRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [form, setForm] = useState(() => emptyForm(config));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedRecord = useMemo(
    () => records.find((record) => record.date === selectedDate) || null,
    [records, selectedDate]
  );

  async function refreshRecords(nextPeriodKey = periodKey) {
    if (!window.wageApp?.records?.listMonth) {
      setError("记录服务不可用");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await window.wageApp.records.autoSaveToday?.();
      const nextRecords = await window.wageApp.records.listMonth(nextPeriodKey);
      setRecords(nextRecords);
      const nextSelected = nextRecords.find((record) => record.date === selectedDate) || nextRecords[0] || null;
      if (nextSelected) {
        setSelectedDate(nextSelected.date);
        setForm(formFromRecord(nextSelected, config));
      } else {
        setForm({ ...emptyForm(config), date: `${nextPeriodKey}-01` });
      }
    } catch (recordError) {
      setError(recordError?.message || "读取记录失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshRecords(periodKey);
  }, [periodKey]);

  useEffect(() => {
    if (selectedRecord) {
      setForm(formFromRecord(selectedRecord, config));
    }
  }, [selectedRecord, config]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function saveRecord() {
    setSaving(true);
    setError("");
    try {
      const saved = await window.wageApp.records.saveManual(form);
      const nextPeriodKey = saved.date.slice(0, 7);
      setSelectedDate(saved.date);
      if (nextPeriodKey !== periodKey) {
        setPeriodKey(nextPeriodKey);
      } else {
        await refreshRecords(nextPeriodKey);
      }
    } catch (recordError) {
      setError(recordError?.message || "保存记录失败");
    } finally {
      setSaving(false);
    }
  }

  async function exportRecords(format) {
    setError("");
    try {
      const payload = await window.wageApp.records.exportMonth(periodKey, format);
      const blob = new Blob([payload.content], { type: payload.mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (recordError) {
      setError(recordError?.message || "导出记录失败");
    }
  }

  return (
    <section className="module-panel records-panel" aria-label="记录面板">
      <div className="settings-head">
        <div>
          <strong>记录</strong>
          <span>{periodKey} 工时与工资流水</span>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭记录">
          <ControlIcon src={controlCloseIcon} className="close-icon" />
        </button>
      </div>

      <div className="records-toolbar">
        <label className="field">
          <span>月份</span>
          <DatePicker
            type="month"
            value={periodKey}
            ariaLabel="select record month"
            onChange={setPeriodKey}
          />
        </label>
        <button className="update-action records-export-action" type="button" onClick={() => exportRecords("csv")}>
          <ControlIcon src={controlDownloadIcon} className="download-icon" />
          <span>CSV</span>
        </button>
        <button className="update-action records-export-action" type="button" onClick={() => exportRecords("json")}>
          <ControlIcon src={controlDownloadIcon} className="download-icon" />
          <span>JSON</span>
        </button>
      </div>

      <div className="records-layout">
        <div className="records-list" aria-label="本月记录列表">
          {records.length ? records.map((record) => (
            <RecordRow
              key={record.date}
              record={record}
              selected={record.date === selectedDate}
              privacyMode={privacyMode}
              onSelect={(nextRecord) => {
                setSelectedDate(nextRecord.date);
                setForm(formFromRecord(nextRecord, config));
              }}
            />
          )) : (
            <div className="empty-records">{loading ? "正在读取" : "本月暂无记录"}</div>
          )}
        </div>

        <form className="record-editor" onSubmit={(event) => {
          event.preventDefault();
          saveRecord();
        }}>
          <div className="record-editor-grid">
            <label className="field">
              <span>日期</span>
              <DatePicker
                type="date"
                value={form.date}
                ariaLabel="select record date"
                onChange={(value) => patchForm({ date: value })}
              />
            </label>
            <label className="field">
              <span>类型</span>
              <CustomSelect
                value={form.workdayType}
                ariaLabel="select record type"
                options={workdayOptions}
                onChange={(value) => patchForm({ workdayType: value })}
              />
            </label>
            <label className="field">
              <span>上班</span>
              <TimePicker
                value={form.workStart}
                ariaLabel="select record work start"
                onChange={(value) => patchForm({ workStart: value })}
              />
            </label>
            <label className="field">
              <span>下班</span>
              <TimePicker
                value={form.workEnd}
                ariaLabel="select record work end"
                onChange={(value) => patchForm({ workEnd: value })}
              />
            </label>
            <label className="field">
              <span>午休开始</span>
              <TimePicker
                value={form.breakStart}
                ariaLabel="select record break start"
                onChange={(value) => patchForm({ breakStart: value })}
              />
            </label>
            <label className="field">
              <span>午休结束</span>
              <TimePicker
                value={form.breakEnd}
                ariaLabel="select record break end"
                onChange={(value) => patchForm({ breakEnd: value })}
              />
            </label>
            <label className="field record-minutes">
              <span>工时分钟</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.workedMinutes}
                onChange={(event) => patchForm({ workedMinutes: Number(event.target.value) })}
              />
            </label>
          </div>

          <label className="field record-note">
            <span>备注</span>
            <textarea value={form.note} onChange={(event) => patchForm({ note: event.target.value })} />
          </label>

          {error ? <p className="record-error">{error}</p> : null}

          <div className="record-actions">
            <div className="record-summary">
            <span>{selectedRecord?.manualLock ? "手动修正优先" : "自动记录"}</span>
            <strong>{selectedRecord ? formatMoney(selectedRecord.earnedAmount, privacyMode).replace("¥", "") : "--"}</strong>
            </div>

            <button className="update-action record-save" type="submit" disabled={saving}>
            {saving ? "保存中" : "保存修正"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
