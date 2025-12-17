import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Paperclip, X, FileText, FileSpreadsheet, File, Presentation, Loader2, FileSearch, Square } from 'lucide-react'
import { useStore } from '../../store'
import { simulateAIResponse, extractItemsWithAI, generateAIResponseForExistingMessage, stopGeneration } from '../../utils/api'
import { performWebSearch, type SearchProgress } from '../../utils/webSearch'
import type { UploadedFile } from '../../types'
import type { DataSource, ExtractedItem } from '../ToolSelector'
import ToolSelector from '../ToolSelector'
import './ChatInput.css'

const ACCEPTED_FILE_TYPES = '.xlsx,.xls,.csv,.pdf,.docx,.doc,.txt,.pptx,.ppt'

// 扩展 UploadedFile 类型，包含原始文件
interface FileWithRaw extends UploadedFile {
  rawFile: File
}

// 缓存已提取的标的物和项目名称，按对话ID存储
const extractedItemsCache = new Map<string, ExtractedItem[]>()
const extractedProjectNameCache = new Map<string, string>()

export default function ChatInput() {
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<FileWithRaw[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [showToolSelector, setShowToolSelector] = useState(false)
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([])
  const [extractedProjectName, setExtractedProjectName] = useState<string>('')
  const [isExtractingItems, setIsExtractingItems] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { addMessage, isLoading, getCurrentConversation, currentConversationId } = useStore()
  
  // 获取当前对话
  const currentConversation = getCurrentConversation()
  
  // 当对话切换时，加载对应的缓存或清空
  useEffect(() => {
    if (currentConversationId) {
      const cachedItems = extractedItemsCache.get(currentConversationId)
      const cachedProjectName = extractedProjectNameCache.get(currentConversationId)
      if (cachedItems) {
        setExtractedItems(cachedItems)
      } else {
        setExtractedItems([])
      }
      setExtractedProjectName(cachedProjectName || '')
    } else {
      setExtractedItems([])
      setExtractedProjectName('')
    }
  }, [currentConversationId])
  
  // 使用 AI 提取标的物和项目名称（每个对话只提取一次）
  const handleOpenToolSelector = async () => {
    if (!currentConversation || currentConversation.messages.length === 0) {
      setExtractedItems([])
      setExtractedProjectName('')
      setShowToolSelector(true)
      return
    }
    
    // 检查是否已经提取过（使用缓存）
    if (currentConversationId && extractedItemsCache.has(currentConversationId)) {
      const cachedItems = extractedItemsCache.get(currentConversationId)!
      const cachedProjectName = extractedProjectNameCache.get(currentConversationId) || ''
      setExtractedItems(cachedItems)
      setExtractedProjectName(cachedProjectName)
      setShowToolSelector(true)
      return
    }
    
    setIsExtractingItems(true)
    try {
      // 使用 AI 模型提取项目名称和标的物
      const result = await extractItemsWithAI(currentConversation.messages)
      const formattedItems: ExtractedItem[] = result.items.map((item, index) => ({
        id: `item-${index}`,
        name: item.name,
        quantity: item.quantity,
        selected: false
      }))
      setExtractedItems(formattedItems)
      setExtractedProjectName(result.projectName || '')
      
      // 缓存提取结果
      if (currentConversationId) {
        extractedItemsCache.set(currentConversationId, formattedItems)
        if (result.projectName) {
          extractedProjectNameCache.set(currentConversationId, result.projectName)
        }
      }
    } catch (error) {
      console.error('提取标的物失败:', error)
      setExtractedItems([])
      setExtractedProjectName('')
    } finally {
      setIsExtractingItems(false)
      setShowToolSelector(true)
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    addFiles(selectedFiles)
    e.target.value = ''
  }, [])

  const addFiles = (newFiles: File[]) => {
    const uploadedFiles: FileWithRaw[] = newFiles.map(file => ({
      id: Math.random().toString(36).substring(2, 15),
      name: file.name,
      size: file.size,
      type: file.type,
      rawFile: file
    }))
    setFiles(prev => [...prev, ...uploadedFiles])
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    addFiles(droppedFiles)
  }, [])

  const handleSubmit = async () => {
    if ((!input.trim() && files.length === 0) || isLoading || isParsing) return
    
    // 提取文件元数据和原始文件
    const fileMetadata: UploadedFile[] = files.map(({ id, name, size, type }) => ({
      id, name, size, type
    }))
    const rawFiles: File[] = files.map(f => f.rawFile)
    
    const userMessage = {
      role: 'user' as const,
      content: input.trim(),
      files: fileMetadata.length > 0 ? fileMetadata : undefined
    }
    
    const currentInput = input.trim()
    
    addMessage(userMessage)
    setInput('')
    setFiles([])
    
    // 调用 AI，传递原始文件用于解析
    setIsParsing(true)
    try {
      await simulateAIResponse(currentInput, fileMetadata, rawFiles)
    } finally {
      setIsParsing(false)
    }
  }

  // 处理寻源比价报告生成
  const handleToolConfirm = async (sources: DataSource[], selectedItems: string[], evaluationDimensions?: string[], projectName?: string) => {
    setShowToolSelector(false)
    
    const { updateMessage, setLoading } = useStore.getState()
    const itemsText = selectedItems.join('、')
    
    // 区分外部和内部数据源
    const externalSources = sources.filter(s => ['ichipcheck', 'halfchip', '1688'].includes(s.id))
    const internalSources = sources.filter(s => !['ichipcheck', 'halfchip', '1688'].includes(s.id))
    
    // 检查是否选择了潜在供应商推荐
    const hasPotentialSupplier = internalSources.some(s => s.id === 'potential_supplier')
    
    // 构建用户消息内容
    let userContent = `🔍 **寻源比价报告生成**\n\n`
    
    // 如果有项目名称，添加到消息中
    if (projectName) {
      userContent += `**项目名称**: ${projectName}\n`
    }
    
    userContent += `**标的物**: ${itemsText}\n**外部数据源**: ${externalSources.length > 0 ? externalSources.map(s => s.name).join('、') : '无'}\n**内部数据源**: ${internalSources.length > 0 ? internalSources.map(s => s.name).join('、') : '无'}`
    
    // 如果选择了潜在供应商推荐，添加评估维度信息
    if (hasPotentialSupplier && evaluationDimensions && evaluationDimensions.length > 0) {
      userContent += `\n**供应商评估维度**: ${evaluationDimensions.join('、')}`
    }
    
    // 添加用户消息
    const userMessage = {
      role: 'user' as const,
      content: userContent
    }
    addMessage(userMessage)
    
    // 添加搜索状态消息（这个消息后续会被更新为AI报告）
    addMessage({
      role: 'assistant',
      content: `<div class="search-status"><span class="search-status-icon">🔍</span><span class="search-status-text">正在准备搜索...</span></div>`,
      sources: [],
      isStreaming: true
    })
    
    // 获取刚添加的搜索状态消息ID
    const conversation = getCurrentConversation()
    const messages = conversation?.messages || []
    const assistantMessageId = messages[messages.length - 1]?.id
    
    setIsParsing(true)
    setLoading(true)
    
    try {
      // 进度回调函数，更新搜索状态消息
      const handleProgress = (progress: SearchProgress) => {
        if (!assistantMessageId) return
        
        const isExternal = progress.stage === 'external'
        const icon = isExternal ? '🌐' : '🏢'
        const stageName = isExternal ? '外部' : '内部'
        const progressPercent = Math.round((progress.current / progress.total) * 100)
        
        const statusContent = `<div class="search-status">
  <span class="search-status-icon">${icon}</span>
  <span class="search-status-text">正在搜索${stageName}数据源: <strong>${progress.sourceName}</strong></span>
  <span class="search-status-item">「${progress.itemName}」</span>
  <span class="search-status-progress">${progress.current}/${progress.total}</span>
  <div class="search-status-bar"><div class="search-status-bar-fill" style="width: ${progressPercent}%"></div></div>
</div>`
        
        updateMessage(assistantMessageId, {
          content: statusContent,
          isStreaming: true
        })
      }
      
      // 按"数据源+标的物"进行查找，结果按数据源分组
      // 如果选择了潜在供应商推荐，传递评估维度
      const searchResults = await performWebSearch(
        selectedItems, 
        sources, 
        handleProgress,
        hasPotentialSupplier ? evaluationDimensions : undefined,
        projectName  // 传递项目名称
      )
      
      // 更新状态消息为搜索完成，准备生成报告
      if (assistantMessageId) {
        updateMessage(assistantMessageId, {
          content: `<div class="search-status completed"><span class="search-status-icon">✅</span><span class="search-status-text">数据搜索完成，正在生成报告...</span></div>`,
          thinking: '正在分析数据并生成报告...',
          sources: searchResults.sources,
          isStreaming: true
        })
      }
      
      // 构建 AI 提示词
      let aiPrompt = `请根据搜索结果生成寻源比价报告，标的物是：${itemsText}`
      
      // 如果选择了潜在供应商推荐，在提示词中加入评估维度要求
      if (hasPotentialSupplier && evaluationDimensions && evaluationDimensions.length > 0) {
        aiPrompt += `\n\n在报告中，请特别从以下维度对潜在供应商进行评估分析：\n${evaluationDimensions.map(d => `- **${d}**`).join('\n')}\n\n请为每个评估维度提供详细的分析和评分建议，并给出综合推荐。`
      }
      
      // 调用AI生成报告，直接更新现有消息
      await generateAIResponseForExistingMessage(
        assistantMessageId,
        aiPrompt,
        searchResults.formattedText,
        searchResults.sources
      )
    } catch (error) {
      console.error('寻源比价报告生成失败:', error)
      // 如果失败，更新状态消息显示错误
      if (assistantMessageId) {
        updateMessage(assistantMessageId, {
          content: '❌ **搜索失败**\n\n' + (error instanceof Error ? error.message : '未知错误'),
          isStreaming: false
        })
      }
    } finally {
      setIsParsing(false)
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (['xlsx', 'xls', 'csv'].includes(ext || '')) return FileSpreadsheet
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext || '')) return FileText
    if (['pptx', 'ppt'].includes(ext || '')) return Presentation
    return File
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const isProcessing = isLoading || isParsing

  return (
    <>
      <div 
        className={`chat-input-container ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="input-wrapper">
          {/* File chips */}
          {files.length > 0 && (
            <div className="attached-files">
              {files.map(file => {
                const FileIcon = getFileIcon(file.name)
                return (
                  <div key={file.id} className="attached-file">
                    <FileIcon size={14} />
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{formatFileSize(file.size)}</span>
                    <button 
                      className="remove-file-btn"
                      onClick={() => removeFile(file.id)}
                      aria-label="移除文件"
                      disabled={isProcessing}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          
          <div className="input-row">
            {/* File upload button */}
            <button 
              className="upload-btn"
              onClick={() => fileInputRef.current?.click()}
              title="上传文件"
              disabled={isProcessing}
            >
              <Paperclip size={20} />
            </button>
            
            {/* Tool selector button */}
            <button 
              className="tool-btn"
              onClick={handleOpenToolSelector}
              title="寻源比价报告生成"
              disabled={isProcessing || isExtractingItems}
            >
              {isExtractingItems ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>提取中...</span>
                </>
              ) : (
                <>
                  <FileSearch size={16} />
                  <span>寻源比价</span>
                </>
              )}
            </button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              multiple
              onChange={handleFileChange}
              className="hidden-file-input"
            />
            
            {/* Text input */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入您的问题，或上传采购方案开始分析..."
              rows={1}
              disabled={isProcessing}
            />
            
            {/* Send / Stop button */}
            {isLoading ? (
              <button 
                className="send-btn stop-btn active"
                onClick={() => {
                  stopGeneration()
                }}
                title="停止生成"
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button 
                className={`send-btn ${(input.trim() || files.length > 0) && !isParsing ? 'active' : ''}`}
                onClick={handleSubmit}
                disabled={(!input.trim() && files.length === 0) || isParsing}
                title="发送"
              >
                {isParsing ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            )}
          </div>
          
          <div className="input-footer">
            <span className="ai-disclaimer">内容由 AI 生成，仅供参考</span>
          </div>
        </div>
        
        {/* Drag overlay */}
        {isDragging && (
          <div className="drag-overlay">
            <div className="drag-content">
              <Paperclip size={48} />
              <p>释放以上传文件</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Tool Selector Modal */}
      <ToolSelector
        isOpen={showToolSelector}
        onClose={() => setShowToolSelector(false)}
        onConfirm={handleToolConfirm}
        extractedItems={extractedItems}
        extractedProjectName={extractedProjectName}
      />
    </>
  )
}
