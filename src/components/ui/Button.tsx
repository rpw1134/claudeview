import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Action hierarchy is encoded in the variants, not chosen per call site:
 *
 *   primary  solid accent fill — the one action a view is asking for
 *   subtle   raised fill, no border — common secondary actions
 *   outline  border only — secondary actions that need to read as a control
 *   ghost    no fill until hover — toolbar and icon actions that should recede
 *   danger   solid, reserved for destructive actions that are also primary
 *
 * If two `primary` buttons are visible at once, one of them is wrong: emphasis is
 * relative, so a second primary halves the weight of the first.
 *
 * Sizes are on the 4/8px scale and radii follow the size-based scale — `md`/`icon`
 * are 28px so they take `sm` radius, `lg`/`icon-lg` are 36px so they take `md`.
 * Focus rings come from the global `:focus-visible` rule; per-variant rings would
 * be a second focus treatment competing with it.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap ' +
    'transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-contrast hover:brightness-110 active:brightness-95',
        subtle: 'bg-raised text-text hover:bg-overlay',
        outline: 'border border-line-strong text-text hover:bg-raised',
        ghost: 'text-text-muted hover:bg-raised hover:text-text',
        danger: 'bg-danger text-accent-contrast hover:brightness-110',
      },
      size: {
        sm: 'h-7 hand-sm-1 px-2 text-xs',
        md: 'h-8 hand-sm-2 px-3 text-sm',
        lg: 'h-9 hand-1 px-4 text-sm',
        icon: 'h-7 w-7 hand-sm-1',
        'icon-lg': 'h-9 w-9 hand-sm-2',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = 'button', ...props }, ref) => {
    const Component = asChild ? Slot : 'button'
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
