import { type ReactNode, useState } from 'react';
import { Loader2, ImageIcon, Check, AlertTriangle, Compass, Music, Film, BookOpen, MapPin, Gamepad2, Tv, Mic } from 'lucide-react';

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
    <div className="rounded-lg border border-error-200 bg-error-50 p-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-error-500" />
        <div className="flex-1">
          <p className="text-sm font-medium text-error-800">Something went wrong</p>
          <p className="mt-1 text-sm text-error-600">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm font-medium text-error-700 underline hover:text-error-800"
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

const badgeVariants = {
  default: 'bg-ink-100 text-ink-600',
  accent: 'bg-accent-100 text-accent-700',
  ocean: 'bg-ocean-100 text-ocean-700',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  error: 'bg-error-100 text-error-700',
} as const;

export function Badge({
  children,
  variant = 'default',
}: {
  children: ReactNode;
  variant?: keyof typeof badgeVariants;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeVariants[variant]}`}>
      {children}
    </span>
  );
}

export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-1.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
              i < current
                ? 'bg-accent-600 text-white'
                : i === current
                  ? 'bg-ink-900 text-ink-50 ring-4 ring-ink-100'
                  : 'bg-ink-100 text-ink-400'
            }`}
          >
            {i < current ? <Check size={14} /> : i + 1}
          </div>
          <span className={`text-sm transition-colors ${i === current ? 'font-medium text-ink-900' : i < current ? 'text-ink-700' : 'text-ink-400'}`}>
            {step}
          </span>
          {i < steps.length - 1 && (
            <div className={`h-px w-6 transition-colors duration-300 ${i < current ? 'bg-accent-400' : 'bg-ink-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

const CATEGORY_ICONS: Record<string, ReactNode> = {
  'urn:entity:place': <MapPin size={20} />,
  'urn:entity:music': <Music size={20} />,
  'urn:entity:artist': <Mic size={20} />,
  'urn:entity:movie': <Film size={20} />,
  'urn:entity:tv_show': <Tv size={20} />,
  'urn:entity:book': <BookOpen size={20} />,
  'urn:entity:game': <Gamepad2 size={20} />,
};

function getCategoryIcon(category?: string | null): ReactNode {
  if (!category) return <Compass size={20} />;
  return CATEGORY_ICONS[category] || <ImageIcon size={20} />;
}

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ImageWithFallback({
  src,
  alt,
  category,
  className,
  rounded = 'rounded-lg',
  iconSize = 24,
}: {
  src?: string | null;
  alt: string;
  category?: string | null;
  className?: string;
  rounded?: string;
  iconSize?: number;
}) {
  const [errored, setErrored] = useState(false);
  const validSrc = src && isValidImageUrl(src) && !errored;

  if (validSrc) {
    return (
      <div className={`relative overflow-hidden ${rounded} ${className || ''}`}>
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-ink-100 to-ink-200 ${rounded} ${className || ''}`}
      role="img"
      aria-label={alt}
    >
      <div className="text-ink-400" style={{ display: 'flex' }}>
        {getCategoryIcon(category)}
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton mb-4 h-40 w-full" />
      <div className="skeleton mb-2 h-5 w-3/4" />
      <div className="skeleton mb-4 h-4 w-1/2" />
      <div className="skeleton h-2 w-full rounded-full" />
    </div>
  );
}
