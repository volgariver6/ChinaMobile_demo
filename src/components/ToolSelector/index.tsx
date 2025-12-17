import { useState, useEffect, useRef } from 'react'
import { FileSearch, X, Check, Globe, Database, Package, AlertCircle, BarChart3, Plus, Pencil, Trash2, FolderOpen } from 'lucide-react'
import './ToolSelector.css'

export interface DataSource {
  id: string
  name: string
  description: string
  enabled: boolean
}

export interface ExtractedItem {
  id: string
  name: string
  quantity?: string
  selected: boolean
}

// 供应商评估维度
export interface EvaluationDimension {
  id: string
  name: string
  description: string
  selected: boolean
}

interface ToolSelectorProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (sources: DataSource[], selectedItems: string[], evaluationDimensions?: string[], projectName?: string) => void
  extractedItems: ExtractedItem[]
  extractedProjectName?: string  // AI 提取的项目名称
}

const externalDataSources: DataSource[] = [
  {
    id: 'ichipcheck',
    name: '芯查查',
    description: '芯片供应商信息查询',
    enabled: false
  },
  {
    id: 'halfchip',
    name: '半导小芯',
    description: '半导体行业数据',
    enabled: false
  },
  {
    id: '1688',
    name: '1688',
    description: '阿里巴巴批发平台',
    enabled: false
  }
]

const internalDataSources: DataSource[] = [
  {
    id: 'procurement_project',
    name: '采购项目查询',
    description: '查询历史采购项目信息',
    enabled: false
  },
  {
    id: 'potential_supplier',
    name: '潜在供应商推荐',
    description: '基于多维度评估推荐潜在供应商',
    enabled: false
  },
  {
    id: 'secondary_price',
    name: '二采产品价格库',
    description: '二次采购产品价格数据',
    enabled: false
  }
]

// 供应商评估维度定义
const supplierEvaluationDimensions: EvaluationDimension[] = [
  {
    id: 'historical_performance',
    name: '历史表现',
    description: '供应商过往合作的交付质量、按时交货率等表现',
    selected: true
  },
  {
    id: 'market_share',
    name: '市场份额',
    description: '供应商在相关市场的占有率和行业地位',
    selected: true
  },
  {
    id: 'overall_strength',
    name: '总体实力',
    description: '企业规模、财务状况、资质认证等综合实力',
    selected: true
  },
  {
    id: 'key_capability',
    name: '关键能力',
    description: '技术研发、生产制造、服务响应等核心能力',
    selected: true
  }
]

export default function ToolSelector({ isOpen, onClose, onConfirm, extractedItems, extractedProjectName }: ToolSelectorProps) {
  const [selectedExternalSources, setSelectedExternalSources] = useState<DataSource[]>(
    externalDataSources.map(s => ({ ...s }))
  )
  const [selectedInternalSources, setSelectedInternalSources] = useState<DataSource[]>(
    internalDataSources.map(s => ({ ...s }))
  )
  const [selectedItems, setSelectedItems] = useState<ExtractedItem[]>([])
  const [evaluationDimensions, setEvaluationDimensions] = useState<EvaluationDimension[]>(
    supplierEvaluationDimensions.map(d => ({ ...d }))
  )
  
  // 项目名称状态
  const [projectName, setProjectName] = useState('')
  
  // 标的物编辑状态
  const [isAddingItem, setIsAddingItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemName, setEditingItemName] = useState('')
  const newItemInputRef = useRef<HTMLInputElement>(null)
  const editItemInputRef = useRef<HTMLInputElement>(null)

  // 检查是否选中了潜在供应商推荐
  const isPotentialSupplierSelected = selectedInternalSources.find(
    s => s.id === 'potential_supplier'
  )?.enabled || false

  // 当弹窗打开时，重置所有选择状态
  useEffect(() => {
    if (isOpen) {
      // 重置外部数据源选择状态
      setSelectedExternalSources(externalDataSources.map(s => ({ ...s })))
      // 重置内部数据源选择状态
      setSelectedInternalSources(internalDataSources.map(s => ({ ...s })))
      // 重置标的物选择状态
      setSelectedItems(extractedItems.map(item => ({ ...item, selected: true })))
      // 重置评估维度选择状态
      setEvaluationDimensions(supplierEvaluationDimensions.map(d => ({ ...d })))
      // 设置项目名称（AI 提取的或空）
      setProjectName(extractedProjectName || '')
    }
  }, [extractedItems, extractedProjectName, isOpen])

  if (!isOpen) return null

  const toggleExternalSource = (id: string) => {
    setSelectedExternalSources(prev =>
      prev.map(source =>
        source.id === id ? { ...source, enabled: !source.enabled } : source
      )
    )
  }

  const toggleInternalSource = (id: string) => {
    setSelectedInternalSources(prev =>
      prev.map(source =>
        source.id === id ? { ...source, enabled: !source.enabled } : source
      )
    )
  }

  const toggleItem = (id: string) => {
    setSelectedItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    )
  }

  const selectAllItems = () => {
    setSelectedItems(prev => prev.map(item => ({ ...item, selected: true })))
  }

  const deselectAllItems = () => {
    setSelectedItems(prev => prev.map(item => ({ ...item, selected: false })))
  }

  // 添加新标的物
  const handleAddItem = () => {
    if (newItemName.trim()) {
      const newItem: ExtractedItem = {
        id: `manual-${Date.now()}`,
        name: newItemName.trim(),
        selected: true
      }
      setSelectedItems(prev => [...prev, newItem])
      setNewItemName('')
      setIsAddingItem(false)
    }
  }

  // 开始编辑标的物
  const startEditItem = (item: ExtractedItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingItemId(item.id)
    setEditingItemName(item.name)
    setTimeout(() => editItemInputRef.current?.focus(), 0)
  }

  // 保存编辑的标的物
  const saveEditItem = () => {
    if (editingItemName.trim() && editingItemId) {
      setSelectedItems(prev =>
        prev.map(item =>
          item.id === editingItemId ? { ...item, name: editingItemName.trim() } : item
        )
      )
    }
    setEditingItemId(null)
    setEditingItemName('')
  }

  // 删除标的物
  const deleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedItems(prev => prev.filter(item => item.id !== id))
  }

  // 处理添加输入框的键盘事件
  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddItem()
    } else if (e.key === 'Escape') {
      setIsAddingItem(false)
      setNewItemName('')
    }
  }

  // 处理编辑输入框的键盘事件
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEditItem()
    } else if (e.key === 'Escape') {
      setEditingItemId(null)
      setEditingItemName('')
    }
  }

  // 显示添加输入框
  const showAddInput = () => {
    setIsAddingItem(true)
    setTimeout(() => newItemInputRef.current?.focus(), 0)
  }

  // 评估维度相关操作
  const toggleEvaluationDimension = (id: string) => {
    setEvaluationDimensions(prev =>
      prev.map(dim =>
        dim.id === id ? { ...dim, selected: !dim.selected } : dim
      )
    )
  }

  const selectAllDimensions = () => {
    setEvaluationDimensions(prev => prev.map(dim => ({ ...dim, selected: true })))
  }

  const deselectAllDimensions = () => {
    setEvaluationDimensions(prev => prev.map(dim => ({ ...dim, selected: false })))
  }

  const handleConfirm = () => {
    const enabledExternalSources = selectedExternalSources.filter(s => s.enabled)
    const enabledInternalSources = selectedInternalSources.filter(s => s.enabled)
    const enabledSources = [...enabledExternalSources, ...enabledInternalSources]
    const checkedItems = selectedItems.filter(item => item.selected)
    const selectedDimensions = evaluationDimensions.filter(d => d.selected)
    
    if (enabledSources.length === 0) {
      alert('请至少选择一个数据源')
      return
    }
    if (checkedItems.length === 0) {
      alert('请至少选择一个标的物')
      return
    }
    
    // 如果选择了潜在供应商推荐但没有选择评估维度，给出提示
    if (isPotentialSupplierSelected && selectedDimensions.length === 0) {
      alert('请至少选择一个供应商评估维度')
      return
    }
    
    // 传递评估维度名称（如果选择了潜在供应商推荐）
    const dimensionNames = isPotentialSupplierSelected 
      ? selectedDimensions.map(d => d.name)
      : undefined
    
    // 传递项目名称（如果有）
    const finalProjectName = projectName.trim() || undefined
    
    onConfirm(enabledSources, checkedItems.map(item => item.name), dimensionNames, finalProjectName)
    // 重置状态
    setSelectedExternalSources(externalDataSources.map(s => ({ ...s })))
    setSelectedInternalSources(internalDataSources.map(s => ({ ...s })))
    setSelectedItems([])
    setEvaluationDimensions(supplierEvaluationDimensions.map(d => ({ ...d })))
    setProjectName('')
  }

  const handleClose = () => {
    setSelectedExternalSources(externalDataSources.map(s => ({ ...s })))
    setSelectedInternalSources(internalDataSources.map(s => ({ ...s })))
    setSelectedItems([])
    setEvaluationDimensions(supplierEvaluationDimensions.map(d => ({ ...d })))
    setProjectName('')
    onClose()
  }

  const selectedCount = selectedItems.filter(item => item.selected).length
  const selectedDimensionCount = evaluationDimensions.filter(d => d.selected).length

  return (
    <div className="tool-selector-overlay" onClick={handleClose}>
      <div className="tool-selector-modal" onClick={e => e.stopPropagation()}>
        <div className="tool-selector-header">
          <div className="tool-selector-title">
            <FileSearch size={20} />
            <span>寻源比价报告生成</span>
          </div>
          <button className="close-btn" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className="tool-selector-content">
          {/* 项目名称 */}
          <div className="project-name-section">
            <div className="section-header">
              <label className="section-label">
                <FolderOpen size={16} />
                <span>项目名称</span>
                <span className="optional-tag">选填</span>
              </label>
            </div>
            <div className="project-name-input-wrapper">
              <input
                type="text"
                className="project-name-input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="输入本次采购的项目名称，如：2024年度通信设备采购项目"
              />
              {projectName && (
                <button 
                  className="clear-project-name-btn"
                  onClick={() => setProjectName('')}
                  title="清除"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* 标的物选择 */}
          <div className="items-section">
            <div className="section-header">
              <label className="section-label">
                <Package size={16} />
                <span>标的物信息</span>
                {selectedItems.length > 0 && (
                  <span className="item-count">
                    已选 {selectedCount}/{selectedItems.length}
                  </span>
                )}
              </label>
              <div className="select-actions">
                {selectedItems.length > 0 && (
                  <>
                    <button className="select-action-btn" onClick={selectAllItems}>全选</button>
                    <button className="select-action-btn" onClick={deselectAllItems}>取消全选</button>
                  </>
                )}
                <button className="select-action-btn add-btn" onClick={showAddInput}>
                  <Plus size={14} />
                  添加
                </button>
              </div>
            </div>
            
            <div className="items-list">
              {selectedItems.map(item => (
                <div
                  key={item.id}
                  className={`item-row ${item.selected ? 'selected' : ''}`}
                  onClick={() => editingItemId !== item.id && toggleItem(item.id)}
                >
                  <div className="item-checkbox">
                    {item.selected && <Check size={14} />}
                  </div>
                  
                  {editingItemId === item.id ? (
                    // 编辑模式
                    <div className="item-edit-form" onClick={e => e.stopPropagation()}>
                      <input
                        ref={editItemInputRef}
                        type="text"
                        value={editingItemName}
                        onChange={e => setEditingItemName(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={saveEditItem}
                        className="item-edit-input"
                        placeholder="输入标的物名称"
                      />
                    </div>
                  ) : (
                    // 显示模式
                    <>
                      <div className="item-info">
                        <span className="item-name">{item.name}</span>
                        {item.quantity && (
                          <span className="item-quantity">数量: {item.quantity}</span>
                        )}
                      </div>
                      <div className="item-actions">
                        <button 
                          className="item-action-btn edit-btn"
                          onClick={(e) => startEditItem(item, e)}
                          title="编辑"
                        >
                          <Pencil size={14} />
                        </button>
                        <button 
                          className="item-action-btn delete-btn"
                          onClick={(e) => deleteItem(item.id, e)}
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              
              {/* 添加新标的物输入框 */}
              {isAddingItem && (
                <div className="item-row add-item-row">
                  <div className="item-checkbox">
                    <Plus size={14} />
                  </div>
                  <div className="item-add-form">
                    <input
                      ref={newItemInputRef}
                      type="text"
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      onKeyDown={handleAddKeyDown}
                      className="item-add-input"
                      placeholder="输入标的物名称，按 Enter 确认"
                    />
                    <div className="add-form-actions">
                      <button 
                        className="add-confirm-btn"
                        onClick={handleAddItem}
                        disabled={!newItemName.trim()}
                      >
                        确认
                      </button>
                      <button 
                        className="add-cancel-btn"
                        onClick={() => { setIsAddingItem(false); setNewItemName(''); }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 空状态提示 */}
              {selectedItems.length === 0 && !isAddingItem && (
                <div className="empty-items">
                  <AlertCircle size={24} />
                  <p>暂无可用的标的物</p>
                  <span>请先上传采购方案或点击"添加"手动添加标的物</span>
                </div>
              )}
            </div>
          </div>

          {/* 外部数据源 */}
          <div className="sources-section">
            <div className="section-header">
              <label className="section-label">
                <Globe size={16} />
                <span>外部数据源</span>
              </label>
            </div>
            <div className="sources-list">
              {selectedExternalSources.map(source => (
                <div
                  key={source.id}
                  className={`source-item ${source.enabled ? 'selected' : ''}`}
                  onClick={() => toggleExternalSource(source.id)}
                >
                  <div className="source-checkbox">
                    {source.enabled && <Check size={14} />}
                  </div>
                  <div className="source-info">
                    <span className="source-name">{source.name}</span>
                    <span className="source-desc">{source.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 内部数据源 */}
          <div className="sources-section">
            <div className="section-header">
              <label className="section-label">
                <Database size={16} />
                <span>内部数据源</span>
              </label>
            </div>
            <div className="sources-list">
              {selectedInternalSources.map(source => (
                <div key={source.id} className="source-item-wrapper">
                  <div
                    className={`source-item ${source.enabled ? 'selected' : ''}`}
                    onClick={() => toggleInternalSource(source.id)}
                  >
                    <div className="source-checkbox">
                      {source.enabled && <Check size={14} />}
                    </div>
                    <div className="source-info">
                      <span className="source-name">{source.name}</span>
                      <span className="source-desc">{source.description}</span>
                    </div>
                  </div>
                  
                  {/* 供应商评估维度 - 嵌套在潜在供应商推荐下方 */}
                  {source.id === 'potential_supplier' && source.enabled && (
                    <div className="evaluation-nested">
                      <div className="evaluation-header">
                        <div className="evaluation-title">
                          <BarChart3 size={14} />
                          <span>评估维度</span>
                          <span className="dimension-count">
                            {selectedDimensionCount}/{evaluationDimensions.length}
                          </span>
                        </div>
                        <div className="dimension-actions">
                          <button 
                            className="dimension-action-btn" 
                            onClick={(e) => { e.stopPropagation(); selectAllDimensions(); }}
                          >
                            全选
                          </button>
                          <button 
                            className="dimension-action-btn" 
                            onClick={(e) => { e.stopPropagation(); deselectAllDimensions(); }}
                          >
                            清空
                          </button>
                        </div>
                      </div>
                      <div className="dimension-grid">
                        {evaluationDimensions.map(dimension => (
                          <div
                            key={dimension.id}
                            className={`dimension-item ${dimension.selected ? 'selected' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleEvaluationDimension(dimension.id); }}
                            title={dimension.description}
                          >
                            <div className="dimension-checkbox">
                              {dimension.selected && <Check size={12} />}
                            </div>
                            <span className="dimension-name">{dimension.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="tool-selector-footer">
          <button className="cancel-btn" onClick={handleClose}>
            取消
          </button>
          <button 
            className="confirm-btn" 
            onClick={handleConfirm}
            disabled={selectedItems.length === 0}
          >
            <FileSearch size={16} />
            <span>开始生成报告</span>
          </button>
        </div>
      </div>
    </div>
  )
}

