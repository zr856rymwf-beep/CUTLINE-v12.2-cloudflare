import React from 'react'
import ReactDOM from 'react-dom/client'
import CutlineApp from './CutlineApp'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element was not found.')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <CutlineApp />
  </React.StrictMode>,
)
