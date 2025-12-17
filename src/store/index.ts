import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppState, Theme, Conversation, Message } from '../types'
import { DEFAULT_MODEL } from '../config'

const generateId = () => Math.random().toString(36).substring(2, 15)

const generateTitle = (firstMessage: string): string => {
  const maxLength = 20
  const cleaned = firstMessage.replace(/\n/g, ' ').trim()
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.substring(0, maxLength) + '...'
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'dark' as Theme,
      sidebarCollapsed: false,
      conversations: [],
      currentConversationId: null,
      isLoading: false,
      selectedModel: DEFAULT_MODEL,

      toggleTheme: () => {
        set((state) => ({
          theme: state.theme === 'dark' ? 'light' : 'dark'
        }))
      },

      initTheme: () => {
        const stored = localStorage.getItem('sourcing-agent-storage')
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.state?.theme) return
        }
        
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        set({ theme: prefersDark ? 'dark' : 'light' })
      },

      toggleSidebar: () => {
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed
        }))
      },

      createConversation: () => {
        const newConversation: Conversation = {
          id: generateId(),
          title: '新对话',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        
        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          currentConversationId: newConversation.id
        }))
      },

      selectConversation: (id: string) => {
        set({ currentConversationId: id })
      },

      deleteConversation: (id: string) => {
        set((state) => {
          const filtered = state.conversations.filter(c => c.id !== id)
          const newCurrentId = state.currentConversationId === id
            ? (filtered[0]?.id || null)
            : state.currentConversationId
          
          return {
            conversations: filtered,
            currentConversationId: newCurrentId
          }
        })
      },

      renameConversation: (id: string, newTitle: string) => {
        set((state) => ({
          conversations: state.conversations.map(conv =>
            conv.id === id
              ? { ...conv, title: newTitle, updatedAt: Date.now() }
              : conv
          )
        }))
      },

      addMessage: (messageData) => {
        const { currentConversationId, createConversation } = get()
        
        let targetConversationId = currentConversationId
        
        if (!targetConversationId) {
          createConversation()
          targetConversationId = get().currentConversationId
        }
        
        const newMessage: Message = {
          ...messageData,
          id: generateId(),
          timestamp: Date.now()
        }
        
        set((state) => ({
          conversations: state.conversations.map(conv => {
            if (conv.id !== targetConversationId) return conv
            
            const updatedMessages = [...conv.messages, newMessage]
            const isFirstUserMessage = messageData.role === 'user' && conv.messages.length === 0
            
            return {
              ...conv,
              messages: updatedMessages,
              title: isFirstUserMessage ? generateTitle(messageData.content) : conv.title,
              updatedAt: Date.now()
            }
          })
        }))
        
        return newMessage.id
      },

      updateMessage: (messageId: string, updates: Partial<Message>) => {
        set((state) => ({
          conversations: state.conversations.map(conv => ({
            ...conv,
            messages: conv.messages.map(msg =>
              msg.id === messageId ? { ...msg, ...updates } : msg
            )
          }))
        }))
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      getCurrentConversation: () => {
        const { conversations, currentConversationId } = get()
        return conversations.find(c => c.id === currentConversationId) || null
      },

      setSelectedModel: (modelId: string) => {
        set({ selectedModel: modelId })
      }
    }),
    {
      name: 'sourcing-agent-storage',
      partialize: (state) => ({
        theme: state.theme,
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
        selectedModel: state.selectedModel
      })
    }
  )
)

