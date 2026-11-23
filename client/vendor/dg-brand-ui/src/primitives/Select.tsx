"use client";

import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { CheckIcon } from "../icons";
import { cx } from "../lib/cx";

const FIELD =
  "h-12 w-full rounded-full border border-line bg-card text-[1.05rem] text-fg transition hover:border-fg/40 disabled:cursor-not-allowed disabled:opacity-60";

function Chevron({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={cx("pointer-events-none absolute right-4 size-4 -translate-y-1/2 text-fg/70", className)}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A native select in the kit's pill field, with its own chevron (the browser's can't be padded).
 * Use for plain text options. For options with images, use ImageSelect.
 */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className={cx("relative", className)}>
      <select {...props} className={cx("peer appearance-none truncate pr-11 pl-4", FIELD)} />
      <Chevron className="top-1/2 peer-disabled:opacity-60" />
    </div>
  );
}

export type ImageOption = {
  value: string;
  label: string;
  /** A round image before the label, such as a flag. Decorative: the label names it. */
  image?: string;
  /** The option's language, so screen readers say a native name right ("Deutsch") */
  lang?: string;
};

export type ImageSelectProps = {
  options: ImageOption[];
  value: string;
  onChange: (value: string) => void;
  /** The id of the visible label, which names the button and the list */
  labelledBy: string;
  id?: string;
  disabled?: boolean;
  className?: string;
};

function OptionImage({ src }: { src?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className="size-6 shrink-0 rounded-full object-cover" /> : <span className="size-6 shrink-0" />;
}

/**
 * A select whose options show an image, such as the language picker's flags. A native select can't
 * show images, so this is the ARIA select-only combobox: arrow keys, Home, End, Enter, Space,
 * Escape, and type-to-jump all work, and focus stays on the button.
 */
export function ImageSelect({ options, value, onChange, labelledBy, id, disabled = false, className }: ImageSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const shown = open && !disabled;
  const optionId = (index: number) => `${listId}-${index}`;
  const names = useMemo(() => options.map((option) => option.label.toLocaleLowerCase()), [options]);

  // A press anywhere else closes the list
  useEffect(() => {
    if (!shown) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [shown]);

  // Keep the highlighted option in view as the keys move it
  useEffect(() => {
    if (shown) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  });

  const show = () => {
    setActive(selected);
    setOpen(true);
  };
  const choose = (index: number) => {
    setOpen(false);
    button.current?.focus();
    if (options[index].value !== value) onChange(options[index].value);
  };
  const jump = (key: string) => {
    const k = key.toLocaleLowerCase();
    for (let step = 1; step <= names.length; step++) {
      const index = (active + step) % names.length;
      if (names[index].startsWith(k)) return index;
    }
    return -1;
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!shown) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        show();
      }
      return;
    }
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(index + 1, last));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        // Mark it handled, so a Drawer around this closes only on the next Escape
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const index = jump(event.key);
          if (index >= 0) setActive(index);
        }
    }
  };

  const current = options[selected];
  return (
    <div ref={root} className={cx("relative", className)}>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-labelledby={labelledBy}
        aria-activedescendant={shown ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (shown ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cx("flex items-center gap-2.5 pr-11 pl-3 text-left", FIELD)}
      >
        <OptionImage src={current?.image} />
        <span className="truncate" lang={current?.lang}>
          {current?.label}
        </span>
      </button>
      <Chevron className={cx("top-6 transition-transform", shown && "rotate-180", disabled && "opacity-60")} />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelledBy}
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-10 mt-2 max-h-[26rem] overflow-y-auto rounded-[1.625rem] border border-line bg-card p-1.5 shadow-xl"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={index === selected}
              lang={option.lang}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={cx(
                "flex cursor-pointer items-center gap-2.5 rounded-full py-2 pr-3 pl-2 text-[1.05rem] text-fg",
                index === active && "bg-fg/[0.06]",
              )}
            >
              <OptionImage src={option.image} />
              <span className="flex-1 truncate">{option.label}</span>
              {index === selected && <CheckIcon className="size-4 shrink-0 text-fg/70" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
