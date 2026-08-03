import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

/**
 * Modal shell.
 *
 * Radix handles the three focus rules a dialog must satisfy — move focus in on
 * open, trap it while open, restore it to the trigger on close — plus the ARIA
 * wiring. `title` is required by the primitive for accessible naming, so every
 * call site is forced to supply one.
 *
 * Elevation, not outline, marks it as floating: a dimmed backdrop plus the
 * `overlay` fill and a shadow. Figure–ground separation is the dialog's whole job,
 * and that's what the backdrop is for.
 */
export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string
  description?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-4rem))] -translate-x-1/2 -translate-y-1/2',
          'max-h-[min(44rem,calc(100vh-8rem))] overflow-y-auto',
          'rounded-xl bg-overlay p-6 shadow-2xl',
          className,
        )}
        {...props}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-sm font-semibold text-text">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-xs text-text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <Button size="icon" variant="ghost" aria-label="Close">
              <X size={14} />
            </Button>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
