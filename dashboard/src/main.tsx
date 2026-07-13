import React from 'react'
import ReactDOM from 'react-dom/client'
import SmartIrrigationDashboard from './dashboard' // <--- Controlla l'import del tuo componente
import './index.css' // <--- FONDAMENTALE: l'import del CSS con le direttive Tailwind

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SmartIrrigationDashboard />
  </React.StrictMode>,
)