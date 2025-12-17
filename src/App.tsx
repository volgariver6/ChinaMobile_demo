import { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import { useStore } from './store'
import './styles/App.css'

function App() {
  const { theme, initTheme } = useStore()

  useEffect(() => {
    initTheme()
  }, [initTheme])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className="app">
      <Sidebar />
      <ChatArea />
    </div>
  )
}

export default App

