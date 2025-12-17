import { X, Check, Cpu, Zap } from 'lucide-react'
import { useStore } from '../../store'
import { AVAILABLE_MODELS } from '../../config'
import './ModelSettings.css'

interface ModelSettingsProps {
  isOpen: boolean
  onClose: () => void
}

export default function ModelSettings({ isOpen, onClose }: ModelSettingsProps) {
  const { selectedModel, setSelectedModel } = useStore()

  if (!isOpen) return null

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId)
  }

  return (
    <div className="model-settings-overlay" onClick={onClose}>
      <div className="model-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="model-settings-header">
          <div className="model-settings-title">
            <Cpu size={20} />
            <span>模型设置</span>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="model-settings-content">
          <p className="settings-description">
            选择用于对话的 AI 模型，不同模型在速度和能力上有所差异
          </p>
          
          <div className="models-list">
            {AVAILABLE_MODELS.map(model => (
              <div
                key={model.id}
                className={`model-item ${selectedModel === model.id ? 'selected' : ''}`}
                onClick={() => handleSelectModel(model.id)}
              >
                <div className="model-radio">
                  {selectedModel === model.id && <Check size={14} />}
                </div>
                <div className="model-info">
                  <div className="model-header">
                    <span className="model-name">{model.name}</span>
                    <span className="model-provider">{model.provider}</span>
                  </div>
                  <span className="model-desc">{model.description}</span>
                </div>
                {model.id.includes('Qwen2.5-VL') && (
                  <div className="model-badge fast">
                    <Zap size={12} />
                    <span>快速</span>
                  </div>
                )}
                {model.id.includes('DeepSeek-R1') && (
                  <div className="model-badge thinking">
                    <span>🧠 深度思考</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="model-settings-footer">
          <div className="current-model">
            当前模型: <strong>{AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name || selectedModel}</strong>
          </div>
          <button className="done-btn" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

