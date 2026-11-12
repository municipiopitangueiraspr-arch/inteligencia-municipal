import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './mobile-responsive.css'
import { PwaNotice } from './PwaNotice'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
      <PwaNotice />
    </>
  </StrictMode>,
)
