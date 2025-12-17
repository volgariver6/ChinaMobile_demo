// 可用模型列表
export interface ModelOption {
  id: string
  name: string
  description: string
  provider: string
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'Qwen/Qwen2.5-VL-72B-Instruct',
    name: 'Qwen2.5-VL-72B',
    description: '通义千问视觉语言模型，响应速度快',
    provider: '阿里云'
  },
  {
    id: 'deepseek-ai/DeepSeek-R1',
    name: 'DeepSeek-R1',
    description: '深度思考推理模型，支持思维链展示',
    provider: 'DeepSeek'
  },
  {
    id: 'deepseek-ai/DeepSeek-V3',
    name: 'DeepSeek-V3',
    description: '通用对话模型，性能均衡',
    provider: 'DeepSeek'
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen2.5-72B',
    description: '通义千问大语言模型，性能强劲',
    provider: '阿里云'
  }
]

// 默认模型
export const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V3'

// API 配置
export const API_CONFIG = {
  // 硅基流动平台 API 配置
  baseUrl: 'https://api.siliconflow.cn/v1',
  
  // API Key - 请在 .env 文件中配置，或直接替换为您的 API Key
  apiKey: import.meta.env.VITE_SILICONFLOW_API_KEY || '',
  
  // 请求参数
  maxTokens: 4096,
  temperature: 0.7,
  stream: true,
}

// System Prompt - 采购寻源专家角色设定
export const SYSTEM_PROMPT = `你是中国移动的智能寻源比价助手，一位资深采购寻源专家。

## 角色定位
- 专业的采购顾问，精通供应商评估与比价分析
- 擅长从非结构化数据中提取关键比价要素
- 输出风格严谨专业，数据精确可靠

## 核心能力
1. **方案分析**：解析 Excel、PDF、PPT 格式的采购方案和项目立项书，提取价格、规格等关键数据
2. **多维对比**：从价格、技术参数、商务条款等维度进行全面对比
3. **报告生成**：生成结构化的比价分析报告
4. **决策建议**：基于数据分析给出采购推荐

## 输出要求
- 使用 Markdown 格式输出，善用表格展示对比数据
- 数据要准确，计算要正确
- 给出明确的推荐建议和理由
- 保持专业、简洁、有条理的回答风格

## 注意事项
- 对敏感信息（如底价）保持谨慎
- 如用户未上传文件，引导用户上传采购方案或项目立项书
- 如信息不足，主动询问关键信息`
