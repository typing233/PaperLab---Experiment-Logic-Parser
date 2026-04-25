const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = 3091;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('只允许上传PDF文件'));
    }
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/parse', async (req, res) => {
  try {
    const { text, apiKey } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        error: '请输入有效的实验文本' 
      });
    }
    
    if (!apiKey) {
      return res.status(400).json({ 
        error: '请配置DeepSeek API Key' 
      });
    }

    const systemPrompt = `你是一位专业的学术研究助理，擅长将复杂的学术实验文本拆解为结构化的逻辑模块。请将用户提供的实验文本按照以下9个模块进行结构化解析：

1. 研究目的：用一句话概括实验要做什么，明确研究的核心目标
2. 实验假设：明确实验的核心假设是什么，包括零假设和备择假设
3. 实验设计：包括设计类型（如随机对照试验、前后测设计、混合设计等）和通俗描述
4. 材料与方法：包括实验对象、实验材料、流程步骤、关键技术
5. 关键变量：分三栏展示-自变量、因变量、控制变量
6. 实验结果：包括主要发现和数据要点
7. 核心结论：实验得出的核心结论
8. 局限性：实验的不足之处，包括方法学、样本、测量等方面
9. 阅读建议：给研究生的实用阅读策略，帮助他们更好地理解和借鉴该研究

请以JSON格式返回结果，格式如下：
{
  "researchPurpose": { "content": "..." },
  "hypothesis": { "content": "..." },
  "experimentDesign": { "type": "...", "description": "..." },
  "materialsMethods": { 
    "subjects": "...", 
    "materials": "...", 
    "procedure": "...", 
    "techniques": "..." 
  },
  "keyVariables": { 
    "independent": ["...", "..."], 
    "dependent": ["...", "..."], 
    "control": ["...", "..."] 
  },
  "results": { "mainFindings": "...", "dataPoints": "..." },
  "conclusion": { "content": "..." },
  "limitations": { "content": "..." },
  "readingTips": { "content": "..." },
  "storyInterpretation": "用通俗易懂的故事化方式解读整个实验，让非专业人士也能理解",
  "keyTerms": [
    { "term": "专业术语", "explanation": "通俗解释" }
  ]
}

注意：
- storyInterpretation部分要用生动的故事化语言解读整个实验
- keyTerms部分要提取文本中的3-5个关键专业术语并给出通俗解释
- 所有内容都要用中文回答
- 确保每个模块内容准确、全面、易于理解`;

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请解析以下实验文本：\n\n${text}` }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = response.data.choices[0].message.content;
    let parsedContent;
    
    try {
      parsedContent = JSON.parse(content);
    } catch (e) {
      console.error('JSON解析失败:', content);
      return res.status(500).json({ error: 'AI返回格式解析失败，请重试' });
    }

    res.json({ success: true, data: parsedContent });
    
  } catch (error) {
    console.error('解析错误:', error.message);
    
    if (error.response) {
      if (error.response.status === 401) {
        return res.status(401).json({ error: 'API Key无效，请检查您的DeepSeek API Key' });
      }
      if (error.response.status === 429) {
        return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      }
      return res.status(error.response.status).json({ 
        error: error.response.data.error?.message || 'API调用失败' 
      });
    }
    
    res.status(500).json({ error: '服务器内部错误，请稍后重试' });
  }
});

app.post('/api/parse-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: '请配置DeepSeek API Key' });
    }

    const dataBuffer = req.file.buffer;
    const pdfData = await pdfParse(dataBuffer);
    const text = pdfData.text;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'PDF文件中未找到可提取的文本' });
    }

    console.log(`PDF解析成功，提取文本长度: ${text.length} 字符`);

    const systemPrompt = `你是一位专业的学术研究助理，擅长将复杂的学术实验文本拆解为结构化的逻辑模块。请将用户提供的实验文本按照以下9个模块进行结构化解析：

1. 研究目的：用一句话概括实验要做什么，明确研究的核心目标
2. 实验假设：明确实验的核心假设是什么，包括零假设和备择假设
3. 实验设计：包括设计类型（如随机对照试验、前后测设计、混合设计等）和通俗描述
4. 材料与方法：包括实验对象、实验材料、流程步骤、关键技术
5. 关键变量：分三栏展示-自变量、因变量、控制变量
6. 实验结果：包括主要发现和数据要点
7. 核心结论：实验得出的核心结论
8. 局限性：实验的不足之处，包括方法学、样本、测量等方面
9. 阅读建议：给研究生的实用阅读策略，帮助他们更好地理解和借鉴该研究

请以JSON格式返回结果，格式如下：
{
  "researchPurpose": { "content": "..." },
  "hypothesis": { "content": "..." },
  "experimentDesign": { "type": "...", "description": "..." },
  "materialsMethods": { 
    "subjects": "...", 
    "materials": "...", 
    "procedure": "...", 
    "techniques": "..." 
  },
  "keyVariables": { 
    "independent": ["...", "..."], 
    "dependent": ["...", "..."], 
    "control": ["...", "..."] 
  },
  "results": { "mainFindings": "...", "dataPoints": "..." },
  "conclusion": { "content": "..." },
  "limitations": { "content": "..." },
  "readingTips": { "content": "..." },
  "storyInterpretation": "用通俗易懂的故事化方式解读整个实验，让非专业人士也能理解",
  "keyTerms": [
    { "term": "专业术语", "explanation": "通俗解释" }
  ]
}

注意：
- storyInterpretation部分要用生动的故事化语言解读整个实验
- keyTerms部分要提取文本中的3-5个关键专业术语并给出通俗解释
- 所有内容都要用中文回答
- 确保每个模块内容准确、全面、易于理解`;

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请解析以下实验文本：\n\n${text}` }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = response.data.choices[0].message.content;
    let parsedContent;
    
    try {
      parsedContent = JSON.parse(content);
    } catch (e) {
      console.error('JSON解析失败:', content);
      return res.status(500).json({ error: 'AI返回格式解析失败，请重试' });
    }

    res.json({ 
      success: true, 
      data: parsedContent, 
      extractedText: text.substring(0, 500) + (text.length > 500 ? '...' : '') 
    });
    
  } catch (error) {
    console.error('PDF解析错误:', error.message);
    
    if (error.response) {
      if (error.response.status === 401) {
        return res.status(401).json({ error: 'API Key无效，请检查您的DeepSeek API Key' });
      }
      if (error.response.status === 429) {
        return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      }
      return res.status(error.response.status).json({ 
        error: error.response.data.error?.message || 'API调用失败' 
      });
    }
    
    res.status(500).json({ error: error.message || '服务器内部错误，请稍后重试' });
  }
});

app.post('/api/generate-plan', async (req, res) => {
  try {
    const { text, apiKey } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: '请输入有效的实验文本' });
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: '请配置DeepSeek API Key' });
    }

    const systemPrompt = `你是一位专业的实验方案规划专家。请基于用户提供的实验文本，生成以下三个模块的内容：

1. 可勾选执行清单：将实验步骤拆解为具体的、可执行的任务清单，每个任务都是可勾选完成的
2. 可复用代码脚本：提供常见实验数据分析的Python/R代码模板，包含数据处理、统计分析、可视化等
3. 风险预警提示：识别实验执行过程中可能遇到的风险点，包括技术风险、操作风险、伦理风险等

请以JSON格式返回结果，格式如下：
{
  "executionChecklist": [
    {
      "id": 1,
      "task": "具体任务描述",
      "category": "准备工作/数据收集/数据分析/报告撰写",
      "priority": "高/中/低",
      "notes": "注意事项"
    }
  ],
  "codeScripts": [
    {
      "name": "代码名称",
      "language": "Python/R",
      "description": "代码功能描述",
      "code": "完整的代码示例"
    }
  ],
  "riskWarnings": [
    {
      "id": 1,
      "riskType": "技术风险/操作风险/伦理风险/数据风险",
      "description": "风险描述",
      "severity": "高/中/低",
      "mitigation": "缓解措施"
    }
  ]
}

注意：
- 执行清单要具体、可操作，每个任务都应该是可独立完成的
- 代码脚本要实用、可直接修改使用
- 风险预警要全面，涵盖实验全流程
- 所有内容都要用中文回答`;

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请基于以下实验文本生成方案：\n\n${text}` }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = response.data.choices[0].message.content;
    let parsedContent;
    
    try {
      parsedContent = JSON.parse(content);
    } catch (e) {
      console.error('JSON解析失败:', content);
      return res.status(500).json({ error: 'AI返回格式解析失败，请重试' });
    }

    res.json({ success: true, data: parsedContent });
    
  } catch (error) {
    console.error('方案生成错误:', error.message);
    
    if (error.response) {
      if (error.response.status === 401) {
        return res.status(401).json({ error: 'API Key无效，请检查您的DeepSeek API Key' });
      }
      if (error.response.status === 429) {
        return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      }
      return res.status(error.response.status).json({ 
        error: error.response.data.error?.message || 'API调用失败' 
      });
    }
    
    res.status(500).json({ error: '服务器内部错误，请稍后重试' });
  }
});

app.post('/api/compare-papers', async (req, res) => {
  try {
    const { papers, apiKey } = req.body;
    
    if (!papers || papers.length < 2 || papers.length > 5) {
      return res.status(400).json({ error: '请提供2-5篇论文进行对比' });
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: '请配置DeepSeek API Key' });
    }

    let papersText = '';
    papers.forEach((paper, index) => {
      papersText += `=== 论文 ${index + 1}: ${paper.title || '未命名论文'} ===\n\n${paper.content}\n\n`;
    });

    const systemPrompt = `你是一位专业的学术研究对比专家。请对比分析用户提供的多篇论文，生成以下内容：

1. 变量对齐表：将各论文中的变量进行对齐，找出相似和不同的变量定义
2. 结论异同矩阵：对比各论文的核心结论，标记相同点和不同点
3. 方法演进脉络：分析各论文方法之间的演进关系，找出技术传承和创新点
4. 综合评估：对各论文的优势、劣势进行综合评估

请以JSON格式返回结果，格式如下：
{
  "variableAlignment": {
    "variables": [
      {
        "name": "变量名称",
        "papers": {
          "1": "论文1中的定义/描述",
          "2": "论文2中的定义/描述"
        },
        "alignmentNote": "对齐说明"
      }
    ]
  },
  "conclusionComparison": {
    "similarPoints": [
      {
        "content": "相同结论内容",
        "paperIndices": [1, 2]
      }
    ],
    "differentPoints": [
      {
        "paper1": "论文1的结论",
        "paper2": "论文2的结论",
        "differenceNote": "差异说明"
      }
    ]
  },
  "methodEvolution": {
    "timeline": [
      {
        "paperIndex": 1,
        "method": "方法名称",
        "innovations": ["创新点1"],
        "previousInfluences": ["受哪些方法影响"]
      }
    ],
    "evolutionSummary": "方法演进总结"
  },
  "comprehensiveEvaluation": [
    {
      "paperIndex": 1,
      "title": "论文标题",
      "strengths": ["优势1"],
      "weaknesses": ["劣势1"],
      "uniqueContribution": "独特贡献"
    }
  ]
}

注意：
- 变量对齐要准确，找出真正可比的变量
- 结论对比要客观，准确标记异同点
- 方法演进要清晰，体现技术发展脉络
- 所有内容都要用中文回答`;

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请对比分析以下论文：\n\n${papersText}` }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = response.data.choices[0].message.content;
    let parsedContent;
    
    try {
      parsedContent = JSON.parse(content);
    } catch (e) {
      console.error('JSON解析失败:', content);
      return res.status(500).json({ error: 'AI返回格式解析失败，请重试' });
    }

    res.json({ success: true, data: parsedContent });
    
  } catch (error) {
    console.error('论文对比错误:', error.message);
    
    if (error.response) {
      if (error.response.status === 401) {
        return res.status(401).json({ error: 'API Key无效，请检查您的DeepSeek API Key' });
      }
      if (error.response.status === 429) {
        return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      }
      return res.status(error.response.status).json({ 
        error: error.response.data.error?.message || 'API调用失败' 
      });
    }
    
    res.status(500).json({ error: '服务器内部错误，请稍后重试' });
  }
});

app.post('/api/extract-data', async (req, res) => {
  try {
    const { text, apiKey } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: '请输入有效的实验文本' });
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: '请配置DeepSeek API Key' });
    }

    const systemPrompt = `你是一位专业的实验数据提取专家。请从用户提供的实验文本中提取以下三级证据链：

1. 实验方法层：提取实验中使用的所有方法、技术、实验设计等
2. 支撑数据层：提取实验中的所有关键数据、统计指标、样本量等
3. 核心结论层：提取实验得出的所有核心结论，并关联到支撑数据

请以JSON格式返回结果，格式如下：
{
  "evidenceChain": {
    "experimentMethods": [
      {
        "id": "m1",
        "name": "方法名称",
        "description": "方法描述",
        "dataIds": ["d1", "d2"],
        "conclusionIds": ["c1"]
      }
    ],
    "supportingData": [
      {
        "id": "d1",
        "type": "统计指标/样本量/测量值",
        "name": "数据名称",
        "value": "数值或描述",
        "unit": "单位（如适用）",
        "significance": "显著性（如p<0.05）",
        "methodIds": ["m1"],
        "conclusionIds": ["c1"]
      }
    ],
    "coreConclusions": [
      {
        "id": "c1",
        "content": "结论内容",
        "strength": "强/中/弱",
        "dataIds": ["d1", "d2"],
        "methodIds": ["m1"],
        "limitations": "该结论的局限性"
      }
    ],
    "keyStatistics": [
      {
        "name": "统计指标名称",
        "value": "数值",
        "relatedConclusion": "关联的结论",
        "confidence": "置信度"
      }
    ]
  }
}

注意：
- 建立清晰的三级证据链关联关系
- 数据层要包含所有关键统计指标
- 结论层要与数据层和方法层建立明确关联
- 所有内容都要用中文回答`;

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请从以下实验文本中提取数据：\n\n${text}` }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = response.data.choices[0].message.content;
    let parsedContent;
    
    try {
      parsedContent = JSON.parse(content);
    } catch (e) {
      console.error('JSON解析失败:', content);
      return res.status(500).json({ error: 'AI返回格式解析失败，请重试' });
    }

    res.json({ success: true, data: parsedContent });
    
  } catch (error) {
    console.error('数据提取错误:', error.message);
    
    if (error.response) {
      if (error.response.status === 401) {
        return res.status(401).json({ error: 'API Key无效，请检查您的DeepSeek API Key' });
      }
      if (error.response.status === 429) {
        return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      }
      return res.status(error.response.status).json({ 
        error: error.response.data.error?.message || 'API调用失败' 
      });
    }
    
    res.status(500).json({ error: '服务器内部错误，请稍后重试' });
  }
});

app.listen(PORT, () => {
  console.log(`PaperLab 实验逻辑解析器已启动，运行在 http://localhost:${PORT}`);
});