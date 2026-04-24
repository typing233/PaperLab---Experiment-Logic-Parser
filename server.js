const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 2359;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/parse', async (req, res) => {
  try {
    const { text, apiKey } = req.body;
    
    if (!text || text.length < 100 || text.length > 10000) {
      return res.status(400).json({ 
        error: '文本长度必须在100-10000字之间' 
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
        max_tokens: 4000,
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

app.listen(PORT, () => {
  console.log(`PaperLab 实验逻辑解析器已启动，运行在 http://localhost:${PORT}`);
});
