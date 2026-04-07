'use client';

import { Check, ShoppingCart } from 'lucide-react';
import Card from '@/components/Card';

const VARIANTS = {
  success: {
    border: 'border-green-500/50 bg-green-500/5',
    iconBg: 'bg-green-500/20',
    iconColor: 'text-green-500',
    titleColor: 'text-green-400',
    Icon: Check,
  },
  cancelled: {
    border: 'border-yellow-500/50 bg-yellow-500/5',
    iconBg: 'bg-yellow-500/20',
    iconColor: 'text-yellow-500',
    titleColor: 'text-yellow-400',
    Icon: ShoppingCart,
  },
  error: {
    border: 'border-red-500/50 bg-red-500/5',
    iconBg: 'bg-red-500/20',
    iconColor: 'text-red-500',
    titleColor: 'text-red-400',
    Icon: null,
  },
};

/**
 * Status alert for checkout flow (success, cancelled, error).
 * @param {'success' | 'cancelled' | 'error'} variant
 * @param {string} title
 * @param {string} message
 * @param {() => void} [onDismiss] - Optional dismiss handler (shows × button)
 */
export default function StatusAlert({ variant, title, message, onDismiss }) {
  const config = VARIANTS[variant] || VARIANTS.error;
  const { border, iconBg, iconColor, titleColor, Icon } = config;

  return (
    <Card className={`p-6 ${border}`}>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
          {Icon ? (
            <Icon className={`w-6 h-6 ${iconColor}`} />
          ) : (
            <span className={`${iconColor} text-xl font-bold`}>!</span>
          )}
        </div>
        <div className={onDismiss ? 'flex-1 min-w-0' : ''}>
          <h3 className={`font-bold text-lg ${titleColor}`}>{title}</h3>
          <p className="text-foreground/70 text-sm">{message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-auto text-foreground/50 hover:text-foreground shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </Card>
  );
}
