"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WealthFutureTimelineCalendarProps = {
  eventDateKeys: Set<string>;
  maxDate: Date;
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
  today: Date;
};

type CalendarCell = {
  date: Date | null;
  key: string;
};

type CalendarPickerOption = {
  label: string;
  value: number;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function WealthFutureTimelineCalendar({
  selectedDate,
  today,
  maxDate,
  eventDateKeys,
  onSelectDate,
}: WealthFutureTimelineCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate));

  useEffect(() => {
    setViewMonth(startOfMonth(selectedDate));
  }, [selectedDate]);

  const cells = useMemo(() => buildCalendarCells(viewMonth), [viewMonth]);
  const yearOptions = useMemo(() => buildYearOptions(today, maxDate), [maxDate, today]);
  const monthOptions = useMemo(
    () => MONTH_LABELS.map((label, index) => ({ label, value: index })),
    [],
  );
  const canGoPrevMonth = startOfMonth(viewMonth) > startOfMonth(today);
  const canGoNextMonth = endOfMonth(viewMonth) < endOfMonth(maxDate);
  const canGoPrevYear = viewMonth.getFullYear() > today.getFullYear();
  const canGoNextYear = viewMonth.getFullYear() < maxDate.getFullYear();

  const setYear = (year: number) => {
    const month = Math.min(viewMonth.getMonth(), 11);
    const nextMonth = clampMonthYear(month, year, today, maxDate);
    setViewMonth(nextMonth);
  };

  const setMonth = (month: number) => {
    setViewMonth(clampMonthYear(month, viewMonth.getFullYear(), today, maxDate));
  };

  return (
    <div className="wealth-future-calendar" aria-label="Future timeline calendar">
      <div className="wealth-future-calendar-head">
        <div>
          <p className="eyebrow">Timeline Calendar</p>
          <strong>{viewMonth.toLocaleDateString("en-BD", { month: "long", year: "numeric" })}</strong>
        </div>
      </div>

      <div className="wealth-future-calendar-controls">
        <div className="wealth-future-calendar-jump">
          <button
            aria-label="Previous year"
            className="wealth-future-calendar-step"
            disabled={!canGoPrevYear}
            onClick={() => setYear(viewMonth.getFullYear() - 1)}
            type="button"
          >
            «
          </button>
          <CalendarPicker
            ariaLabel="Select year"
            onChange={setYear}
            options={yearOptions.map((year) => ({ label: String(year), value: year }))}
            value={viewMonth.getFullYear()}
          />
          <button
            aria-label="Next year"
            className="wealth-future-calendar-step"
            disabled={!canGoNextYear}
            onClick={() => setYear(viewMonth.getFullYear() + 1)}
            type="button"
          >
            »
          </button>
        </div>

        <div className="wealth-future-calendar-jump">
          <button
            aria-label="Previous month"
            className="wealth-future-calendar-step"
            disabled={!canGoPrevMonth}
            onClick={() => setViewMonth(addMonths(viewMonth, -1))}
            type="button"
          >
            ‹
          </button>
          <CalendarPicker
            ariaLabel="Select month"
            onChange={setMonth}
            options={monthOptions}
            value={viewMonth.getMonth()}
          />
          <button
            aria-label="Next month"
            className="wealth-future-calendar-step"
            disabled={!canGoNextMonth}
            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            type="button"
          >
            ›
          </button>
        </div>
      </div>

      <div className="wealth-future-calendar-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="wealth-future-calendar-grid" role="grid">
        {cells.map((cell) => {
          if (!cell.date) {
            return <span className="wealth-future-calendar-day wealth-future-calendar-day-empty" key={cell.key} />;
          }

          const disabled = isDateDisabled(cell.date, today, maxDate);
          const selected = isSameDay(cell.date, selectedDate);
          const isToday = isSameDay(cell.date, today);
          const hasEvent = eventDateKeys.has(toDateKey(cell.date));

          return (
            <button
              aria-label={`${formatCalendarDayLabel(cell.date)}${hasEvent ? ", financial event" : ""}`}
              aria-pressed={selected}
              className={[
                "wealth-future-calendar-day",
                selected ? "wealth-future-calendar-day-selected" : "",
                isToday ? "wealth-future-calendar-day-today" : "",
                hasEvent ? "wealth-future-calendar-day-event" : "",
                disabled ? "wealth-future-calendar-day-disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={disabled}
              key={cell.key}
              onClick={() => onSelectDate(cell.date!)}
              type="button"
            >
              <span>{cell.date.getDate()}</span>
              {hasEvent ? <i aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <div className="wealth-future-calendar-legend">
        <span>
          <i className="wealth-future-calendar-legend-selected" />
          Selected
        </span>
        <span>
          <i className="wealth-future-calendar-legend-event" />
          Money event
        </span>
      </div>
    </div>
  );
}

function CalendarPicker({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  onChange: (value: number) => void;
  options: CalendarPickerOption[];
  value: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? String(value);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className={`wealth-future-calendar-picker ${isOpen ? "wealth-future-calendar-picker-open" : ""}`} ref={shellRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="wealth-future-calendar-picker-trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {selectedLabel}
        <span aria-hidden="true">▾</span>
      </button>
      {isOpen ? (
        <ul aria-label={ariaLabel} className="wealth-future-calendar-picker-menu" role="listbox">
          {options.map((option) => (
            <li key={option.value}>
              <button
                aria-selected={option.value === value}
                className={option.value === value ? "wealth-future-calendar-picker-option-active" : ""}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                role="option"
                type="button"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function buildYearOptions(today: Date, maxDate: Date) {
  const years: number[] = [];
  for (let year = today.getFullYear(); year <= maxDate.getFullYear(); year += 1) {
    years.push(year);
  }
  return years;
}

function clampMonthYear(month: number, year: number, today: Date, maxDate: Date) {
  let candidate = startOfMonth(new Date(year, month, 1));
  if (candidate < startOfMonth(today)) {
    candidate = startOfMonth(today);
  }
  if (candidate > startOfMonth(maxDate)) {
    candidate = startOfMonth(maxDate);
  }
  return candidate;
}

function buildCalendarCells(viewMonth: Date): CalendarCell[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ date: null, key: `pad-${index}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = startOfDay(new Date(year, month, day));
    cells.push({ date, key: toDateKey(date) });
  }

  return cells;
}

function isDateDisabled(date: Date, today: Date, maxDate: Date) {
  return date < today || date > maxDate;
}

function isSameDay(left: Date, right: Date) {
  return toDateKey(left) === toDateKey(right);
}

function formatCalendarDayLabel(date: Date) {
  return date.toLocaleDateString("en-BD", { day: "numeric", month: "long", year: "numeric" });
}

function startOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function startOfMonth(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonth(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return startOfMonth(nextDate);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
