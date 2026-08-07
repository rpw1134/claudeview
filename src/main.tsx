import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyAppearance } from './lib/theme'
import { useAppearanceStore } from './stores/appearanceStore'
import './index.css'

// Apply the theme before React mounts so the first paint is themed rather than
// flashing the CSS fallbacks. The appearance store hydrates from localStorage
// *synchronously* at import time (zustand persist with a sync storage), so its
// state is already the saved appearance here — applying anything else, like the
// defaults, would stomp the saved theme on every launch.
applyAppearance(useAppearanceStore.getState())

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
