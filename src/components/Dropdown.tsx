import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import './Dropdown.css';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  id?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Extra trigger class to pick up the context style (for example, `select-control`). */
  className?: string;
}

// Instead of a native <select>: its dropdown is drawn by Chromium,
// and the app's rounding/palette cannot be applied to it.
export function Dropdown({
  id,
  value,
  options,
  onChange,
  disabled,
  placeholder,
  className,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="dropdown" ref={wrapRef}>
      <button
        id={id}
        type="button"
        role="combobox"
        className={className ? `dropdown-trigger ${className}` : 'dropdown-trigger'}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span className={current ? 'dropdown-value' : 'dropdown-value placeholder'}>
          {current?.label ?? placeholder ?? ''}
        </span>
        <ChevronDown size={14} className="dropdown-chevron" />
      </button>
      {open && (
        <div className="dropdown-popover" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`dropdown-row ${option.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
