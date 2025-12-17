import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import JSZip from 'jszip'

// 设置 PDF.js worker - 使用本地 worker 或 CDN
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
} catch (e) {
  console.warn('PDF.js worker 设置失败:', e)
}

export interface ParsedFile {
  name: string
  type: string
  content: string
  error?: string
}

/**
 * 解析上传的文件，提取文本内容
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const result: ParsedFile = {
    name: file.name,
    type: ext,
    content: ''
  }

  console.log(`开始解析文件: ${file.name}, 类型: ${ext}, 大小: ${file.size} bytes`)

  try {
    switch (ext) {
      case 'xlsx':
      case 'xls':
      case 'csv':
        result.content = await parseExcel(file)
        break
      case 'pdf':
        result.content = await parsePDF(file)
        break
      case 'docx':
        result.content = await parseWord(file)
        break
      case 'doc':
        // .doc 格式需要特殊处理，mammoth 主要支持 .docx
        result.content = `[注意: .doc 是旧版 Word 格式，建议转换为 .docx 后重新上传以获得更好的解析效果]\n\n`
        result.content += await parseWord(file).catch(() => '无法解析旧版 .doc 文件')
        break
      case 'txt':
        result.content = await parseText(file)
        break
      case 'pptx':
        result.content = await parsePPTX(file)
        break
      case 'ppt':
        result.content = `[注意: .ppt 是旧版 PowerPoint 格式，建议转换为 .pptx 后重新上传以获得更好的解析效果]`
        break
      default:
        result.content = `[不支持的文件格式: ${ext}]`
        result.error = '不支持的文件格式'
    }
    
    console.log(`文件 ${file.name} 解析完成，内容长度: ${result.content.length}`)
    
  } catch (error) {
    console.error(`解析文件 ${file.name} 失败:`, error)
    result.content = `[文件解析失败: ${file.name}] - ${error instanceof Error ? error.message : '未知错误'}`
    result.error = error instanceof Error ? error.message : '未知错误'
  }

  return result
}

/**
 * 解析多个文件
 */
export async function parseFiles(files: File[]): Promise<ParsedFile[]> {
  console.log(`开始解析 ${files.length} 个文件`)
  const results = await Promise.all(files.map(file => parseFile(file)))
  console.log('所有文件解析完成:', results.map(r => ({ name: r.name, contentLength: r.content.length, error: r.error })))
  return results
}

/**
 * 将解析结果格式化为提示文本
 */
export function formatParsedFilesForPrompt(parsedFiles: ParsedFile[]): string {
  if (parsedFiles.length === 0) return ''

  const parts = parsedFiles.map((file, index) => {
    const header = `=== 文件 ${index + 1}: ${file.name} ===`
    if (file.error) {
      return `${header}\n[解析错误: ${file.error}]`
    }
    // 限制单个文件内容长度，避免超出 token 限制
    const content = file.content.length > 15000 
      ? file.content.substring(0, 15000) + '\n...[内容过长，已截断]'
      : file.content
    return `${header}\n${content}`
  })

  const formatted = `以下是用户上传的文件内容，请基于这些内容进行分析：\n\n${parts.join('\n\n')}\n\n---\n\n请根据以上文件内容回答用户的问题：\n\n`
  console.log('格式化后的文件内容长度:', formatted.length)
  return formatted
}

/**
 * 解析 Excel 文件
 */
async function parseExcel(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  
  const result: string[] = []
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
    
    if (jsonData.length === 0) return
    
    result.push(`【工作表: ${sheetName}】`)
    
    // 转换为 Markdown 表格格式
    const headers = jsonData[0] as (string | number | null | undefined)[]
    if (headers && headers.length > 0) {
      // 清理表头中的 undefined/null
      const cleanHeaders = headers.map(h => h ?? '')
      result.push('| ' + cleanHeaders.join(' | ') + ' |')
      result.push('| ' + cleanHeaders.map(() => '---').join(' | ') + ' |')
      
      // 读取所有数据行
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as (string | number | null | undefined)[]
        if (row && row.length > 0) {
          const cleanRow = row.map(cell => cell ?? '')
          result.push('| ' + cleanRow.join(' | ') + ' |')
        }
      }
      
      result.push(`\n共 ${jsonData.length - 1} 行数据`)
    }
    result.push('')
  })
  
  const content = result.join('\n')
  if (!content.trim()) {
    return '[Excel 文件为空或无法读取内容]'
  }
  return content
}

/**
 * 解析 PDF 文件
 */
async function parsePDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    
    const textParts: string[] = []
    const maxPages = Math.min(pdf.numPages, 50) // 限制页数
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: unknown) => {
          const textItem = item as { str?: string }
          return textItem.str || ''
        })
        .join(' ')
      
      if (pageText.trim()) {
        textParts.push(`【第 ${i} 页】\n${pageText}`)
      }
    }
    
    if (pdf.numPages > maxPages) {
      textParts.push(`\n... 共 ${pdf.numPages} 页，仅解析前 ${maxPages} 页`)
    }
    
    const content = textParts.join('\n\n')
    if (!content.trim()) {
      return '[PDF 文件为空或为扫描件（无可提取文本）]'
    }
    return content
  } catch (error) {
    console.error('PDF 解析错误:', error)
    return `[PDF 解析失败: ${error instanceof Error ? error.message : '未知错误'}]`
  }
}

/**
 * 解析 Word 文件
 */
async function parseWord(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    if (!result.value.trim()) {
      return '[Word 文件为空或无法读取内容]'
    }
    return result.value
  } catch (error) {
    console.error('Word 解析错误:', error)
    return `[Word 解析失败: ${error instanceof Error ? error.message : '未知错误'}]`
  }
}

/**
 * 解析纯文本文件
 */
async function parseText(file: File): Promise<string> {
  const content = await file.text()
  if (!content.trim()) {
    return '[文本文件为空]'
  }
  return content
}

/**
 * 解析 PPTX 文件
 * PPTX 是一个 ZIP 包，包含多个 XML 文件
 */
async function parsePPTX(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)
    
    const textParts: string[] = []
    let slideIndex = 1
    
    // PPTX 文件结构: ppt/slides/slide1.xml, slide2.xml, ...
    const slideFiles: string[] = []
    
    // 收集所有幻灯片文件
    zip.forEach((relativePath) => {
      if (relativePath.match(/^ppt\/slides\/slide\d+\.xml$/)) {
        slideFiles.push(relativePath)
      }
    })
    
    // 按幻灯片编号排序
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0')
      const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0')
      return numA - numB
    })
    
    console.log(`找到 ${slideFiles.length} 个幻灯片`)
    
    // 解析每个幻灯片
    for (const slidePath of slideFiles) {
      const slideFile = zip.file(slidePath)
      if (slideFile) {
        const xmlContent = await slideFile.async('text')
        const slideText = extractTextFromPPTXML(xmlContent)
        
        if (slideText.trim()) {
          textParts.push(`【幻灯片 ${slideIndex}】\n${slideText}`)
        }
        slideIndex++
      }
    }
    
    const content = textParts.join('\n\n')
    
    if (!content.trim()) {
      return `[PPTX 文件: ${file.name}]\n未能提取到文本内容。该文件可能主要包含图片或图表。`
    }
    
    return content
  } catch (error) {
    console.error('PPTX 解析错误:', error)
    return `[PPTX 解析失败: ${error instanceof Error ? error.message : '未知错误'}]`
  }
}

/**
 * 从 PPTX 的 XML 内容中提取文本
 */
function extractTextFromPPTXML(xmlContent: string): string {
  const texts: string[] = []
  
  // 匹配 <a:t>文本内容</a:t> 标签
  const textMatches = xmlContent.matchAll(/<a:t>([^<]*)<\/a:t>/g)
  
  for (const match of textMatches) {
    const text = match[1].trim()
    if (text) {
      texts.push(text)
    }
  }
  
  // 将文本组合，相邻的短文本可能属于同一段落
  let result = ''
  let currentLine = ''
  
  for (const text of texts) {
    // 如果文本以标点符号结尾或较长，可能是段落结束
    if (text.match(/[。！？.!?]$/) || text.length > 50) {
      currentLine += text
      result += currentLine + '\n'
      currentLine = ''
    } else {
      currentLine += text
    }
  }
  
  if (currentLine) {
    result += currentLine
  }
  
  return result.trim()
}
