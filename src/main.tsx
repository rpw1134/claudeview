import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyAppearance, DEFAULT_APPEARANCE } from './lib/theme'
import './index.css'

// Apply the theme before React mounts. The appearance store rehydrates from
// localStorage a tick later and re-applies; this call just guarantees the very
// first paint is already themed rather than flashing the CSS fallbacks.
applyAppearance(DEFAULT_APPEARANCE)

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
