import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DevPanel from './components/DevPanel'
import InstallPage from './components/InstallPage'
import CopyrightPage from './components/CopyrightPage'

const hash = window.location.hash
const isDev       = hash === '#dev'
const isInstall   = hash === '#install'
const isCopyright = hash === '#legal'

// Register Service Worker on mobile so Android grants background GPS execution.
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isDev       ? <DevPanel />      :
     isInstall   ? <InstallPage />   :
     isCopyright ? <CopyrightPage /> :
                   <App />}
  </React.StrictMode>
)
