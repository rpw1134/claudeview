import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useProfileStore } from '@/stores/profileStore'
import { Mark } from '../Mark'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'

/**
 * First screen: who the app is, and — optionally — who you are.
 *
 * The name is asked for once and never required. It buys one thing (a greeting
 * on the landing page) and nothing depends on it, so Continue is enabled from
 * the first frame: value before commitment, and no field standing between
 * someone and the app they just launched.
 */
export function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  const name = useProfileStore((state) => state.name)
  const setName = useProfileStore((state) => state.setName)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onContinue()
      }}
    >
      <Mark state="idle" size={28} className="text-accent" />

      <DialogPrimitive.Title className="mt-5 text-xl font-semibold tracking-tight text-text">
        Welcome to Stryde
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="mt-2 text-sm text-text-muted">
        A desktop workspace for Claude Code.
      </DialogPrimitive.Description>

      <Field label="What should we call you?" htmlFor="onboarding-name" className="mt-8">
        <input
          id="onboarding-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          maxLength={40}
          autoComplete="given-name"
          autoFocus
          className="hand-1 h-11 w-full bg-surface px-3.5 text-sm text-text outline-none
                     transition-colors placeholder:text-text-faint focus:bg-raised"
        />
      </Field>

      <div className="mt-8 flex justify-end">
        <Button type="submit" variant="primary" size="lg">
          Continue
        </Button>
      </div>
    </form>
  )
}
