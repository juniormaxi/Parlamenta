import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  icon?: LucideIcon;
  variant?: 'default' | 'alert' | 'warning' | 'success';
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtext,
  trend,
  icon: Icon,
  variant = 'default',
  onClick,
}) => {
  const getAccentBorder = () => {
    switch (variant) {
      case 'alert':
        return 'border-rose-200 hover:border-rose-300 bg-white';
      case 'warning':
        return 'border-amber-200 hover:border-amber-300 bg-white';
      case 'success':
        return 'border-emerald-200 hover:border-emerald-300 bg-white';
      default:
        return 'border-slate-200 hover:border-slate-300 bg-white';
    }
  };

  const getValueColor = () => {
    switch (variant) {
      case 'alert':
        return 'text-rose-700';
      case 'warning':
        return 'text-amber-700';
      case 'success':
        return 'text-emerald-700';
      default:
        return 'text-[#102C45]';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border transition-all duration-150 ${getAccentBorder()} ${
        onClick ? 'cursor-pointer shadow-xs hover:shadow-sm' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          {label}
        </span>
        {Icon && (
          <span className="p-1.5 rounded-lg bg-slate-50 text-slate-500">
            <Icon className="w-4 h-4" />
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${getValueColor()}`}>
          {value}
        </span>
      </div>

      {(subtext || trend) && (
        <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
          {trend && (
            <span
              className={`font-mono font-medium ${
                trend.isPositive ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {trend.value}
            </span>
          )}
          {trend?.label && <span>{trend.label}</span>}
          {subtext && !trend && <span>{subtext}</span>}
        </div>
      )}
    </div>
  );
};
