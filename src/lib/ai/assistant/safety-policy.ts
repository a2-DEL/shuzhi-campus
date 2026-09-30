/** Conservative campus policy examples; deployment must provide human-reviewed, versioned policy updates. */
export const BAIZE_SAFETY_PATTERNS: readonly { reason: 'DANGEROUS' | 'PROMPT_INJECTION' | 'OFF_TOPIC'; pattern: RegExp; reply: string }[] = [
  { reason: 'DANGEROUS', pattern: /(?:绕过|窃取|盗取).{0,12}(?:密码|权限|门禁)|(?:制作|制造|组装).{0,8}(?:炸弹|枪械)|(?:泄露|给出).{0,12}(?:密钥|系统提示词)/i, reply: '这类请求不适合在校园助手中处理。可以换个与校园服务相关的问题。' },
  { reason: 'PROMPT_INJECTION', pattern: /(?:忽略|无视|覆盖).{0,18}(?:之前|以上|系统|所有).{0,8}(?:规则|指令|限制)|(?:输出|导出|列出|展示).{0,10}(?:所有|全部).{0,10}(?:用户数据|其他人的数据|密码|密钥)|(?:假装|扮演).{0,12}(?:系统管理员|开发者模式)/i, reply: '我不能绕过身份、权限或系统规则；可以帮你查询当前账号有权访问的校园信息。' },
  { reason: 'DANGEROUS', pattern: /(?:伪造|冒用).{0,12}(?:审批|学生证|校园卡|身份)|(?:绕过|破解).{0,12}(?:门禁|考勤|校园卡)/i, reply: '这类请求不适合在校园助手中处理。可以换个与校园服务相关的问题。' },
  { reason: 'PROMPT_INJECTION', pattern: /(?:你现在是|从现在起扮演|切换为).{0,15}(?:系统管理员|开发者|无约束模式)|(?:泄露|打印|输出).{0,15}(?:系统提示|隐藏提示|开发者指令)|(?:\[INST\]|<<SYS>>|<\|im_start\|>system)/i, reply: '我不能绕过身份、权限或系统规则；可以帮你查询当前账号有权访问的校园信息。' },
  { reason: 'OFF_TOPIC', pattern: /(?:写(?:个|一段)?|生成).{0,12}(?:Python|JavaScript|程序|代码)|(?:讲|说).{0,6}(?:笑话|故事)|(?:推荐).{0,8}(?:电影|游戏|股票)/i, reply: '我主要协助校园事务，比如报修、教室、值日和校园制度；你可以换个校园服务问题。' },
]
