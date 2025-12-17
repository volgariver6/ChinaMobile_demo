import { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { generateAIResponseForExistingMessage, getCachedFileContent } from '../../utils/api'
import WelcomeScreen from '../WelcomeScreen'
import MessageBubble from '../MessageBubble'
import ChatInput from '../ChatInput'
import './ChatArea.css'

export default function ChatArea() {
  const { getCurrentConversation, isLoading, updateMessage, setLoading } = useStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const conversation = getCurrentConversation()
  const messages = conversation?.messages || []
  const showWelcome = messages.length === 0

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 重新生成回复
  const handleRegenerate = useCallback(async (messageId: string) => {
    if (isLoading) return
    
    // 找到这条消息的索引
    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) return
    
    // 找到前一条用户消息
    let userMessageContent = ''
    let userMessageFiles: string[] = []
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userMessageContent = messages[i].content
        // 获取用户消息中的文件名列表
        userMessageFiles = messages[i].files?.map(f => f.name) || []
        break
      }
    }
    
    if (!userMessageContent && userMessageFiles.length === 0) return
    
    // 从缓存中获取文件内容
    const fileContent = getCachedFileContent(userMessageFiles)
    
    // 清空当前消息内容，显示加载状态
    updateMessage(messageId, {
      content: '',
      thinking: '正在重新生成...',
      isStreaming: true
    })
    
    setLoading(true)
    
    try {
      // 使用现有消息ID重新生成，传入文件内容
      await generateAIResponseForExistingMessage(
        messageId,
        userMessageContent || '请分析上传的文件内容，提取关键信息并给出专业的分析建议。',
        fileContent
      )
    } catch (error) {
      console.error('重新生成失败:', error)
      updateMessage(messageId, {
        content: '重新生成失败，请重试。',
        thinking: undefined,
        isStreaming: false
      })
    } finally {
      setLoading(false)
    }
  }, [messages, isLoading, updateMessage, setLoading])

  return (
    <main className="chat-area">
      <div className="chat-container">
        {showWelcome ? (
          <WelcomeScreen />
        ) : (
          <div className="messages-container">
            {messages.map((message, index) => (
              <MessageBubble 
                key={message.id} 
                message={message}
                isLatest={index === messages.length - 1}
                onRegenerate={handleRegenerate}
              />
            ))}
            {isLoading && (
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <ChatInput />
    </main>
  )
}

