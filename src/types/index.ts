// SQL 查询结果类型（用于内部数据源展示）
export interface QueryResultData {
  columns: string[]
  rows: Record<string, unknown>[]
  sql?: string  // 执行的 SQL 语句（可选）
}

export interface SourceReference {
  title: string
  url: string
  snippet: string
  sourceName: string  // 数据源名称，如"芯查查"、"1688"
  itemName?: string   // 标的物名称
  queryResult?: QueryResultData  // 内部数据源的查询结果
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  files?: UploadedFile[]
  sources?: SourceReference[]  // 参考数据源
  timestamp: number
  isStreaming?: boolean
}

export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export type Theme = 'light' | 'dark'

export interface AppState {
  theme: Theme
  sidebarCollapsed: boolean
  conversations: Conversation[]
  currentConversationId: string | null
  isLoading: boolean
  selectedModel: string
  
  // Actions
  toggleTheme: () => void
  initTheme: () => void
  toggleSidebar: () => void
  createConversation: () => void
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, newTitle: string) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  updateMessage: (messageId: string, updates: Partial<Message>) => void
  setLoading: (loading: boolean) => void
  getCurrentConversation: () => Conversation | null
  setSelectedModel: (modelId: string) => void
}

