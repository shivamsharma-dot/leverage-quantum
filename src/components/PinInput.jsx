import { useState } from 'react'

// A PIN box that is deliberately NOT an <input type="password">.
//
// Two reasons. One, Chrome's password manager only offers to save and re-fill
// password fields, and the CEO PIN must never be saved by a browser, an
// extension or a shared profile - so this stays a text field and shouts that
// down with every opt-out flag the managers respect. Two, masking here is done
// in CSS, which replaces each real character with one dot, so the number of
// dots is always exactly the number of digits typed.
const CSS_MASK = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
  && CSS.supports('-webkit-text-security', 'disc')

let seq = 0

export default function PinInput({
  value, onChange, placeholder, maxLength = 12, className,
  inputStyle, wrapStyle, disabled, iconColor = '#8A94A6',
}) {
  const [show, setShow] = useState(false)
  const [uid] = useState(() => 'lq-pin-' + (++seq) + '-' + Math.random().toString(36).slice(2, 8))
  const masked = !show
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', ...wrapStyle }}>
      <input
        id={uid}
        name={uid}
        type={masked && !CSS_MASK ? 'password' : 'text'}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, maxLength))}
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        readOnly={false}
        className={className}
        style={{
          WebkitTextSecurity: masked && CSS_MASK ? 'disc' : 'none',
          paddingRight: 40,
          ...inputStyle,
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(v => !v)}
        aria-label={show ? 'Hide the PIN' : 'Show the PIN'}
        title={show ? 'Hide' : 'Show'}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, padding: 0, border: 'none', background: 'transparent',
          cursor: 'pointer', color: iconColor,
        }}
      >
        {show ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}
