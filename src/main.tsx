import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Toggle .is-scrolling on whichever element is being scrolled so the
// scrollbar thumb stays visible during the scroll, then fades out.
;(function () {
  let timer: ReturnType<typeof setTimeout>
  document.addEventListener('scroll', e => {
    const el = e.target as Element
    if (!el) return
    el.classList.add('is-scrolling')
    clearTimeout(timer)
    timer = setTimeout(() => el.classList.remove('is-scrolling'), 800)
  }, { capture: true, passive: true })
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
