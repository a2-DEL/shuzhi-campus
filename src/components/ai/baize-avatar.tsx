import type { CSSProperties } from 'react'

export type BaizeMood = 'calm' | 'busy' | 'alert' | 'focus' | 'success' | 'offline'

interface BaizeAvatarProps {
  mood?: BaizeMood
  size?: number
  showThreads?: boolean
  threadCount?: number
  className?: string
  interactive?: boolean
  onClick?: () => void
}

const MOOD_LABELS: Record<BaizeMood, string> = {
  calm: '\u5b81\u9759\u767d',
  busy: '\u954f\u91d1\u7ea2\u00b7\u5e76\u884c\u8c03\u5ea6',
  alert: '\u8b66\u6212\u7ea2\u00b7\u9700\u8981\u4eba\u5de5\u88c1\u51b3',
  focus: '\u58a8\u97f5\u9ed1\u00b7\u4e13\u6ce8\u6a21\u5f0f',
  success: '\u6d41\u91d1\u7eff\u00b7\u5df2\u9a8c\u8bc1',
  offline: '\u4f11\u7720\u7070\u00b7\u7b49\u5f85\u5524\u9192',
}

const THREADS = [
  { x: 208, y: 54, label: '\u7075\u9e4a' },
  { x: 221, y: 108, label: '\u58f9\u9f9f' },
  { x: 204, y: 166, label: '\u72f4\u8c78' },
  { x: 34, y: 54, label: '\u5206\u6790' },
]

export function BaizeAvatar({
  mood = 'calm',
  size = 180,
  showThreads = false,
  threadCount = 3,
  className = '',
  interactive = false,
  onClick,
}: BaizeAvatarProps) {
  const style = { '--baize-size': `${size}px` } as CSSProperties
  const threads = THREADS.slice(0, Math.max(0, Math.min(threadCount, THREADS.length)))
  const Component = interactive ? 'button' : 'div'

  return (
    <Component
      type={interactive ? 'button' : undefined}
      className={`baize-avatar baize-avatar--${mood} ${interactive ? 'baize-avatar--interactive' : ''} ${showThreads ? 'baize-avatar--threads' : ''} ${className}`}
      style={style}
      onClick={onClick}
      aria-label={`${'\u767d\u6cfd'} \u00b7 ${MOOD_LABELS[mood]}`}
      title={`${'\u767d\u6cfd'} \u00b7 ${MOOD_LABELS[mood]}`}
    >
      <svg className="baize-avatar__svg" viewBox="0 0 240 220" role="img" aria-hidden="true">
        <defs>
          <radialGradient id="baize-body" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor="var(--baize-body-hi)" />
            <stop offset="52%" stopColor="var(--baize-body-mid)" />
            <stop offset="100%" stopColor="var(--baize-body-low)" />
          </radialGradient>
          <linearGradient id="baize-gold" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--baize-gold-hi)" />
            <stop offset="45%" stopColor="var(--baize-gold-mid)" />
            <stop offset="100%" stopColor="var(--baize-gold-low)" />
          </linearGradient>
          <linearGradient id="baize-ink" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--baize-ink-hi)" />
            <stop offset="100%" stopColor="var(--baize-ink-low)" />
          </linearGradient>
          <filter id="baize-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="baize-soft-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <pattern id="baize-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="var(--baize-grid)" strokeWidth="0.55" />
          </pattern>
        </defs>

        <ellipse className="baize-avatar__halo" cx="120" cy="112" rx="92" ry="86" />
        <ellipse className="baize-avatar__grid" cx="120" cy="112" rx="76" ry="70" fill="url(#baize-grid)" />

        {showThreads && threads.map((thread, index) => (
          <g className="baize-avatar__thread" key={thread.label} style={{ '--thread-index': index } as CSSProperties}>
            <path d={`M${thread.x > 120 ? 159 : 81} 125 Q 177 ${thread.y} ${thread.x} ${thread.y}`} />
            <circle cx={thread.x} cy={thread.y} r="7" />
            <circle className="baize-avatar__thread-core" cx={thread.x} cy={thread.y} r="2.2" />
            <text x={thread.x} y={thread.y - 12} textAnchor="middle">{thread.label}</text>
          </g>
        ))}

        <g className="baize-avatar__tail" filter="url(#baize-glow)">
          <path d="M156 151 C195 151 201 177 181 188 C168 195 176 204 193 198" />
          <path d="M187 193 l16 8 -13 7" />
          <path d="M180 189 l12 -8 4 11" />
        </g>

        <g className="baize-avatar__fins">
          <path d="M69 126 C45 113 34 94 40 69 C57 79 72 92 81 111Z" />
          <path d="M170 123 C195 111 207 91 201 67 C184 78 170 93 160 112Z" />
          <path d="M83 151 C66 162 58 178 62 194 C78 186 90 174 98 158Z" />
          <path d="M157 150 C176 160 183 177 178 194 C164 186 151 173 143 158Z" />
        </g>

        <g className="baize-avatar__body" filter="url(#baize-glow)">
          <path className="baize-avatar__body-fill" d="M73 104 C76 73 101 56 130 61 C159 66 177 91 170 127 C166 151 147 169 119 170 C90 170 67 146 73 104Z" />
          <path className="baize-avatar__sash" d="M78 129 C102 142 143 141 166 126" />
          <path className="baize-avatar__sash-line" d="M82 137 C105 149 141 148 161 136" />
          <path className="baize-avatar__data" d="M95 84 C112 96 105 116 123 124 C140 132 136 150 149 157" />
          <path className="baize-avatar__data baize-avatar__data--second" d="M139 76 C125 91 138 104 129 113 C119 123 116 143 103 157" />
          <path className="baize-avatar__spine" d="M102 69 C111 78 129 78 140 69 M91 79 C104 87 134 87 153 78 M83 94 C106 103 147 101 163 91" />
        </g>

        <g className="baize-avatar__head" filter="url(#baize-glow)">
          <path className="baize-avatar__ear baize-avatar__ear--left" d="M80 88 C59 77 56 57 67 42 C80 51 89 66 91 79Z" />
          <path className="baize-avatar__ear baize-avatar__ear--right" d="M157 87 C180 77 184 56 173 42 C160 51 151 66 149 79Z" />
          <path className="baize-avatar__horn baize-avatar__horn--left" d="M89 70 C75 47 79 25 96 13 C101 33 99 53 105 69Z" />
          <path className="baize-avatar__horn baize-avatar__horn--right" d="M136 69 C143 50 145 30 161 15 C166 38 159 57 151 73Z" />
          <path className="baize-avatar__face" d="M83 82 C96 61 141 58 157 82 C169 101 159 125 137 134 C118 142 94 136 83 119 C76 108 76 94 83 82Z" />
          <path className="baize-avatar__brow" d="M93 93 Q105 85 115 92 M126 92 Q139 85 149 94" />
          <path className="baize-avatar__eye" d="M117 92 C110 102 111 117 120 126 C129 117 130 102 123 92 C122 90 119 90 117 92Z" />
          <ellipse className="baize-avatar__pupil" cx="120" cy="107" rx="3" ry="12" />
          <path className="baize-avatar__eye-rays" d="M120 84V77 M108 88l-5-7 M132 88l5-7 M103 101l-8-2 M137 101l8-2" />
          <path className="baize-avatar__muzzle" d="M105 123 Q120 132 135 123 Q130 142 120 145 Q110 142 105 123Z" />
          <path className="baize-avatar__mouth" d="M113 133 Q120 137 127 133" />
          <circle className="baize-avatar__gem" cx="120" cy="73" r="4" />
        </g>

        <g className="baize-avatar__whiskers">
          <path d="M91 119 C74 115 65 119 55 126 M92 124 C75 125 67 132 58 141 M149 119 C166 115 175 119 185 126 M148 124 C165 125 173 132 182 141" />
        </g>
      </svg>
      <span className="baize-avatar__status" aria-hidden="true" />
    </Component>
  )
}

export function baizeMoodLabel(mood: BaizeMood): string {
  return MOOD_LABELS[mood]
}
