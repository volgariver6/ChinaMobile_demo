import type { DataSource } from '../components/ToolSelector'
import type { SourceReference } from '../types'
import { queryHistoricalPerformance, querySecondaryPrice } from './moiApi'

const BOCHA_API_URL = 'https://api.bocha.cn/v1/web-search'
const BOCHA_API_KEY = 'sk-10d8268b4db242e396e713f69fb79d3c'

interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

interface WebSearchResponse {
  data?: {
    webPages?: {
      value?: WebSearchResult[]
    }
    summary?: string
  }
  error?: string
}

// 搜索结果的返回类型
export interface SearchResults {
  formattedText: string
  sources: SourceReference[]
}

// 搜索进度回调类型
export interface SearchProgress {
  stage: 'external' | 'internal'  // 当前阶段：外部数据源或内部数据源
  sourceName: string              // 当前正在搜索的数据源名称
  sourceType?: string             // 内部数据源类型
  itemName: string                // 当前正在搜索的标的物
  current: number                 // 当前进度
  total: number                   // 总数
  dimension?: string              // 评估维度（潜在供应商推荐时）
}

export type ProgressCallback = (progress: SearchProgress) => void

// 外部数据源ID列表
const EXTERNAL_SOURCE_IDS = ['ichipcheck', 'halfchip', '1688']

// 内部数据源ID及其用途描述
const INTERNAL_SOURCE_INFO: Record<string, { name: string; description: string }> = {
  'procurement_project': { name: '采购项目查询', description: '历史采购项目数据' },
  'potential_supplier': { name: '潜在供应商查询', description: '潜在供应商库数据' },
  'secondary_price': { name: '二采产品价格库', description: '二次采购历史价格数据' }
}

/**
 * 根据数据源生成搜索关键词
 */
function buildSearchQuery(baseQuery: string, source: DataSource): string {
  const sourceKeywords: Record<string, string> = {
    ichipcheck: '芯查查 价格 库存 供应商',
    halfchip: '半导小芯 元器件 价格 库存',
    '1688': '1688 批发 价格 供应商'
  }
  
  const keywords = sourceKeywords[source.id] || ''
  return `${baseQuery} ${keywords}`.trim()
}

/**
 * 调用博查搜索 API
 */
async function searchBocha(query: string): Promise<WebSearchResponse> {
  try {
    const response = await fetch(BOCHA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BOCHA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        summary: true,
        count: 10
      })
    })

    if (!response.ok) {
      throw new Error(`搜索请求失败: ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('博查搜索错误:', error)
    return {
      error: error instanceof Error ? error.message : '搜索失败'
    }
  }
}

/**
 * 搜索供应商的外部信息（市场份额、总体实力、关键能力）
 */
async function searchSupplierExternalInfo(
  supplierName: string,
  dimensions: string[],
  onProgress?: (dimension: string, status: 'searching' | 'done') => void
): Promise<{ text: string; sources: SourceReference[] }> {
  const allSources: SourceReference[] = []
  let resultText = `#### ${supplierName}\n\n`
  
  // 为每个维度搜索外部信息
  for (const dimension of dimensions) {
    if (dimension === '历史表现') continue // 历史表现已从内部数据库获取
    
    onProgress?.(dimension, 'searching')
    
    // 构建搜索关键词
    let searchKeywords = ''
    switch (dimension) {
      case '市场份额':
        searchKeywords = `${supplierName} 市场份额 行业排名 市场地位`
        break
      case '总体实力':
        searchKeywords = `${supplierName} 企业规模 注册资本 资质认证 公司实力`
        break
      case '关键能力':
        searchKeywords = `${supplierName} 技术能力 研发实力 生产能力 核心竞争力`
        break
      default:
        searchKeywords = `${supplierName} ${dimension}`
    }
    
    console.log(`搜索 [${supplierName}] 的 [${dimension}]:`, searchKeywords)
    
    try {
      const response = await searchBocha(searchKeywords)
      
      if (response.error) {
        resultText += `**${dimension}**: 搜索失败 - ${response.error}\n\n`
        continue
      }
      
      const webPages = response.data?.webPages?.value || []
      const summary = response.data?.summary || ''
      
      resultText += `**${dimension}**\n`
      
      if (summary) {
        resultText += `${summary}\n\n`
      }
      
      if (webPages.length > 0) {
        // 只取前3条结果
        webPages.slice(0, 3).forEach((page, index) => {
          resultText += `${index + 1}. ${page.title}\n`
          resultText += `   ${page.snippet}\n\n`
          
          allSources.push({
            title: page.title,
            url: page.url,
            snippet: page.snippet,
            sourceName: `${dimension}-外部搜索`,
            itemName: supplierName
          })
        })
      } else {
        resultText += `暂未找到相关信息\n\n`
      }
      
      onProgress?.(dimension, 'done')
      
    } catch (error) {
      console.error(`搜索 ${supplierName} ${dimension} 失败:`, error)
      resultText += `**${dimension}**: 搜索出错\n\n`
    }
  }
  
  return { text: resultText, sources: allSources }
}

/**
 * 执行单个外部数据源+标的物的搜索
 */
async function searchExternalSourceItem(
  itemName: string,
  source: DataSource
): Promise<{ text: string; sources: SourceReference[] }> {
  const searchQuery = buildSearchQuery(itemName, source)
  console.log(`搜索外部数据源 [${source.name}] + [${itemName}]:`, searchQuery)
  
  const response = await searchBocha(searchQuery)
  const sources: SourceReference[] = []
  
  if (response.error) {
    return {
      text: `#### ${itemName}\n搜索失败: ${response.error}\n`,
      sources: []
    }
  }
  
  const webPages = response.data?.webPages?.value || []
  const summary = response.data?.summary || ''
  
  let text = `#### ${itemName}\n`
  
  if (summary) {
    text += `**摘要**: ${summary}\n\n`
  }
  
  if (webPages.length > 0) {
    webPages.slice(0, 5).forEach((page, index) => {
      text += `${index + 1}. **${page.title}**\n`
      text += `   ${page.snippet}\n`
      text += `   来源: ${page.url}\n\n`
      
      // 收集结构化的数据源信息，包含标的物名称
      sources.push({
        title: page.title,
        url: page.url,
        snippet: page.snippet,
        sourceName: source.name,
        itemName: itemName
      })
    })
  } else {
    text += '未找到相关结果\n'
  }
  
  return { text, sources }
}

/**
 * 内部数据源搜索
 * potential_supplier 使用 MOI API 查询真实数据
 * 其他数据源使用模拟数据
 */
async function searchInternalSourceItem(
  itemName: string,
  source: DataSource,
  evaluationDimensions?: string[]
): Promise<{ text: string; sources: SourceReference[] }> {
  console.log(`搜索内部数据源 [${source.name}] + [${itemName}]`, evaluationDimensions)
  
  const sourceInfo = INTERNAL_SOURCE_INFO[source.id]
  let text = ''
  const sources: SourceReference[] = []
  
  // 根据不同的内部数据源类型处理
  if (source.id === 'procurement_project') {
    // 采购项目查询 - 模拟数据
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500))
    
    text = `#### ${itemName}\n`
    text += `**数据来源**: ${sourceInfo.description}\n\n`
    text += `**历史采购记录**:\n`
    text += `- 2024年Q3采购项目: 采购数量 500件，成交单价 ¥128.50，供应商: 华为技术有限公司\n`
    text += `- 2024年Q2采购项目: 采购数量 300件，成交单价 ¥132.00，供应商: 中兴通讯股份有限公司\n`
    text += `- 2024年Q1采购项目: 采购数量 200件，成交单价 ¥135.80，供应商: 烽火通信科技股份有限公司\n\n`
    
    sources.push({
      title: `${itemName} - 历史采购项目记录`,
      url: 'internal://procurement-project',
      snippet: '历史采购项目数据，包含采购数量、成交价格、供应商信息',
      sourceName: source.name,
      itemName: itemName
    })
  } else if (source.id === 'potential_supplier') {
    // 潜在供应商推荐 - 两阶段查询
    // 第一阶段：从内部数据库查询历史表现，获取供应商名单
    // 第二阶段：使用 Web Search 查询供应商的外部信息
    
    const dimensions = evaluationDimensions || ['历史表现', '市场份额', '总体实力', '关键能力']
    const externalDimensions = dimensions.filter(d => d !== '历史表现')
    
    console.log(`开始查询供应商评估数据，标的物: ${itemName}，维度: ${dimensions.join(', ')}`)
    
    try {
      // ============ 第一阶段：查询内部数据库获取历史表现 ============
      console.log('【第一阶段】查询内部数据库 - 历史表现')
      
      const { text: historyText, suppliers, rawResult } = await queryHistoricalPerformance(
        itemName,
        (status) => console.log(`[${itemName}] 历史表现查询: ${status}`)
      )
      
      text = `### 【${itemName}】潜在供应商推荐\n\n`
      text += `> 评估维度：${dimensions.join('、')}\n\n`
      text += `---\n\n`
      text += `## 一、内部数据分析（历史表现）\n\n`
      text += `> 以下数据来自内部采购数据库\n\n`
      text += historyText
      
      sources.push({
        title: `${itemName} - 历史表现（内部数据）`,
        url: 'internal://potential-supplier-history',
        snippet: `基于内部采购数据库的历史表现分析，共找到 ${suppliers.length} 个供应商`,
        sourceName: '内部数据库',
        itemName: itemName,
        queryResult: rawResult.columns && rawResult.rows ? {
          columns: rawResult.columns,
          rows: rawResult.rows
        } : undefined
      })
      
      // ============ 第二阶段：搜索供应商的外部信息 ============
      if (suppliers.length > 0 && externalDimensions.length > 0) {
        console.log(`【第二阶段】搜索外部信息，供应商: ${suppliers.join(', ')}，维度: ${externalDimensions.join(', ')}`)
        
        text += `\n---\n\n`
        text += `## 二、外部市场信息\n\n`
        text += `> 以下数据来自互联网公开信息，对排名前${Math.min(suppliers.length, 5)}的供应商进行市场调研\n\n`
        
        // 只对前5个供应商进行外部搜索（避免搜索过多）
        const topSuppliers = suppliers.slice(0, 5)
        
        for (let i = 0; i < topSuppliers.length; i++) {
          const supplier = topSuppliers[i]
          console.log(`搜索供应商 [${i + 1}/${topSuppliers.length}]: ${supplier}`)
          
          const { text: supplierText, sources: supplierSources } = await searchSupplierExternalInfo(
            supplier,
            externalDimensions,
            (dimension, status) => {
              console.log(`  - ${dimension}: ${status}`)
            }
          )
          
          text += `### ${i + 1}. ${supplier}\n\n`
          text += supplierText
          text += '\n'
          
          sources.push(...supplierSources)
        }
      } else if (externalDimensions.length > 0) {
        text += `\n---\n\n`
        text += `## 二、外部市场信息\n\n`
        text += `⚠️ 未从内部数据库找到供应商，无法进行外部信息搜索\n\n`
      }
      
      // 如果历史表现查询失败但有模拟数据
      if (rawResult.error) {
        text += `\n⚠️ 注意：内部数据库查询失败 (${rawResult.error})，以上为模拟数据\n`
      }
      
    } catch (error) {
      console.error('潜在供应商推荐查询失败:', error)
      // 降级到模拟数据
      text = `### 【${itemName}】潜在供应商推荐\n\n`
      text += `**数据来源**: ${sourceInfo.description}\n\n`
      text += `⚠️ 查询失败，显示模拟数据\n\n`
      text += `**潜在供应商列表**:\n`
      text += `| 供应商名称 | 企业性质 | 资质等级 | 合作历史 | 联系方式 |\n`
      text += `|-----------|---------|---------|---------|----------|\n`
      text += `| 深圳市科达电子有限公司 | 代理商 | A级 | 3年 | 0755-12345678 |\n`
      text += `| 上海锐芯微电子有限公司 | 原厂 | AAA级 | 5年 | 021-87654321 |\n`
      text += `| 北京中科创芯科技有限公司 | 代理商 | AA级 | 2年 | 010-56781234 |\n\n`
      
      sources.push({
        title: `${itemName} - 潜在供应商库（模拟数据）`,
        url: 'internal://potential-supplier',
        snippet: '潜在供应商数据，包含企业性质、资质等级、合作历史',
        sourceName: source.name,
        itemName: itemName
      })
    }
  } else if (source.id === 'secondary_price') {
    // 二采产品价格库 - 使用 MOI API 查询真实数据
    console.log(`查询二采价格数据，标的物: ${itemName}`)
    
    try {
      const { text: priceText, rawResult } = await querySecondaryPrice(
        itemName,
        (status) => console.log(`[${itemName}] 二采价格查询: ${status}`)
      )
      
      text = `### 【${itemName}】二采产品价格\n\n`
      text += `> 以下数据来自内部二采产品价格库\n\n`
      text += priceText
      
      const recordCount = rawResult.rows?.length || 0
      
      sources.push({
        title: `${itemName} - 二采历史价格（内部数据）`,
        url: 'internal://secondary-price-moi',
        snippet: `基于内部二采价格库查询，共找到 ${recordCount} 条价格记录`,
        sourceName: source.name,
        itemName: itemName,
        queryResult: rawResult.columns && rawResult.rows ? {
          columns: rawResult.columns,
          rows: rawResult.rows
        } : undefined
      })
      
      // 如果查询失败，显示提示
      if (rawResult.error) {
        text += `\n⚠️ 注意：查询出错 (${rawResult.error})\n`
      }
    } catch (error) {
      console.error('二采价格查询失败:', error)
      // 降级到模拟数据
      text = `#### ${itemName}\n`
      text += `**数据来源**: ${sourceInfo.description}\n\n`
      text += `⚠️ 查询失败，显示模拟数据\n\n`
      text += `**二采历史价格**:\n`
      text += `| 采购时间 | 采购渠道 | 单价(含税) | 数量 | 总金额 |\n`
      text += `|---------|---------|-----------|------|--------|\n`
      text += `| 2024-10 | 框架协议 | ¥125.00 | 1000 | ¥125,000 |\n`
      text += `| 2024-08 | 竞价采购 | ¥128.50 | 500 | ¥64,250 |\n`
      text += `| 2024-06 | 单一来源 | ¥130.00 | 200 | ¥26,000 |\n\n`
      
      sources.push({
        title: `${itemName} - 二采历史价格（模拟数据）`,
        url: 'internal://secondary-price',
        snippet: '二次采购历史价格数据，包含采购渠道、价格、数量',
        sourceName: source.name,
        itemName: itemName
      })
    }
  }
  
  return { text, sources }
}

/**
 * 执行多数据源多标的物搜索
 * 按照"数据源+标的物"分别查找，结果按数据源分组
 * 区分外部数据源和内部数据源
 * @param items 标的物列表
 * @param sources 数据源列表
 * @param onProgress 进度回调
 * @param evaluationDimensions 供应商评估维度（潜在供应商推荐时使用）
 * @param projectName 采购项目名称（可选）
 */
export async function performWebSearch(
  items: string[],
  sources: DataSource[],
  onProgress?: ProgressCallback,
  evaluationDimensions?: string[],
  projectName?: string
): Promise<SearchResults> {
  console.log('开始执行搜索:', { projectName, items, sources: sources.map(s => s.name), evaluationDimensions })
  
  // 区分外部和内部数据源
  const externalSources = sources.filter(s => EXTERNAL_SOURCE_IDS.includes(s.id))
  const internalSources = sources.filter(s => !EXTERNAL_SOURCE_IDS.includes(s.id))
  
  const externalResults: Map<string, string[]> = new Map()
  const internalResults: Map<string, string[]> = new Map()
  const allSources: SourceReference[] = []
  
  // 计算总搜索任务数
  const totalTasks = (externalSources.length + internalSources.length) * items.length
  let currentTask = 0
  
  // 1. 搜索外部数据源
  if (externalSources.length > 0) {
    console.log('开始搜索外部数据源...')
    for (const source of externalSources) {
      const sourceResults: string[] = []
      
      for (const item of items) {
        currentTask++
        // 触发进度回调
        onProgress?.({
          stage: 'external',
          sourceName: source.name,
          itemName: item,
          current: currentTask,
          total: totalTasks
        })
        
        const { text, sources: itemSources } = await searchExternalSourceItem(item, source)
        sourceResults.push(text)
        allSources.push(...itemSources)
      }
      
      externalResults.set(source.name, sourceResults)
    }
  }
  
  // 2. 搜索内部数据源
  if (internalSources.length > 0) {
    console.log('开始搜索内部数据源...')
    for (const source of internalSources) {
      const sourceResults: string[] = []
      const sourceInfo = INTERNAL_SOURCE_INFO[source.id]
      
      for (const item of items) {
        currentTask++
        // 触发进度回调
        onProgress?.({
          stage: 'internal',
          sourceName: source.name,
          sourceType: sourceInfo?.description,
          itemName: item,
          current: currentTask,
          total: totalTasks,
          dimension: source.id === 'potential_supplier' ? evaluationDimensions?.join('、') : undefined
        })
        
        // 如果是潜在供应商推荐，传递评估维度
        const dimensions = source.id === 'potential_supplier' ? evaluationDimensions : undefined
        const { text, sources: itemSources } = await searchInternalSourceItem(item, source, dimensions)
        sourceResults.push(text)
        allSources.push(...itemSources)
      }
      
      internalResults.set(source.name, sourceResults)
    }
  }
  
  // 格式化输出，区分外部和内部数据源
  let formattedText = `# 数据源搜索结果

`
  // 如果有项目名称，添加到报告中
  if (projectName) {
    formattedText += `**采购项目名称**: ${projectName}\n`
  }
  
  formattedText += `**查询标的物**: ${items.join('、')}
**外部数据源**: ${externalSources.length > 0 ? externalSources.map(s => s.name).join('、') : '无'}
**内部数据源**: ${internalSources.length > 0 ? internalSources.map(s => s.name).join('、') : '无'}

---

`
  
  // 添加外部数据源结果
  if (externalResults.size > 0) {
    formattedText += `## 一、外部数据源搜索结果

> 以下数据来自互联网公开信息，包括芯片查询平台、电商平台等第三方渠道。

`
    for (const [sourceName, results] of externalResults) {
      formattedText += `### ${sourceName}\n\n`
      formattedText += results.join('\n')
      formattedText += '\n---\n\n'
    }
  }
  
  // 添加内部数据源结果
  if (internalResults.size > 0) {
    formattedText += `## 二、内部数据源查询结果

> 以下数据来自企业内部系统，包括历史采购记录、供应商库、价格库等内部数据。

`
    for (const [sourceName, results] of internalResults) {
      const sourceId = internalSources.find(s => s.name === sourceName)?.id
      const sourceInfo = sourceId ? INTERNAL_SOURCE_INFO[sourceId] : null
      
      formattedText += `### ${sourceName}`
      if (sourceInfo) {
        formattedText += ` (${sourceInfo.description})`
      }
      formattedText += `\n\n`
      formattedText += results.join('\n')
      formattedText += '\n---\n\n'
    }
  }
  
  formattedText += `
---

请你作为一名资深采购寻源与价格分析专家，基于以上搜索结果，生成一份专业的《供应商寻源与比价报告》。

## 报告要求

### 数据来源说明
- **内部数据源**：
  - **采购项目查询**：历史采购项目的成交记录，是最可靠的参考基准
  - **潜在供应商推荐**：基于内部历史表现数据推荐的供应商，结合外部市场信息综合评估
  - **二采产品价格库**：二次采购的历史成交价格，体现实际采购成本
- **外部数据源**：来自互联网公开信息（芯查查、半导小芯、1688等），反映市场公开报价

### 供应商评估维度说明
如果数据中包含供应商评估信息，请按以下维度进行分析：
- **历史表现**：基于内部数据库的中标次数、中标率、累计金额等
- **市场份额**：供应商在行业中的市场占有率和排名
- **总体实力**：企业规模、注册资本、资质认证等综合实力
- **关键能力**：技术研发、生产制造、服务响应等核心竞争力

### 数据严谨性
- 涉及价格对比时，必须明确区分"含税"与"不含税"，若信息缺失需在报告中注明
- 内部数据（历史采购价格、历史表现）应作为最重要的参考依据
- 外部市场信息用于补充了解供应商的市场地位和综合实力

## 报告格式

请严格按照以下结构输出：

### 一、标的物概述
- 产品名称
- 规格型号
- 关键参数提取

### 二、内部数据分析（如有内部数据源）
- **历史采购情况**：基于采购项目查询的历史成交数据
- **历史价格区间**：基于二采价格库的历史成交价格

### 三、潜在供应商评估（如有潜在供应商推荐数据）

#### 3.1 供应商历史表现排名
基于内部数据库的历史中标数据，列出表现最佳的供应商

#### 3.2 供应商综合评估
| 排名 | 供应商名称 | 历史表现 | 市场份额 | 总体实力 | 关键能力 | 综合评分 |
|-----|----------|---------|---------|---------|---------|---------|
（根据内部历史数据和外部市场信息综合评估）

#### 3.3 重点供应商详细分析
对排名前3-5的供应商进行详细分析：
- 历史合作表现（内部数据）
- 市场地位（外部信息）
- 企业实力（外部信息）
- 核心能力（外部信息）
- 合作建议

### 四、外部市场调研（如有外部数据源）
- **市场供需格局**：描述当前市场是买方还是卖方市场
- **价格趋势**：分析近期价格走势
- **竞争格局**：主要供应商的市场分布

### 五、价格比对与分析

#### 5.1 价格对比表
| 渠道来源 | 数据类型 | 产品/型号 | 报价 (元) | 与历史成交价偏差 | 备注 |
|---------|---------|----------|----------|----------------|------|

#### 5.2 综合建议
- **供应商推荐排序**：综合内部历史表现和外部市场信息，给出推荐优先级
- **采购策略建议**：(例如：建议招标、建议单一来源谈判、建议寻找替代品)
- **目标价建议**：综合内部历史成交价和外部市场价格，建议合理的成交目标价区间
- **风险提示**：需要关注的供应商风险或市场风险

`
  
  console.log('搜索结果格式化完成，长度:', formattedText.length)
  console.log('收集到数据源数量:', allSources.length)
  
  return {
    formattedText,
    sources: allSources
  }
}

