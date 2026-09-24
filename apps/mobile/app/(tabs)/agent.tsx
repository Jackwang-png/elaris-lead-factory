/**
 * PHASE MOBILE-04 — AI（商家 AI 员工）真实对话页。
 *
 * 链路：Mobile UI → POST /agent/ask（{ message } 唯一字段）→ JWT（拦截器注入）
 *       → 服务端 TenantGuard 解析 tenantId/userId/role → Agent → Tool → 真实数据库
 *       → answer / facts / sources / timeRange / warnings / degraded → 本页渲染
 *
 * 硬约束：
 *   - 不伪造 streaming：后端当前无 SSE/ReadableStream，故使用普通 POST + loading 态
 *   - 不产生任何业务数字：所有数值来自服务端 facts，前端只做格式化与标签翻译
 *   - 请求体仅 { message }，绝不传 tenantId / userId / role
 *   - 失败不显示假答案：错误气泡只展示安全文案 + 重试
 *   - 401 交由 src/lib/api.ts 全局机制（清 SecureStore → SessionGate 回落 /login）
 *   - Safe Area：顶部 insets.top（避开刘海）；底部由 Tab bar 承担（避免双重留白）
 */

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { askAgent, type AgentAnswer, type AgentFact } from '@/lib/mobile-api';
import { buildSourceRows, describeAgentError, formatRangeLabel, warningLabel } from '@/lib/agent-view-model';
import { colors, radius, spacing, typography } from '@/theme';
import { EmptyState } from '@/components/ui';

/** 服务端 DTO 限制：message 1~2000 字。 */
const MAX_MESSAGE_LENGTH = 2000;

const QUICK_QUESTIONS: readonly string[] = [
  '今天店铺怎么样？',
  '今天订单怎么样？',
  '最近销售趋势怎么样？',
  '最近有什么异常？',
];

interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'agent';
  /** user：提问原文；agent：answer 正文（回答失败时为空串）。 */
  readonly text: string;
  /** agent 气泡对应的提问（用于重试）。 */
  readonly question?: string;
  readonly answer?: AgentAnswer;
  readonly pending?: boolean;
  readonly error?: string | null;
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

/* ------------------------------- 子组件 ------------------------------- */

function FactCard({ fact }: { fact: AgentFact }) {
  return (
    <View style={styles.factCard}>
      <Text style={styles.factLabel} numberOfLines={2}>
        {fact.label}
      </Text>
      <Text style={styles.factValue} numberOfLines={1}>
        {fact.value}
        {fact.unit ? <Text style={styles.factUnit}> {fact.unit}</Text> : null}
      </Text>
      {fact.delta ? <Text style={styles.factDelta}>{fact.delta}</Text> : null}
    </View>
  );
}

function AnswerBlock({ answer }: { answer: AgentAnswer }) {
  const rangeLabel = formatRangeLabel(answer.timeRange);
  const sourceRows = buildSourceRows(answer.sources);
  const showSummary = answer.summary.trim().length > 0 && answer.summary.trim() !== answer.answer.trim();

  return (
    <View>
      <Text style={styles.answerText}>{answer.answer}</Text>
      {showSummary ? <Text style={styles.answerSummary}>{answer.summary}</Text> : null}

      {/* 降级提示：数据仍真实，仅部分内容不可用 */}
      {answer.meta.degraded ? (
        <View style={styles.degradedTag}>
          <Text style={styles.degradedText}>数据直出：部分解读不可用，以下为可核对数据</Text>
        </View>
      ) : null}

      {/* warnings */}
      {answer.warnings.length > 0 ? (
        <View style={styles.warnBox}>
          {answer.warnings.map((warning, index) => (
            <Text key={`${warning}-${index}`} style={styles.warnText}>
              · {warningLabel(warning)}
            </Text>
          ))}
        </View>
      ) : null}

      {/* facts */}
      {answer.facts.length > 0 ? (
        <View style={styles.factGrid}>
          {answer.facts.map((fact, index) => (
            <FactCard key={`${fact.label}-${index}`} fact={fact} />
          ))}
        </View>
      ) : null}

      {/* timeRange + meta */}
      {rangeLabel ? (
        <Text style={styles.metaLine}>统计区间：{rangeLabel}</Text>
      ) : null}
      <Text style={styles.metaLine}>
        耗时 {answer.meta.elapsedMs} ms
        {answer.meta.cached ? ' · 命中缓存' : ''}
        {answer.meta.tools.length > 0 ? ` · 数据来源 ${answer.meta.tools.length} 项` : ''}
      </Text>

      {/* sources */}
      {sourceRows.length > 0 ? (
        <View style={styles.sourceBox}>
          <Text style={styles.sourceTitle}>数据依据</Text>
          {sourceRows.map((row) => (
            <View key={row.key} style={styles.sourceRow}>
              <Text style={styles.sourceLabel}>{row.label}</Text>
              <Text style={styles.sourceMeta}>
                {row.asOfLabel ? `更新于 ${row.asOfLabel}` : ''}
                {row.rowCount !== null ? ` · ${row.rowCount} 行` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AgentBubble({ message, onRetry }: { message: ChatMessage; onRetry: (question: string) => void }) {
  if (message.pending) {
    return (
      <View style={[styles.bubble, styles.bubbleAgent]}>
        <View style={styles.pendingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.pendingText}>正在查询你的经营数据…</Text>
        </View>
      </View>
    );
  }

  if (message.error) {
    return (
      <View style={[styles.bubble, styles.bubbleAgent, styles.bubbleError]}>
        <Text style={styles.errorText}>{message.error}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => {
            if (message.question) onRetry(message.question);
          }}
        >
          <Text style={styles.retryText}>重试</Text>
        </Pressable>
      </View>
    );
  }

  if (message.answer) {
    return (
      <View style={[styles.bubble, styles.bubbleAgent]}>
        <AnswerBlock answer={message.answer} />
      </View>
    );
  }

  return null;
}

/* ------------------------------- 页面 ------------------------------- */

export default function AgentScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [inFlight, setInFlight] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const inFlightRef = useRef(false);

  const send = useCallback(async (raw: string): Promise<void> => {
    const question = raw.trim();
    if (question.length === 0 || inFlightRef.current) return;

    inFlightRef.current = true;
    setInFlight(true);
    setInput('');

    const pendingId = nextId('agent');
    setMessages((previous) => [
      ...previous,
      { id: nextId('user'), role: 'user', text: question },
      { id: pendingId, role: 'agent', text: '', question, pending: true },
    ]);

    try {
      const answer = await askAgent(question);
      setMessages((previous) =>
        previous.map((message) =>
          message.id === pendingId
            ? { id: pendingId, role: 'agent', text: answer.answer, question, answer }
            : message,
        ),
      );
    } catch (caught) {
      const message = describeAgentError(caught);
      setMessages((previous) =>
        previous.map((item) =>
          item.id === pendingId
            ? { id: pendingId, role: 'agent', text: '', question, error: message }
            : item,
        ),
      );
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }, []);

  const canSend = input.trim().length > 0 && !inFlight;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* 顶部安全区：避开刘海/状态栏 */}
      <View style={[styles.headerWrap, { paddingTop: insets.top + spacing.md }]}>
        <Text style={typography.label}>商家 AI 员工</Text>
        <Text style={[typography.h2, { marginTop: spacing.xs }]}>商家 AI 员工</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        {messages.length === 0 ? (
          <EmptyState
            title="问点什么？"
            description="用自然语言询问你的店铺经营情况。回答只基于你的真实业务数据，并标注数据依据与统计区间。点击下方快捷问题，或直接输入。"
          />
        ) : null}

        {messages.map((message) =>
          message.role === 'user' ? (
            <View key={message.id} style={[styles.bubble, styles.bubbleUser]}>
              <Text style={styles.userText}>{message.text}</Text>
            </View>
          ) : (
            <AgentBubble key={message.id} message={message} onRetry={(question) => void send(question)} />
          ),
        )}
      </ScrollView>

      {/* 快捷问题：真实可点击 */}
      <View style={styles.quickWrap}>
        {QUICK_QUESTIONS.map((question) => (
          <Pressable
            key={question}
            style={[styles.chip, inFlight ? styles.chipDisabled : null]}
            disabled={inFlight}
            onPress={() => void send(question)}
          >
            <Text style={styles.chipText}>{question}</Text>
          </Pressable>
        ))}
      </View>

      {/* 输入区 */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="例如：今天经营怎么样？"
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          editable={!inFlight}
        />
        <Pressable
          style={[styles.sendButton, canSend ? null : styles.sendButtonDisabled]}
          disabled={!canSend}
          onPress={() => void send(input)}
        >
          {inFlight ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <Text style={styles.sendText}>发送</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  emptyText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  emptyHint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  bubble: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, maxWidth: '100%' },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(37,99,235,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.25)',
    maxWidth: '86%',
  },
  bubbleAgent: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleError: { borderColor: 'rgba(239,68,68,0.35)', backgroundColor: 'rgba(239,68,68,0.10)' },
  userText: { ...typography.body, color: colors.text },
  answerText: { ...typography.body, color: colors.text },
  answerSummary: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  pendingRow: { flexDirection: 'row', alignItems: 'center' },
  pendingText: { ...typography.caption, color: colors.textSecondary, marginLeft: spacing.sm },
  errorText: { ...typography.caption, color: colors.danger },
  retryButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  retryText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  degradedTag: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  degradedText: { ...typography.caption, color: colors.warning },
  warnBox: { marginTop: spacing.sm },
  warnText: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  factCard: {
    minWidth: '46%',
    flexGrow: 1,
    marginRight: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.card,
  },
  factLabel: { ...typography.caption, color: colors.textSecondary },
  factValue: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  factUnit: { fontSize: 12, fontWeight: '500', color: colors.textTertiary },
  factDelta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  metaLine: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  sourceBox: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  sourceTitle: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  sourceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  sourceLabel: { ...typography.caption, color: colors.text },
  sourceMeta: { ...typography.caption, color: colors.textTertiary },
  quickWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipDisabled: { opacity: 0.45 },
  chipText: { fontSize: 12.5, color: colors.textSecondary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  input: {
    flex: 1,
    maxHeight: 96,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
  },
  sendButton: {
    marginLeft: spacing.sm,
    minWidth: 64,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.45 },
  sendText: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
});
