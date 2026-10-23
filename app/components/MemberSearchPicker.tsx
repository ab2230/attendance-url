"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MemberPickerOption = {
  id: string;
  label: string;
  disabled?: boolean;
  sublabel?: string;
};

type Props = {
  options: MemberPickerOption[];
  value: string;
  onChange: (memberId: string) => void;
  placeholder?: string;
  label?: string;
};

function normalizeQuery(q: string) {
  return q.trim().toLowerCase();
}

export default function MemberSearchPicker({
  options,
  value,
  onChange,
  placeholder = "Search your name…",
  label = "I am",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const nq = normalizeQuery(query);
    if (!nq) return options;
    return options.filter((o) => o.label.toLowerCase().includes(nq));
  }, [options, query]);

  useEffect(() => {
    if (selected && !open) {
      setQuery(selected.label);
    }
    if (!selected && !open) {
      setQuery("");
    }
  }, [selected, open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pick = (option: MemberPickerOption) => {
    if (option.disabled) return;
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <div className="relative">
        <input
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value.trim()) onChange("");
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-zinc-300 bg-white py-3 pl-4 pr-10 text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 [color-scheme:light]"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
          ▾
        </span>
      </div>

      {open && (
        <ul
          className="max-h-64 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-md"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-zinc-500">No names match your search.</li>
          ) : (
            filtered.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={option.disabled}
                  onClick={() => pick(option)}
                  className={`flex w-full flex-col items-start px-4 py-2.5 text-left text-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 ${
                    value === option.id ? "bg-amber-100 font-medium text-zinc-900" : "text-zinc-800"
                  }`}
                >
                  <span>{option.label}</span>
                  {option.disabled ? (
                    <span className="text-xs text-zinc-500">Already marked present</span>
                  ) : option.sublabel ? (
                    <span className="text-xs text-zinc-500">{option.sublabel}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {selected ? (
        <p className="text-xs text-zinc-600">
          Selected: <span className="font-medium text-zinc-900">{selected.label}</span>
        </p>
      ) : null}
    </div>
  );
}
