import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import controlCalendarIcon from "../assets/control-calendar.png";
import controlCheckIcon from "../assets/control-check.png";
import controlChevronDownIcon from "../assets/control-chevron-down.png";

export function ControlIcon({ src, className = "" }) {
  return <img className={`control-icon ${className}`.trim()} src={src} alt="" aria-hidden="true" />;
}

function useFloatingMenu(open, triggerRef, { align = "start", matchTriggerWidth = false, menuWidth = null } = {}) {
  const menuRef = useRef(null);
  const [style, setStyle] = useState({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    let frameId = 0;

    function updatePosition() {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const resolvedWidth = matchTriggerWidth ? triggerRect.width : (menuWidth || menu?.offsetWidth || triggerRect.width);
      const minGap = 8;
      const rawLeft = align === "end" ? triggerRect.right - resolvedWidth : triggerRect.left;
      const maxLeft = Math.max(minGap, window.innerWidth - resolvedWidth - minGap);
      const left = Math.min(Math.max(minGap, rawLeft), maxLeft);

      setStyle({
        position: "fixed",
        top: `${triggerRect.bottom + 6}px`,
        left: `${left}px`,
        width: matchTriggerWidth ? `${triggerRect.width}px` : undefined,
        visibility: "visible"
      });
    }

    function scheduleUpdate() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updatePosition);
    }

    updatePosition();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [align, matchTriggerWidth, menuWidth, open, triggerRef]);

  return { menuRef, style };
}

function useFloatingMenuDismiss(open, setOpen, triggerRef, menuRef) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function isInside(element, target) {
      return element && target instanceof Node && element.contains(target);
    }

    function handlePointerDown(event) {
      if (isInside(triggerRef.current, event.target) || isInside(menuRef.current, event.target)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuRef, open, setOpen, triggerRef]);
}

export function CustomSelect({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menu = useFloatingMenu(open, triggerRef, { matchTriggerWidth: true });
  useFloatingMenuDismiss(open, setOpen, triggerRef, menu.menuRef);
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div className="custom-select" onBlur={() => setOpen(false)}>
      <button
        className={`control-button ${open ? "is-open" : ""}`}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        ref={triggerRef}
        onClick={() => setOpen((next) => !next)}
      >
        <span>{selected.label}</span>
        <ControlIcon src={controlChevronDownIcon} className="chevron-icon" />
      </button>
      {open ? createPortal(
        <div className="select-menu floating-menu" role="listbox" ref={menu.menuRef} style={menu.style}>
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
              {option.value === value ? <ControlIcon src={controlCheckIcon} className="check-icon" /> : null}
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function formatDateValue(value, type) {
  if (!value) {
    return type === "month" ? "----/--" : "----/--/--";
  }

  return String(value).replaceAll("-", "/");
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function parseDateValue(value, type) {
  const fallback = new Date();
  const parts = String(value || "").split("-").map((part) => Number(part));
  const year = Number.isFinite(parts[0]) && parts[0] > 0 ? parts[0] : fallback.getFullYear();
  const month = Number.isFinite(parts[1]) && parts[1] >= 1 && parts[1] <= 12 ? parts[1] : fallback.getMonth() + 1;
  const day = type === "month" ? 1 : (Number.isFinite(parts[2]) && parts[2] >= 1 ? parts[2] : fallback.getDate());

  return { year, month, day };
}

function formatDateSelection(year, month, day, type) {
  const monthText = padDatePart(month);
  if (type === "month") {
    return `${year}-${monthText}`;
  }

  return `${year}-${monthText}-${padDatePart(day)}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function sameDate(value, year, month, day, type) {
  return value === formatDateSelection(year, month, day, type);
}

export function DatePicker({ type = "date", value, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menu = useFloatingMenu(open, triggerRef, { menuWidth: type === "month" ? 206 : 248 });
  useFloatingMenuDismiss(open, setOpen, triggerRef, menu.menuRef);
  const [{ year, month }, setView] = useState(() => parseDateValue(value, type));
  const parsed = parseDateValue(value, type);
  const monthLabels = Array.from({ length: 12 }, (_, index) => index + 1);
  const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const firstDayOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const dateCells = [
    ...Array.from({ length: firstDayOffset }, (_, index) => ({ key: `empty-${index}`, day: null })),
    ...Array.from({ length: daysInMonth(year, month) }, (_, index) => ({ key: `day-${index + 1}`, day: index + 1 }))
  ];

  useEffect(() => {
    setView(parseDateValue(value, type));
  }, [value, type]);

  function moveMonth(delta) {
    setView((current) => {
      const next = new Date(current.year, current.month - 1 + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });
  }

  return (
    <div className="date-picker" onBlur={() => setOpen(false)}>
      <button
        className={`control-button date-trigger ${open ? "is-open" : ""}`}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        ref={triggerRef}
        onClick={() => setOpen((next) => !next)}
      >
        <span>{formatDateValue(value, type)}</span>
        <ControlIcon src={controlCalendarIcon} className="date-icon" />
      </button>
      {open ? createPortal(
        <div
          className={`date-menu floating-menu ${type === "month" ? "month-menu" : ""}`}
          role="dialog"
          aria-label={ariaLabel}
          ref={menu.menuRef}
          style={menu.style}
        >
          <div className="date-menu-head">
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => (type === "month" ? setView((current) => ({ ...current, year: current.year - 1 })) : moveMonth(-1))}>
              <span aria-hidden="true">&lt;</span>
            </button>
            <strong>{type === "month" ? year : `${year}/${padDatePart(month)}`}</strong>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => (type === "month" ? setView((current) => ({ ...current, year: current.year + 1 })) : moveMonth(1))}>
              <span aria-hidden="true">&gt;</span>
            </button>
          </div>

          {type === "month" ? (
            <div className="month-grid">
              {monthLabels.map((item) => (
                <button
                  className={sameDate(value, year, item, 1, "month") ? "is-selected" : ""}
                  type="button"
                  key={item}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(formatDateSelection(year, item, 1, "month"));
                    setOpen(false);
                  }}
                >
                  {padDatePart(item)}
                </button>
              ))}
            </div>
          ) : (
            <div className="date-grid">
              {weekLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
              {dateCells.map((cell) => (
                cell.day ? (
                  <button
                    className={sameDate(value, year, month, cell.day, "date") ? "is-selected" : ""}
                    type="button"
                    key={cell.key}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(formatDateSelection(year, month, cell.day, "date"));
                      setOpen(false);
                    }}
                  >
                    {cell.day}
                  </button>
                ) : (
                  <i key={cell.key} aria-hidden="true" />
                )
              ))}
            </div>
          )}
        </div>,
        document.body
      ) : null}
    </div>
  );
}

export function TimePicker({ value, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menu = useFloatingMenu(open, triggerRef, { menuWidth: 176 });
  useFloatingMenuDismiss(open, setOpen, triggerRef, menu.menuRef);
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
        ref={triggerRef}
        onClick={() => setOpen((next) => !next)}
      >
        <span>{hour}</span>
        <b>:</b>
        <span>{minute}</span>
        <ControlIcon src={controlChevronDownIcon} className="chevron-icon" />
      </button>
      {open ? createPortal(
        <div className="time-menu floating-menu" role="dialog" aria-label={ariaLabel} ref={menu.menuRef} style={menu.style}>
          <div className="time-column">
            <strong>HH</strong>
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
            <strong>MM</strong>
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
        </div>,
        document.body
      ) : null}
    </div>
  );
}
