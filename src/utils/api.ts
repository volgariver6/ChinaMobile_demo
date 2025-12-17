import { useStore } from '../store'
import { API_CONFIG, SYSTEM_PROMPT } from '../config'
import type { UploadedFile, SourceReference } from '../types'
import { parseFiles, formatParsedFilesForPrompt } from './fileParser'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface StreamChoice {
  delta: {
    content?: string
    reasoning_content?: string
  }
  finish_reason: string | null
}

interface StreamResponse {
  choices: StreamChoice[]
}

// 存储已解析的文件内容（用于上下文）
const parsedFileCache = new Map<string, string>()

// 当前活跃的请求控制器，用于取消请求
let currentAbortController: AbortController | null = null

/**
 * 停止当前正在进行的 AI 生成
 */
export function stopGeneration(): boolean {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
    return true
  }
  return false
}

/**
 * 解析文件并缓存内容
 */
export async function parseAndCacheFiles(files: File[]): Promise<string> {
  if (files.length === 0) return ''
  
  const parsedFiles = await parseFiles(files)
  const formattedContent = formatParsedFilesForPrompt(parsedFiles)
  
  // 缓存每个文件的解析结果
  parsedFiles.forEach(pf => {
    parsedFileCache.set(pf.name, pf.content)
  })
  
  return formattedContent
}

/**
 * 从缓存中获取文件内容（用于重新生成）
 */
export function getCachedFileContent(fileNames: string[]): string {
  if (fileNames.length === 0) return ''
  
  const parts: string[] = []
  fileNames.forEach((name, index) => {
    const content = parsedFileCache.get(name)
    if (content) {
      parts.push(`=== 文件 ${index + 1}: ${name} ===\n${content}`)
    }
  })
  
  if (parts.length === 0) return ''
  
  return `以下是用户上传的文件内容，请基于这些内容进行分析：\n\n${parts.join('\n\n')}\n\n---\n\n请根据以上文件内容回答用户的问题：\n\n`
}

/**
 * 调用 AI API 生成回复（支持文件内容）
 */
export async function generateAIResponse(
  userInput: string, 
  files: UploadedFile[] = [],
  fileContent: string = '',
  sourceRefs: SourceReference[] = []
) {
  const { addMessage, updateMessage, setLoading, getCurrentConversation } = useStore.getState()
  
  // 创建新的 AbortController
  currentAbortController = new AbortController()
  const abortController = currentAbortController
  
  // 检查 API Key
  if (!API_CONFIG.apiKey) {
    addMessage({
      role: 'assistant',
      content: `⚠️ **API Key 未配置**

请在项目根目录创建 \`.env\` 文件并配置硅基流动 API Key：

\`\`\`
VITE_SILICONFLOW_API_KEY=your_api_key_here
\`\`\`

获取 API Key：[硅基流动控制台](https://cloud.siliconflow.cn/)`,
      isStreaming: false
    })
    return
  }
  
  setLoading(true)
  
  // 添加占位助手消息（如果有数据源，预先设置）
  addMessage({
    role: 'assistant',
    content: '',
    thinking: '正在分析...',
    isStreaming: true,
    sources: sourceRefs.length > 0 ? sourceRefs : undefined
  })
  
  // 获取刚添加的消息ID（保存下来，确保后续更新到正确的消息）
  const conversation = getCurrentConversation()
  const messages = conversation?.messages || []
  const assistantMessageId = messages[messages.length - 1]?.id
  
  try {
    // 构建对话历史
    const chatHistory: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT }
    ]
    
    // 添加历史消息（排除最后一条刚添加的空助手消息）
    if (conversation) {
      const historyMessages = conversation.messages.slice(0, -1)
      for (const msg of historyMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          chatHistory.push({
            role: msg.role,
            content: msg.content
          })
        }
      }
    }
    
    // 构建当前用户消息（包含文件内容）
    let currentMessage = ''
    
    // 如果有文件内容，添加到消息前面
    if (fileContent) {
      currentMessage += fileContent
      console.log('添加文件内容到消息，长度:', fileContent.length)
    }
    
    // 添加用户输入
    if (userInput) {
      currentMessage += userInput
    } else if (files.length > 0) {
      currentMessage += '请分析上传的文件内容，提取关键信息并给出专业的分析建议。'
    }
    
    console.log('发送给模型的用户消息长度:', currentMessage.length)
    console.log('消息预览:', currentMessage.substring(0, 300) + '...')
    
    chatHistory.push({ role: 'user', content: currentMessage })
    
    // 获取当前选择的模型
    const { selectedModel } = useStore.getState()
    
    // 发起流式请求
    const response = await fetch(`${API_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: chatHistory,
        max_tokens: API_CONFIG.maxTokens,
        temperature: API_CONFIG.temperature,
        stream: true
      }),
      signal: abortController.signal
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`)
    }
    
    // 处理流式响应
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    
    let content = ''
    let reasoning = ''
    
    if (reader) {
      while (true) {
        // 检查是否被中断
        if (abortController.signal.aborted) {
          reader.cancel()
          break
        }
        
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.trim() !== '')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            
            try {
              const parsed: StreamResponse = JSON.parse(data)
              const delta = parsed.choices[0]?.delta
              
              if (delta) {
                // DeepSeek-R1 的思考过程（仅 DeepSeek-R1 支持）
                if (delta.reasoning_content && selectedModel.includes('DeepSeek-R1')) {
                  reasoning += delta.reasoning_content
                }
                
                // 正式回复内容
                if (delta.content) {
                  content += delta.content
                }
                
                // 使用保存的消息ID更新，确保更新到正确的消息（即使切换了对话）
                if (assistantMessageId) {
                  updateMessage(assistantMessageId, {
                    content: content,
                    thinking: reasoning || undefined,
                    isStreaming: true
                  })
                }
              }
            } catch (e) {
              // 忽略解析错误
              console.warn('Parse error:', e)
            }
          }
        }
      }
    }
    
    // 完成流式输出（使用保存的消息ID）
    if (assistantMessageId) {
      const wasStopped = abortController.signal.aborted
      updateMessage(assistantMessageId, {
        content: content || (wasStopped ? '⏹️ 生成已停止' : '抱歉，生成回复时出现问题，请重试。'),
        thinking: reasoning || undefined,
        isStreaming: false
      })
    }
    
  } catch (error) {
    // 检查是否是用户主动停止
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('生成已被用户停止')
      if (assistantMessageId) {
        // 获取当前已生成的内容
        const currentConv = getCurrentConversation()
        const currentContent = currentConv?.messages.find(m => m.id === assistantMessageId)?.content || ''
        updateMessage(assistantMessageId, {
          content: currentContent || '⏹️ 生成已停止',
          isStreaming: false
        })
      }
      return
    }
    
    console.error('API Error:', error)
    // 使用保存的消息ID显示错误
    if (assistantMessageId) {
      updateMessage(assistantMessageId, {
        content: `❌ **请求失败**\n\n${error instanceof Error ? error.message : '未知错误，请检查网络连接和 API 配置。'}`,
        thinking: undefined,
        isStreaming: false
      })
    }
  } finally {
    // 清理 AbortController
    if (currentAbortController === abortController) {
      currentAbortController = null
    }
    setLoading(false)
  }
}

/**
 * 处理用户输入和文件上传，调用 AI 生成回复
 */
export async function simulateAIResponse(
  userInput: string, 
  files: UploadedFile[] = [],
  rawFiles: File[] = []
) {
  const { setLoading } = useStore.getState()
  
  let fileContent = ''
  
  console.log('simulateAIResponse 被调用:', {
    userInput,
    filesCount: files.length,
    rawFilesCount: rawFiles.length,
    rawFileNames: rawFiles.map(f => f.name)
  })
  
  // 如果有原始文件，解析它们
  if (rawFiles.length > 0) {
    setLoading(true)
    
    try {
      // 解析文件
      console.log('开始解析文件...')
      fileContent = await parseAndCacheFiles(rawFiles)
      console.log('文件解析完成，内容长度:', fileContent.length)
      console.log('文件内容预览:', fileContent.substring(0, 500))
    } catch (error) {
      console.error('文件解析失败:', error)
      fileContent = `[文件解析失败: ${error instanceof Error ? error.message : '未知错误'}]\n\n`
    }
  }
  
  // 调用 AI API
  await generateAIResponse(userInput, files, fileContent)
}

/**
 * 为现有消息生成 AI 回复（用于寻源比价等场景，消息已提前创建）
 */
export async function generateAIResponseForExistingMessage(
  messageId: string | undefined,
  userInput: string,
  fileContent: string = '',
  sourceRefs: SourceReference[] = []
) {
  if (!messageId) {
    console.error('messageId 不能为空')
    return
  }
  
  // 创建新的 AbortController
  currentAbortController = new AbortController()
  const abortController = currentAbortController
  
  const { updateMessage, getCurrentConversation, setLoading } = useStore.getState()
  
  // 检查 API Key
  if (!API_CONFIG.apiKey) {
    updateMessage(messageId, {
      content: `⚠️ **API Key 未配置**

请在项目根目录创建 \`.env\` 文件并配置硅基流动 API Key：

\`\`\`
VITE_SILICONFLOW_API_KEY=your_api_key_here
\`\`\`

获取 API Key：[硅基流动控制台](https://cloud.siliconflow.cn/)`,
      isStreaming: false
    })
    return
  }
  
  setLoading(true)
  
  try {
    // 构建对话历史
    const conversation = getCurrentConversation()
    const chatHistory: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT }
    ]
    
    // 添加历史消息（排除当前正在生成的消息）
    if (conversation) {
      const historyMessages = conversation.messages.filter(m => m.id !== messageId)
      for (const msg of historyMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          chatHistory.push({
            role: msg.role,
            content: msg.content
          })
        }
      }
    }
    
    // 构建当前用户消息（包含搜索结果内容）
    let currentMessage = ''
    
    if (fileContent) {
      currentMessage += fileContent
    }
    
    if (userInput) {
      currentMessage += userInput
    }
    
    chatHistory.push({ role: 'user', content: currentMessage })
    
    // 获取当前选择的模型
    const { selectedModel } = useStore.getState()
    
    // 发起流式请求
    const response = await fetch(`${API_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: chatHistory,
        max_tokens: API_CONFIG.maxTokens,
        temperature: API_CONFIG.temperature,
        stream: true
      }),
      signal: abortController.signal
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`)
    }
    
    // 处理流式响应
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    
    let content = ''
    let reasoning = ''
    
    if (reader) {
      while (true) {
        // 检查是否被中断
        if (abortController.signal.aborted) {
          reader.cancel()
          break
        }
        
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.trim() !== '')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            
            try {
              const parsed: StreamResponse = JSON.parse(data)
              const delta = parsed.choices[0]?.delta
              
              if (delta) {
                // DeepSeek-R1 的思考过程
                if (delta.reasoning_content && selectedModel.includes('DeepSeek-R1')) {
                  reasoning += delta.reasoning_content
                }
                
                // 正式回复内容
                if (delta.content) {
                  content += delta.content
                }
                
                // 更新消息
                updateMessage(messageId, {
                  content: content,
                  thinking: reasoning || undefined,
                  sources: sourceRefs.length > 0 ? sourceRefs : undefined,
                  isStreaming: true
                })
              }
            } catch (e) {
              console.warn('Parse error:', e)
            }
          }
        }
      }
    }
    
    // 完成流式输出
    const wasStopped = abortController.signal.aborted
    updateMessage(messageId, {
      content: content || (wasStopped ? '⏹️ 生成已停止' : '抱歉，生成回复时出现问题，请重试。'),
      thinking: reasoning || undefined,
      sources: sourceRefs.length > 0 ? sourceRefs : undefined,
      isStreaming: false
    })
    
  } catch (error) {
    // 检查是否是用户主动停止
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('生成已被用户停止')
      const currentConv = getCurrentConversation()
      const currentContent = currentConv?.messages.find(m => m.id === messageId)?.content || ''
      updateMessage(messageId, {
        content: currentContent || '⏹️ 生成已停止',
        isStreaming: false
      })
      return
    }
    
    console.error('API Error:', error)
    updateMessage(messageId, {
      content: `❌ **请求失败**\n\n${error instanceof Error ? error.message : '未知错误，请检查网络连接和 API 配置。'}`,
      thinking: undefined,
      isStreaming: false
    })
  } finally {
    // 清理 AbortController
    if (currentAbortController === abortController) {
      currentAbortController = null
    }
    setLoading(false)
  }
}

// 提取结果接口
export interface ExtractResult {
  projectName?: string  // 项目名称
  items: { name: string; quantity?: string }[]  // 标的物列表
}

/**
 * 使用 Qwen 模型从对话中提取项目名称和产品型号/标的物
 */
export async function extractItemsWithAI(messages: { role: string; content: string }[]): Promise<ExtractResult> {
  if (!API_CONFIG.apiKey) {
    console.error('API Key 未配置')
    return { items: [] }
  }
  
  // 构建对话内容摘要
  const conversationSummary = messages
    .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
    .join('\n\n')
  
  const extractPrompt = `请从以下对话内容中提取采购项目名称和所有产品型号/标的物信息。

对话内容：
${conversationSummary}

请以 JSON 对象格式返回，包含以下字段：
- projectName: 采购项目名称（如果有的话，如"XX采购项目"、"XX招标项目"等）
- items: 产品型号数组，每个元素包含：
  - name: 产品型号名称（必填）
  - quantity: 数量（如有）

只返回 JSON 对象，不要包含任何其他文字。如果没有找到项目名称，projectName 字段可以为空字符串或不返回。如果没有找到产品型号，items 返回空数组 []。

示例返回格式：
{"projectName": "2024年度通信设备采购项目", "items": [{"name": "STM32F103C8T6", "quantity": "100"}, {"name": "ESP32-WROOM-32"}]}`

  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V3', // 使用 DeepSeek V3 模型提取
        messages: [
          { role: 'user', content: extractPrompt }
        ],
        max_tokens: 2048,
        temperature: 0.1, // 低温度，更精确
        stream: false
      })
    })
    
    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`)
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || '{}'
    
    // 尝试解析 JSON
    try {
      // 提取 JSON 对象部分（处理可能包含的 markdown 代码块）
      let jsonStr = content
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        jsonStr = jsonMatch[0]
      }
      
      const result = JSON.parse(jsonStr)
      
      // 兼容旧格式（直接返回数组的情况）
      if (Array.isArray(result)) {
        return {
          items: result.filter(item => item.name && typeof item.name === 'string')
        }
      }
      
      // 新格式
      const projectName = result.projectName && typeof result.projectName === 'string' 
        ? result.projectName 
        : undefined
      const items = Array.isArray(result.items) 
        ? result.items.filter((item: { name?: string }) => item.name && typeof item.name === 'string')
        : []
      
      return { projectName, items }
    } catch (parseError) {
      console.error('解析 AI 返回的 JSON 失败:', parseError, content)
    }
    
    return { items: [] }
  } catch (error) {
    console.error('AI 提取标的物失败:', error)
    return { items: [] }
  }
}
