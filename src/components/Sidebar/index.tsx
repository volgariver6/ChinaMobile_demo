import { useState, useRef, useEffect } from 'react'
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  PanelLeftClose, 
  PanelLeft,
  Sun,
  Moon,
  Cpu,
  User,
  Pencil,
  Check,
  X
} from 'lucide-react'
import { useStore } from '../../store'
import { AVAILABLE_MODELS } from '../../config'
import ChinaMobileLogo from '../ChinaMobileLogo'
import ModelSettings from '../ModelSettings'
import './Sidebar.css'

export default function Sidebar() {
  const { 
    theme,
    toggleTheme,
    sidebarCollapsed, 
    toggleSidebar,
    conversations,
    currentConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    selectedModel
  } = useStore()
  
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [showModelSettings, setShowModelSettings] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  
  const currentModelName = AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name || '未知模型'
  
  
  // 当进入编辑模式时，聚焦输入框
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])
  
  const handleStartEdit = (e: React.MouseEvent, convId: string, currentTitle: string) => {
    e.stopPropagation()
    setEditingId(convId)
    setEditTitle(currentTitle)
  }
  
  const handleConfirmEdit = (convId: string) => {
    const trimmedTitle = editTitle.trim()
    if (trimmedTitle && trimmedTitle !== '') {
      renameConversation(convId, trimmedTitle)
    }
    setEditingId(null)
    setEditTitle('')
  }
  
  const handleCancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
  }
  
  const handleKeyDown = (e: React.KeyboardEvent, convId: string) => {
    if (e.key === 'Enter') {
      handleConfirmEdit(convId)
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  // 获取日期分组的键和排序优先级
  const getDateGroup = (timestamp: number): { key: string; priority: number; sortKey: string } => {
    const date = new Date(timestamp)
    const now = new Date()
    
    // 获取今天的开始时间（0点）
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
    const sevenDaysAgoStart = todayStart - 6 * 24 * 60 * 60 * 1000
    
    if (timestamp >= todayStart) {
      return { key: '今天', priority: 0, sortKey: '0' }
    }
    if (timestamp >= yesterdayStart) {
      return { key: '昨天', priority: 1, sortKey: '1' }
    }
    if (timestamp >= sevenDaysAgoStart) {
      return { key: '七天以内', priority: 2, sortKey: '2' }
    }
    
    // 更早的按年月分组
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const monthKey = `${year}年${month}月`
    // 用于排序的键，确保按时间倒序
    const sortKey = `3-${year}-${String(month).padStart(2, '0')}`
    return { key: monthKey, priority: 3, sortKey }
  }

  // 对对话进行分组
  const groupedConversations = conversations.reduce((groups, conv) => {
    const { key, sortKey } = getDateGroup(conv.updatedAt)
    if (!groups[key]) {
      groups[key] = { conversations: [], sortKey }
    }
    groups[key].conversations.push(conv)
    return groups
  }, {} as Record<string, { conversations: typeof conversations; sortKey: string }>)

  // 对分组进行排序：今天 -> 昨天 -> 七天以内 -> 年月（按时间倒序）
  const sortedGroups = Object.entries(groupedConversations).sort((a, b) => {
    const sortKeyA = a[1].sortKey
    const sortKeyB = b[1].sortKey
    
    // 对于年月分组（以3-开头），需要倒序排列
    if (sortKeyA.startsWith('3-') && sortKeyB.startsWith('3-')) {
      return sortKeyB.localeCompare(sortKeyA)
    }
    
    return sortKeyA.localeCompare(sortKeyB)
  })

  return (
    <>
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-inner">
          <div className="sidebar-header">
            <div className="logo-container">
              <ChinaMobileLogo />
            </div>
            <button 
              className="icon-button collapse-btn"
              onClick={toggleSidebar}
              aria-label="收起侧边栏"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
          
          <button className="new-chat-btn" onClick={createConversation}>
            <Plus size={18} />
            <span>新建对话</span>
          </button>
          
          <div className="conversations-list">
            {sortedGroups.map(([date, { conversations: convs }]) => (
              <div key={date} className="conversation-group">
                <div className="group-label">{date}</div>
                {convs.map(conv => (
                  <div
                    key={conv.id}
                    className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''} ${editingId === conv.id ? 'editing' : ''}`}
                    onClick={() => editingId !== conv.id && selectConversation(conv.id)}
                    onMouseEnter={() => setHoveredId(conv.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <MessageSquare size={16} className="conv-icon" />
                    
                    {editingId === conv.id ? (
                      <div className="edit-title-container">
                        <input
                          ref={editInputRef}
                          type="text"
                          className="edit-title-input"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, conv.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          className="edit-action-btn confirm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleConfirmEdit(conv.id)
                          }}
                          aria-label="确认"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          className="edit-action-btn cancel"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCancelEdit()
                          }}
                          aria-label="取消"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="conv-title">{conv.title}</span>
                        {hoveredId === conv.id && (
                          <div className="conv-actions">
                            <button
                              className="action-btn edit-btn"
                              onClick={(e) => handleStartEdit(e, conv.id, conv.title)}
                              aria-label="重命名"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="action-btn delete-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteConversation(conv.id)
                              }}
                              aria-label="删除对话"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
            
            {conversations.length === 0 && (
              <div className="empty-state">
                <MessageSquare size={32} strokeWidth={1.5} />
                <p>暂无对话记录</p>
              </div>
            )}
          </div>
          
          <div className="sidebar-footer">
            <button className="footer-btn" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              <span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
            </button>
            <button className="footer-btn model-btn" onClick={() => setShowModelSettings(true)}>
              <Cpu size={18} />
              <span>模型设置</span>
              <span className="current-model-tag">{currentModelName}</span>
            </button>
            <div className="user-info">
              <div className="avatar">
                <User size={16} />
              </div>
              <span>采购专员</span>
            </div>
          </div>
        </div>
      </aside>
      
      {sidebarCollapsed && (
        <button 
          className="expand-sidebar-btn"
          onClick={toggleSidebar}
          aria-label="展开侧边栏"
        >
          <PanelLeft size={20} />
        </button>
      )}
      
      {/* 模型设置弹窗 */}
      <ModelSettings 
        isOpen={showModelSettings} 
        onClose={() => setShowModelSettings(false)} 
      />
    </>
  )
}
