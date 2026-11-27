import React from 'react';

interface BarPoint {
  label: string;
  value: number;
  hint?: string;
}

export function SimpleBarChart({
  data,
  accentClass = 'bg-blue-600 dark:bg-blue-500',
  emptyLabel = 'No records yet',
}: {
  data: BarPoint[];
  accentClass?: string;
  emptyLabel?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);

  if (data.length === 0 || max === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const pct = Math.max(4, Math.round((item.value / max) * 100));
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-200 truncate pr-3">
                {item.label}
              </span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                {item.value}
                {item.hint ? ` ${item.hint}` : ''}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${accentClass}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FunnelChart({ stages }: { stages: Array<{ label: string; count: number }> }) {
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-2.5">
      {stages.map((stage, idx) => {
        const widthPct = stage.count === 0 ? 0 : Math.max(8, Math.round((stage.count / max) * 100));
        const colors = [
          'bg-slate-700 dark:bg-slate-500',
          'bg-blue-600 dark:bg-blue-500',
          'bg-indigo-600 dark:bg-indigo-500',
          'bg-violet-600 dark:bg-violet-500',
          'bg-emerald-600 dark:bg-emerald-500',
        ];
        return (
          <div key={stage.label} className="grid grid-cols-12 items-center gap-3 text-xs">
            <span className="col-span-4 text-slate-600 dark:text-slate-300 truncate">{stage.label}</span>
            <div className="col-span-6 h-5 rounded-md bg-slate-100 dark:bg-slate-800/80 overflow-hidden flex items-center">
              {widthPct > 0 && (
                <div
                  className={`h-full rounded-md ${colors[idx % colors.length]} transition-all duration-300`}
                  style={{ width: `${widthPct}%` }}
                />
              )}
            </div>
            <span className="col-span-2 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
              {stage.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ActivitySparkChart({ points }: { points: Array<{ label: string; leads: number; pitches: number }> }) {
  const maxVal = Math.max(...points.flatMap((p) => [p.leads, p.pitches]), 1);

  return (
    <div className="h-44 flex items-end justify-between gap-2 pt-4">
      {points.map((pt) => {
        const leadH = Math.round((pt.leads / maxVal) * 100);
        const pitchH = Math.round((pt.pitches / maxVal) * 100);
        return (
          <div key={pt.label} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full flex items-end justify-center gap-1 h-32">
              <div
                title={`${pt.leads} leads`}
                className="w-3 rounded-t-sm bg-blue-600 dark:bg-blue-500 transition-all"
                style={{ height: `${Math.max(4, leadH)}%` }}
              />
              <div
                title={`${pt.pitches} pitches`}
                className="w-3 rounded-t-sm bg-violet-600 dark:bg-violet-500 transition-all"
                style={{ height: `${Math.max(4, pitchH)}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {pt.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
