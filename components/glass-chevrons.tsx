import { useId } from 'react';

// Стеклянная кнопка-«подушка» с двойной стрелкой: объём даёт градиент и тени, стрелки — две трубки со светом.
export function GlassChevrons({ size = 72 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <span className="glass-squircle" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 48 48" width="70%" height="70%" focusable="false">
        <defs>
          <linearGradient id={id + 'g'} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.55" stopColor="#e4dcff" />
            <stop offset="1" stopColor="#b9a6ff" />
          </linearGradient>
        </defs>
        <g className="glass-chevron glass-chevron-1">
          <path d="M10 12 L21 24 L10 36" stroke={`url(#${id}g)`} strokeWidth="7" />
          <path d="M10 12 L21 24 L10 36" stroke="#fff" strokeOpacity="0.85" strokeWidth="2" transform="translate(-0.8 -0.8)" />
        </g>
        <g className="glass-chevron glass-chevron-2">
          <path d="M27 12 L38 24 L27 36" stroke={`url(#${id}g)`} strokeWidth="7" />
          <path d="M27 12 L38 24 L27 36" stroke="#fff" strokeOpacity="0.85" strokeWidth="2" transform="translate(-0.8 -0.8)" />
        </g>
      </svg>
    </span>
  );
}

