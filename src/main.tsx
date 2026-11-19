import { createRoot } from 'react-dom/client'
import App from './App'
import { requestPersistence } from './db'
import { initPWA } from './pwa'
import './styles.css'

requestPersistence()
initPWA()
createRoot(document.getElementById('root')!).render(<App />)
