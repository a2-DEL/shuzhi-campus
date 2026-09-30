/** Ephemeral, client-held chat context. Never use these untrusted turns as authorization or execution input. */
export interface BaizeConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export const MAX_BAIZE_HISTORY_TURNS = 8

export type BaizeConversationalIntent = 'greeting' | 'identity' | 'capabilities' | null

export function conversationalIntent(message: string): BaizeConversationalIntent {
  const text = message.normalize('NFKC').toLocaleLowerCase().replace(/[\s，,。.!！?？～~]+/g, '').trim()
  if (!text) return null
  const withoutGreeting = text.replace(/^(?:那|那么|对了)/, '').replace(/^(?:您好|你好|哈喽|嗨|hello|hi)(?:白泽|呀|啊|哇)?/, '')
  if (/^(?:(?:请问|想问下|我想知道)?(?:你|您|白泽)(?:到底|究竟)?(?:是(?:谁|哪位|什么)|叫(?:什么|啥)(?:名字)?|是谁|什么来头|干啥的)|(?:请|能|可以)?(?:介绍|自我介绍)(?:一下)?(?:你|您)?(?:自己)?)/.test(withoutGreeting)
    || /^(?:怎么称呼你|你叫什么名|请介绍一下你自己)/.test(withoutGreeting)) return 'identity'
  if (/^(?:(?:你|您|白泽)(?:都|还|到底)?(?:能|会|可以|能不能)(?:帮我|给我|为我)?(?:做些什么|做什么|干什么|帮什么|做啥|提供什么|办什么|查什么)|(?:有哪些|有什么)(?:功能|本事|能力)|(?:能帮我|可以帮我)(?:做些什么|做什么|干什么))/.test(withoutGreeting)) return 'capabilities'
  if (/^(?:您好|你好|哈喽|嗨|hello|hi|早上好|下午好|晚上好|早安|晚安|在吗|你好白泽|白泽你好)(?:呀|啊|哦|哇|嘛|吗|呢|白泽)*$/.test(text)) return 'greeting'
  return null
}

/** Only resolve the subject of a read-only follow-up; never import old action verbs or parameters. */
export function isReadOnlyFollowUp(message: string): boolean {
  const text = message.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '').trim()
  return /^(?:那|那么|再|还有|它|这个|这些|刚才|前面|上面|之前|继续)/.test(text)
    && /(?:多少|几个|有哪些|情况|状态|进度|待处理|已完成|统计|列表|最近|查询|查看|怎么|如何|流程|材料|准备|要求|原因|为什么|什么时候|多久)/.test(text)
    && !/(?:执行|派单|发布|审批|确认|创建|修改|删除|发送|下单|写入)/.test(text)
}
