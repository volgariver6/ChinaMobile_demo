import { useState, useEffect } from 'react'
import { User, Bot, ChevronDown, ChevronUp, Copy, Check, FileText, Link2, ExternalLink, RefreshCw, ThumbsUp, ThumbsDown, X, Database } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { Message } from '../../types'
import './MessageBubble.css'

// 解析 Markdown 表格为 HTML
function parseMarkdownTable(tableText: string): string {
  const lines = tableText.trim().split('\n')
  if (lines.length < 2) return tableText
  
  // 解析单元格，处理前后的 | 
  const parseCells = (line: string): string[] => {
    // 去掉首尾的 |
    let trimmed = line.trim()
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
    return trimmed.split('|').map(c => c.trim())
  }
  
  // 检查是否是分隔行（第二行应该是 |---|---|...）
  const isSeparatorRow = (line: string): boolean => {
    return /^[\s|:-]+$/.test(line) && line.includes('-')
  }
  
  // 找到分隔行
  let separatorIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (isSeparatorRow(lines[i])) {
      separatorIndex = i
      break
    }
  }
  
  if (separatorIndex === -1 || separatorIndex === 0) return tableText
  
  // 表头是分隔行之前的所有行（通常是第一行）
  const headerLines = lines.slice(0, separatorIndex)
  const bodyLines = lines.slice(separatorIndex + 1).filter(l => l.trim())
  
  // 解析表头
  const headers = headerLines.length > 0 ? parseCells(headerLines[headerLines.length - 1]) : []
  
  // 构建 HTML 表格
  const thStyle = 'border:1px solid #999;padding:8px 12px;background:#f0f0f0;font-weight:bold;text-align:left;'
  const tdStyle = 'border:1px solid #999;padding:8px 12px;text-align:left;'
  
  let html = '<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:14px;">'
  
  // 表头
  if (headers.length > 0) {
    html += '<thead><tr>'
    headers.forEach(h => {
      html += `<th style="${thStyle}">${h}</th>`
    })
    html += '</tr></thead>'
  }
  
  // 表体
  if (bodyLines.length > 0) {
    html += '<tbody>'
    bodyLines.forEach(line => {
      const cells = parseCells(line)
      html += '<tr>'
      cells.forEach(c => {
        html += `<td style="${tdStyle}">${c}</td>`
      })
      html += '</tr>'
    })
    html += '</tbody>'
  }
  
  html += '</table>'
  return html
}

// Markdown 转 HTML 的转换器（用于复制时转换为Word兼容格式）
function markdownToHtml(markdown: string): string {
  let html = markdown
  
  // 1. 先保护代码块，避免内部内容被转换
  const codeBlocks: string[] = []
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match)
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`
  })
  
  const inlineCodes: string[] = []
  html = html.replace(/`([^`]+)`/g, (match) => {
    inlineCodes.push(match)
    return `__INLINE_CODE_${inlineCodes.length - 1}__`
  })
  
  // 2. 处理表格 - 找到所有表格并转换
  // 表格特征：连续的以 | 开头的行，且包含分隔行（|---|---）
  const lines = html.split('\n')
  const processedLines: string[] = []
  let tableBuffer: string[] = []
  let inTable = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isTableLine = line.trim().includes('|') && (line.trim().startsWith('|') || /^[^|]+\|/.test(line.trim()))
    
    if (isTableLine) {
      if (!inTable) {
        inTable = true
        tableBuffer = []
      }
      tableBuffer.push(line)
    } else {
      if (inTable) {
        // 表格结束，处理表格
        if (tableBuffer.length >= 2) {
          const tableHtml = parseMarkdownTable(tableBuffer.join('\n'))
          processedLines.push(tableHtml)
        } else {
          // 不是有效表格，原样保留
          processedLines.push(...tableBuffer)
        }
        tableBuffer = []
        inTable = false
      }
      processedLines.push(line)
    }
  }
  
  // 处理最后可能剩余的表格
  if (tableBuffer.length >= 2) {
    const tableHtml = parseMarkdownTable(tableBuffer.join('\n'))
    processedLines.push(tableHtml)
  } else if (tableBuffer.length > 0) {
    processedLines.push(...tableBuffer)
  }
  
  html = processedLines.join('\n')
  
  // 3. 标题转换
  html = html.replace(/^######\s+(.+)$/gm, '<h6 style="margin:12px 0 8px;font-weight:bold;">$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5 style="margin:12px 0 8px;font-weight:bold;">$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4 style="margin:14px 0 8px;font-weight:bold;">$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3 style="margin:16px 0 10px;font-weight:bold;font-size:1.1em;">$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2 style="margin:18px 0 10px;font-weight:bold;font-size:1.2em;">$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1 style="margin:20px 0 12px;font-weight:bold;font-size:1.4em;">$1</h1>')
  
  // 4. 粗体和斜体（注意顺序，先处理三个星号的）
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
  html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
  
  // 5. 删除线
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
  
  // 6. 无序列表
  html = html.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li style="margin:4px 0;">$1</li>')
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="margin:10px 0;padding-left:20px;">$&</ul>')
  
  // 7. 有序列表
  html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li style="margin:4px 0;">$1</li>')
  
  // 8. 引用块
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote style="border-left:4px solid #ddd;margin:10px 0;padding:10px 15px;color:#666;background:#f9f9f9;">$1</blockquote>')
  
  // 9. 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#007AFF;">$1</a>')
  
  // 10. 水平线
  html = html.replace(/^[-*_]{3,}$/gm, '<hr style="border:none;border-top:1px solid #ddd;margin:15px 0;">')
  
  // 11. 恢复代码块
  codeBlocks.forEach((block, i) => {
    const code = block.replace(/```(\w*)\n?([\s\S]*?)```/, (_, _lang, content) => {
      return `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto;margin:10px 0;font-family:Consolas,Monaco,monospace;"><code>${content.trim()}</code></pre>`
    })
    html = html.replace(`__CODE_BLOCK_${i}__`, code)
  })
  
  // 12. 恢复行内代码
  inlineCodes.forEach((code, i) => {
    const formatted = code.replace(/`([^`]+)`/, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px;font-family:Consolas,Monaco,monospace;">$1</code>')
    html = html.replace(`__INLINE_CODE_${i}__`, formatted)
  })
  
  // 13. 段落处理：将连续的非HTML文本包装成段落
  html = html.split('\n\n').map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ''
    // 如果已经是HTML标签开头，不包装
    if (/^<[a-zA-Z]/.test(trimmed)) return trimmed
    // 否则包装为段落
    return `<p style="margin:10px 0;line-height:1.6;">${trimmed.replace(/\n/g, '<br>')}</p>`
  }).join('\n')
  
  return html
}

// 点踩原因选项
const DISLIKE_REASONS = [
  '内容不准确',
  '回答不完整',
  '格式混乱',
  '响应太慢',
  '不符合需求'
]

interface MessageBubbleProps {
  message: Message
  isLatest: boolean
  onRegenerate?: (messageId: string) => void
}

export default function MessageBubble({ message, isLatest, onRegenerate }: MessageBubbleProps) {
  const [showThinking, setShowThinking] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState(false)
  const [disliked, setDisliked] = useState(false)
  const [showDislikeModal, setShowDislikeModal] = useState(false)
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [otherReason, setOtherReason] = useState('')
  
  const isUser = message.role === 'user'
  const hasThinking = message.thinking && message.thinking.length > 0
  const hasSources = message.sources && message.sources.length > 0

  // 流式输出时展开思考过程，结束后自动折叠
  useEffect(() => {
    if (message.isStreaming && hasThinking) {
      // 正在流式输出且有思考内容时，自动展开
      setShowThinking(true)
    } else if (!message.isStreaming && hasThinking) {
      // 流式输出结束后，自动折叠
      setShowThinking(false)
    }
  }, [message.isStreaming, hasThinking])

  const handleCopy = async () => {
    try {
      // 将 Markdown 转换为 HTML（Word 兼容格式）
      const htmlContent = markdownToHtml(message.content)
      
      // 创建完整的 HTML 文档片段，包含样式
      const fullHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#333;">${htmlContent}</div>`
      
      // 使用 ClipboardItem API 同时写入纯文本和 HTML 格式
      // 这样粘贴到 Word 会使用 HTML 格式，粘贴到纯文本编辑器会使用纯文本
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const clipboardItem = new ClipboardItem({
          'text/plain': new Blob([message.content], { type: 'text/plain' }),
          'text/html': new Blob([fullHtml], { type: 'text/html' })
        })
        await navigator.clipboard.write([clipboardItem])
      } else {
        // 降级方案：仅复制纯文本
        await navigator.clipboard.writeText(message.content)
      }
      
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('复制失败:', error)
      // 降级方案
      try {
        await navigator.clipboard.writeText(message.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (e) {
        console.error('降级复制也失败:', e)
      }
    }
  }

  const handleLike = () => {
    setLiked(!liked)
    if (disliked) setDisliked(false)
  }

  const handleDislikeClick = () => {
    if (disliked) {
      // 已经点踩，取消点踩
      setDisliked(false)
    } else {
      // 打开点踩弹窗
      setShowDislikeModal(true)
    }
  }

  const handleDislikeSubmit = () => {
    setDisliked(true)
    if (liked) setLiked(false)
    setShowDislikeModal(false)
    // 这里可以发送反馈到后端
    console.log('点踩反馈:', { reasons: selectedReasons, other: otherReason })
    // 重置表单
    setSelectedReasons([])
    setOtherReason('')
  }

  const handleDislikeCancel = () => {
    setShowDislikeModal(false)
    setSelectedReasons([])
    setOtherReason('')
  }

  const toggleReason = (reason: string) => {
    setSelectedReasons(prev => 
      prev.includes(reason) 
        ? prev.filter(r => r !== reason)
        : [...prev, reason]
    )
  }

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate(message.id)
    }
  }

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'} animate-slide-up`}>
      <div className="message-avatar">
        {isUser ? (
          <div className="avatar-user">
            <User size={18} />
          </div>
        ) : (
          <div className="avatar-assistant">
            <Bot size={18} />
          </div>
        )}
      </div>
      
      <div className="message-content-wrapper">
        {/* File attachments */}
        {message.files && message.files.length > 0 && (
          <div className="message-files">
            {message.files.map(file => (
              <div key={file.id} className="file-chip">
                <FileText size={14} />
                <span>{file.name}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Thinking process (for assistant) */}
        {!isUser && hasThinking && (
          <div className={`thinking-section ${!message.isStreaming ? 'collapsed' : ''}`}>
            <button 
              className="thinking-toggle"
              onClick={() => setShowThinking(!showThinking)}
            >
              {showThinking ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span>思考过程</span>
              {message.isStreaming && <span className="thinking-indicator">思考中...</span>}
              {!message.isStreaming && <span className="thinking-done">已完成</span>}
            </button>
            {showThinking && (
              <div className="thinking-content">
                {message.thinking}
              </div>
            )}
          </div>
        )}
        
        {/* Main content */}
        <div className={`message-content ${message.isStreaming ? 'streaming' : ''}`}>
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                table: ({ children }) => (
                  <div className="table-wrapper">
                    <table>{children}</table>
                  </div>
                ),
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '')
                  const isInline = !match
                  
                  if (isInline) {
                    return <code className="inline-code" {...props}>{children}</code>
                  }
                  
                  return (
                    <div className="code-block">
                      <div className="code-header">
                        <span>{match[1]}</span>
                      </div>
                      <pre>
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    </div>
                  )
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
          {message.isStreaming && isLatest && (
            <span className="cursor-blink">|</span>
          )}
        </div>
        
        {/* Source References */}
        {!isUser && hasSources && !message.isStreaming && (
          <div className="sources-section">
            <button 
              className="sources-toggle"
              onClick={() => setShowSources(!showSources)}
            >
              <Link2 size={14} />
              <span>参考数据源</span>
              <span className="sources-count">{message.sources!.length} 个来源</span>
              {showSources ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showSources && (
              <div className="sources-content">
                <div className="source-list">
                  {message.sources!.map((source, index) => {
                    // 判断是否为内部数据源（URL 以 internal:// 开头）
                    const isInternalSource = source.url.startsWith('internal://')
                    
                    if (isInternalSource) {
                      // 内部数据源 - 不可点击，使用 div 展示
                      const hasQueryResult = source.queryResult && source.queryResult.columns && source.queryResult.rows && source.queryResult.rows.length > 0
                      
                      return (
                        <div 
                          key={index}
                          className="source-item source-item-internal"
                        >
                          <div className="source-title">
                            <Database size={14} className="source-internal-icon" />
                            <span>{source.title}</span>
                            <span className="source-internal-badge">内部数据</span>
                          </div>
                          <div className="source-snippet">{source.snippet}</div>
                          <div className="source-internal-tag">{source.sourceName}</div>
                          
                          {/* 展示 SQL 查询结果表格 */}
                          {hasQueryResult && (
                            <div className="source-query-result">
                              <div className="source-query-table-wrapper">
                                <table className="source-query-table">
                                  <thead>
                                    <tr>
                                      {source.queryResult!.columns.map((col, colIdx) => (
                                        <th key={colIdx}>{col}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {source.queryResult!.rows.slice(0, 10).map((row, rowIdx) => (
                                      <tr key={rowIdx}>
                                        {source.queryResult!.columns.map((col, colIdx) => {
                                          const value = row[col]
                                          let displayValue = '-'
                                          if (value !== null && value !== undefined) {
                                            if (typeof value === 'number') {
                                              displayValue = Number.isInteger(value) ? value.toString() : value.toFixed(2)
                                            } else {
                                              displayValue = String(value)
                                            }
                                          }
                                          return <td key={colIdx}>{displayValue}</td>
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className="source-query-footer">
                                共 {source.queryResult!.rows.length} 条记录
                                {source.queryResult!.rows.length > 10 && '（仅显示前10条）'}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    }
                    
                    // 外部数据源 - 可点击
                    return (
                    <a 
                      key={index}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                        className="source-item source-item-external"
                    >
                      <div className="source-title">
                        <span>{source.title}</span>
                        <ExternalLink size={12} />
                      </div>
                      <div className="source-snippet">{source.snippet}</div>
                      <div className="source-url">{source.url}</div>
                    </a>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Actions */}
        {!isUser && message.content && !message.isStreaming && (
          <div className="message-actions">
            <button 
              className={`action-btn ${copied ? 'active' : ''}`}
              onClick={handleCopy}
              title="复制内容"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button 
              className="action-btn"
              onClick={handleRegenerate}
              title="重新生成"
            >
              <RefreshCw size={16} />
            </button>
            <button 
              className={`action-btn ${liked ? 'liked' : ''}`}
              onClick={handleLike}
              title="点赞"
            >
              <ThumbsUp size={16} />
            </button>
            <button 
              className={`action-btn ${disliked ? 'disliked' : ''}`}
              onClick={handleDislikeClick}
              title="点踩"
            >
              <ThumbsDown size={16} />
            </button>
          </div>
        )}
        
        {/* Dislike Modal */}
        {showDislikeModal && (
          <div className="dislike-modal-overlay" onClick={handleDislikeCancel}>
            <div className="dislike-modal" onClick={e => e.stopPropagation()}>
              <div className="dislike-modal-header">
                <span>请告诉我们您不满意的原因</span>
                <button className="close-btn" onClick={handleDislikeCancel}>
                  <X size={18} />
                </button>
              </div>
              <div className="dislike-modal-content">
                <div className="dislike-reasons">
                  {DISLIKE_REASONS.map(reason => (
                    <button
                      key={reason}
                      className={`reason-btn ${selectedReasons.includes(reason) ? 'selected' : ''}`}
                      onClick={() => toggleReason(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <textarea
                  className="other-reason-input"
                  placeholder="其他原因（选填）"
                  value={otherReason}
                  onChange={e => setOtherReason(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="dislike-modal-footer">
                <button className="cancel-btn" onClick={handleDislikeCancel}>
                  取消
                </button>
                <button 
                  className="submit-btn"
                  onClick={handleDislikeSubmit}
                  disabled={selectedReasons.length === 0 && !otherReason.trim()}
                >
                  提交反馈
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
