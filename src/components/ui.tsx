import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-ink-400" />;
}

export function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Spinner size={32} />
      <p className="text-sm text-ink-500">{message}</p>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">Something went wrong</p>
          <p className="mt-1 text-sm text-red-600">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center animate-fade-in">
      {icon && <div className="text-ink-300">{icon}</div>}
      <div>
        <h3 className="text-lg font-medium text-ink-700">{title}</h3>
        <p className="mt-2 max-w-md text-sm text-ink-500">{description}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Badge({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'accent' | 'ocean' }) {
  const variants = {
    default: 'bg-ink-100 text-ink-600',
    accent: 'bg-accent-100 text-accent-700',
    ocean: 'bg-ocean-100 text-ocean-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}

export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
              i < current
                ? 'bg-accent-600 text-white'
                : i === current
                  ? 'bg-ink-900 text-ink-50'
                  : 'bg-ink-100 text-ink-400'
            }`}
          >
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`text-sm ${i <= current ? 'text-ink-700' : 'text-ink-400'}`}>{step}</span>
          {i < steps.length - 1 && <div className={`h-px w-8 ${i < current ? 'bg-accent-400' : 'bg-ink-200'}`} />}
        </div>
      ))}
    </div>
  );
}
