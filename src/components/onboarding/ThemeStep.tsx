import * as DialogPrimitive from '@radix-ui/react-dialog'
import { COLORWAYS } from '@/lib/theme'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { Button } from '../ui/Button'
import { ColorwayTile } from './ColorwayTile'

/**
 * Second screen: pick a look.
 *
 * There is no separate preview swatch, because selecting *is* the preview —
 * `set('colorway', …)` writes CSS variables straight to `<html>`, so the whole
 * app repaints live behind the dialog. Showing a mock of the app inside the app
 * would be the same picture, drawn twice and able to lie.
 *
 * Custom themes are a Settings concern. Offering sliders here would turn a
 * one-tap decision into an editor before anyone has seen a session.
 */
export function ThemeStep({ onContinue }: { onContinue: () => void }) {
  const colorway = useAppearanceStore((state) => state.colorway)

  return (
    <div>
      <DialogPrimitive.Title className="text-xl font-semibold tracking-tight text-text">
        Pick your look.
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="mt-2 text-sm text-text-muted">
        Choose one and the app changes behind this window.
      </DialogPrimitive.Description>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {COLORWAYS.map((entry) => (
          <ColorwayTile
            key={entry.id}
            colorway={entry}
            selected={colorway === entry.id}
            onSelect={() => useAppearanceStore.getState().set('colorway', entry.id)}
          />
        ))}
      </div>

      <p className="mt-5 text-xs text-text-faint">
        You can fine-tune or build a custom theme later in Settings (⌘,).
      </p>

      <div className="mt-8 flex justify-end">
        <Button variant="primary" size="lg" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}
