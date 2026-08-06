import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ShieldAlert } from 'lucide-react'
import type { PermissionMode } from '@shared/ipc'
import { cn } from '@/lib/utils'

/**
 * Permission mode, as a proper menu.
 *
 * ## Why not a native `<select>`
 *
 * It was one before, and a bare `<select>` in a composer is wrong in three ways:
 * it renders as an OS widget that ignores the theme entirely, it shows the mode as
 * a bare word with no indication that the choice *matters*, and it gives no room to
 * say what each mode actually does. "No ask" and "Bypass" are not self-explanatory,
 * and they're the two you least want someone picking by accident.
 *
 * So: a chip that states the current mode, opening a menu where every option
 * carries a one-line description of what it permits.
 *
 * ## Why the risky modes look different
 *
 * `dontAsk` and `bypassPermissions` let the agent act on your machine without
 * stopping to ask. That is a real capability change, not a preference, so the chip
 * takes the warning hue and a shield the moment one is selected — visible from
 * across the room, in the row where you commit an instruction.
 */

type Option = { value: PermissionMode; label: string; hint: string; risky?: boolean }

const OPTIONS: Option[] = [
  { value: 'auto', label: 'Auto', hint: 'Decides per action; asks when it matters' },
  { value: 'default', label: 'Ask', hint: 'Prompts before every tool use' },
  { value: 'acceptEdits', label: 'Accept edits', hint: 'File edits go through; other tools ask' },
  { value: 'plan', label: 'Plan', hint: 'Reads and plans, changes nothing' },
  { value: 'dontAsk', label: 'Don’t ask', hint: 'Runs tools without prompting', risky: true },
  { value: 'bypassPermissions', label: 'Bypass', hint: 'Ignores all permission rules', risky: true },
]

export function PermissionMenu({
  value,
  disabled,
  onChange,
}: {
  value: PermissionMode
  disabled?: boolean
  onChange: (mode: PermissionMode) => void
}) {
  const current = OPTIONS.find((option) => option.value === value) ?? OPTIONS[0]!

  return (
    <SelectPrimitive.Root value={value} onValueChange={(next) => onChange(next as PermissionMode)}>
      <SelectPrimitive.Trigger
        disabled={disabled}
        aria-label={`Permission mode: ${current.label}`}
        title={current.hint}
        className={cn(
          'hand-sm-1 flex h-7 shrink-0 items-center gap-1 px-2 text-xs transition-colors',
          'disabled:pointer-events-none disabled:opacity-50',
          current.risky
            ? 'bg-warning/15 text-warning hover:bg-warning/25'
            : 'text-text-faint hover:bg-overlay hover:text-text-muted',
        )}
      >
        {current.risky ? <ShieldAlert size={12} className="shrink-0" aria-hidden /> : null}
        <SelectPrimitive.Value />
        <ChevronDown size={11} className="shrink-0 opacity-60" aria-hidden />
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          side="top"
          align="end"
          sideOffset={6}
          className="hand-1 z-50 w-72 overflow-hidden bg-overlay p-1 shadow-lg ring-1 ring-line"
        >
          <SelectPrimitive.Viewport>
            {OPTIONS.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className={cn(
                  'hand-sm-1 flex cursor-default select-none items-start gap-2 px-2 py-1.5 outline-none',
                  'data-[highlighted]:bg-raised',
                  option.risky ? 'text-warning' : 'text-text',
                )}
              >
                <span className="mt-0.5 w-3.5 shrink-0">
                  <SelectPrimitive.ItemIndicator>
                    <Check size={13} />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <span className="min-w-0">
                  <SelectPrimitive.ItemText>
                    <span className="text-sm">{option.label}</span>
                  </SelectPrimitive.ItemText>
                  {/* The whole reason this isn't a native select: "Bypass" means
                      nothing until it tells you what it bypasses. */}
                  <span className="mt-0.5 block text-xs leading-snug text-text-faint">
                    {option.hint}
                  </span>
                </span>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
