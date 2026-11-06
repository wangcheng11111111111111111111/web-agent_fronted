<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { marked } from 'marked'
import type { ChatMessage, Source } from '../types'
import {
  listVoices,
  streamTTSSegments,
  type TTSStreamOptions,
} from '../services/api'

marked.setOptions({
  breaks: true,
  gfm: true,
})

const props = defineProps<{
  messages: ChatMessage[]
  busy: boolean
  stage: string
  assistantName: string
  logoUrl: string | null
  showSources: boolean
}>()

const emit = defineEmits<{
  (e: 'suggest', text: string): void
  (e: 'regenerate', messageId: string): void
}>()

const scroller = ref<HTMLElement | null>(null)
const copiedId = ref<string | null>(null)
type TTSDisposer = () => void
const ttsState = ref<{
  messageId: string | null
  audio: HTMLAudioElement | null
  controller: AbortController | null
  dispose: TTSDisposer | null
}>({ messageId: null, audio: null, controller: null, dispose: null })
const ttsPhase = ref<'preparing' | 'buffering' | 'playing' | null>(null)
const ttsElapsedMs = ref(0)
let ttsTimer: ReturnType<typeof setInterval> | null = null
let ttsStartedAt = 0
let activeTtsGain: GainNode | null = null
const voiceConfigured = ref(false)
const ttsUnavailableMessage = ref('')

function getTtsVolume(): number {
  return Number(localStorage.getItem('tts-volume') ?? 1)
}

function getTtsBaseEngine(): string {
  return localStorage.getItem('tts-base-engine-v2') === 'cosyvoice' ? 'cosyvoice' : 'edge_tts'
}

function getStoredNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = localStorage.getItem(key)
  const value = raw === null ? fallback : Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function getTtsOptions(): TTSStreamOptions {
  const legacyVoice = localStorage.getItem('tts-voice') || ''
  const edgeVoice = localStorage.getItem('tts-edge-voice') || ''
  const rvcModel = localStorage.getItem('tts-rvc-model') || ''
  const rvcEnabledSetting = localStorage.getItem('tts-rvc-enabled')
  const engine = getTtsBaseEngine() === 'cosyvoice' ? 'cosyvoice' : 'edge_tts'
  return {
    engine,
    edgeVoice:
      engine === 'edge_tts'
        ? edgeVoice || (legacyVoice.startsWith('zh-') ? legacyVoice : undefined)
        : undefined,
    rvcEnabled:
      Boolean(rvcModel)
      && (rvcEnabledSetting === null ? true : rvcEnabledSetting === '1'),
    rvcModel: rvcModel || undefined,
    rvcIndex: localStorage.getItem('tts-rvc-index') || undefined,
    promptId:
      engine === 'cosyvoice'
        ? localStorage.getItem('tts-voice-prompt') || 'default'
        : undefined,
    rvcIndexRate: getStoredNumber('tts-rvc-index-rate', 0.6, 0, 1),
    rvcProtect: getStoredNumber('tts-rvc-protect', 0.4, 0, 0.5),
    rvcRmsMixRate: getStoredNumber('tts-rvc-rms-mix-rate', 0.25, 0, 1),
    rvcF0UpKey: Math.round(getStoredNumber('tts-rvc-f0-up-key', 0, -12, 12)),
    ttsSpeed: getStoredNumber('tts-speed', 1, 0.7, 1.3),
  }
}

const currentTtsOptions = ref<TTSStreamOptions>(getTtsOptions())

function refreshTtsOptions(): void {
  currentTtsOptions.value = getTtsOptions()
}

function formatTtsElapsed(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function startTtsTimer(): void {
  stopTtsTimer()
  ttsStartedAt = performance.now()
  ttsElapsedMs.value = 0
  ttsTimer = setInterval(() => {
    ttsElapsedMs.value = performance.now() - ttsStartedAt
  }, 250)
}

function stopTtsTimer(): void {
  if (ttsTimer) {
    clearInterval(ttsTimer)
    ttsTimer = null
  }
  ttsElapsedMs.value = 0
}

function groupedSources(sources: Source[]): Array<{
  document_id: string
  filename: string
  chunks: number[]
  score: number
}> {
  const groups = new Map<
    string,
    {
      document_id: string
      filename: string
      chunks: number[]
      score: number
    }
  >()
  for (const source of sources) {
    const current = groups.get(source.document_id)
    if (current) {
      if (!current.chunks.includes(source.chunk_index + 1)) {
        current.chunks.push(source.chunk_index + 1)
      }
      current.score = Math.max(current.score, source.score)
    } else {
      groups.set(source.document_id, {
        document_id: source.document_id,
        filename: source.filename,
        chunks: [source.chunk_index + 1],
        score: source.score,
      })
    }
  }
  return [...groups.values()].sort((a, b) => b.score - a.score)
}

async function loadVoices(): Promise<void> {
  try {
    const data = await listVoices()
    voiceConfigured.value = data.configured
    ttsUnavailableMessage.value = data.message || ''
    if (localStorage.getItem('tts-base-engine-v2') === null) {
      const engine = data.engine === 'cosyvoice'
        ? 'cosyvoice'
        : 'edge_tts'
      localStorage.setItem('tts-base-engine-v2', engine)
      refreshTtsOptions()
    }
  } catch {
    voiceConfigured.value = false
    ttsUnavailableMessage.value = '无法连接语音服务，请确认后端已启动。'
  }
}

loadVoices()

function stopSpeaking(): void {
  const s = ttsState.value
  if (s.dispose) {
    s.dispose()
    ttsState.value = { messageId: null, audio: null, controller: null, dispose: null }
    ttsPhase.value = null
    stopTtsTimer()
    return
  }
  if (s.controller) s.controller.abort()
  if (s.audio) {
    s.audio.pause()
    s.audio.src = ''
  }
  ttsState.value = { messageId: null, audio: null, controller: null, dispose: null }
  ttsPhase.value = null
  stopTtsTimer()
}

async function toggleSpeak(message: ChatMessage): Promise<void> {
  if (ttsState.value.messageId === message.id) {
    stopSpeaking()
    return
  }
  if (ttsState.value.messageId) stopSpeaking()

  if (!voiceConfigured.value) {
    alert(ttsUnavailableMessage.value || '语音朗读服务暂时不可用。')
    return
  }

  startTtsTimer()
  await _playStream(message)
}

async function _playStream(message: ChatMessage): Promise<void> {
  const controller = new AbortController()
  let disposed = false
  let receivedSegments = 0
  const audioContext = new AudioContext()
  const masterGain = audioContext.createGain()
  const sources = new Set<AudioBufferSourceNode>()
  const playbackTasks: Promise<void>[] = []
  const pendingSegments: Array<{ samples: Float32Array; sampleRate: number }> = []
  let nextStartTime = 0
  let firstSegment = true
  let lastArrivalAt: number | null = null
  let estimatedArrivalInterval = 0
  activeTtsGain = masterGain
  masterGain.gain.value = getTtsVolume()
  masterGain.connect(audioContext.destination)

  function dispose(): void {
    if (disposed) return
    disposed = true
    ttsPhase.value = null
    stopTtsTimer()
    if (ttsState.value.messageId === message.id) {
      ttsState.value = { messageId: null, audio: null, controller: null, dispose: null }
    }
    try { controller.abort() } catch {}
    for (const source of sources) {
      try { source.stop() } catch {}
      try { source.disconnect() } catch {}
    }
    sources.clear()
    if (activeTtsGain === masterGain) {
      activeTtsGain = null
    }
    try { masterGain.disconnect() } catch {}
    void audioContext.close().catch(() => {})
  }

  ttsState.value = { messageId: message.id, audio: null, controller, dispose }
  ttsPhase.value = 'preparing'

  function scheduleSegment(segment: { samples: Float32Array; sampleRate: number }): void {
    if (disposed || !segment.samples.length || !segment.sampleRate) return
    const buffer = audioContext.createBuffer(
      1,
      segment.samples.length,
      segment.sampleRate,
    )
    buffer.copyToChannel(segment.samples, 0)

    const source = audioContext.createBufferSource()
    const fade = audioContext.createGain()
    source.buffer = buffer
    source.connect(fade)
    fade.connect(masterGain)

    const edgeFade = 0.008
    const now = audioContext.currentTime
    const underrun = !firstSegment && nextStartTime < now + 0.02
    if (underrun) ttsPhase.value = 'buffering'
    const safetyMargin = getConnectionSafetyMargin()
    const startAt = firstSegment
      ? now + safetyMargin
      : Math.max(now + safetyMargin, nextStartTime)
    const duration = buffer.duration
    const fadeDuration = Math.min(edgeFade, duration / 3)

    if (firstSegment) {
      fade.gain.setValueAtTime(0, startAt)
      fade.gain.linearRampToValueAtTime(1, startAt + fadeDuration)
    } else {
      fade.gain.setValueAtTime(0, startAt)
      fade.gain.linearRampToValueAtTime(1, startAt + fadeDuration)
    }
    fade.gain.setValueAtTime(1, startAt + duration - fadeDuration)
    fade.gain.linearRampToValueAtTime(0, startAt + duration)

    const playback = new Promise<void>((resolve) => {
      source.addEventListener('ended', () => resolve(), { once: true })
    })
    playbackTasks.push(playback)
    sources.add(source)
    source.start(startAt)
    nextStartTime = startAt + duration
    firstSegment = false
    ttsState.value.audio = null
    ttsPhase.value = 'playing'
  }

  function flushPending(): void {
    while (pendingSegments.length) {
      const segment = pendingSegments.shift()
      if (segment) scheduleSegment(segment)
    }
  }

  function bufferedDurationSeconds(): number {
    return pendingSegments.reduce(
      (total, pending) => total + pending.samples.length / pending.sampleRate,
      0,
    )
  }

  function getConnectionSafetyMargin(): number {
    if (!estimatedArrivalInterval) return 0.2
    return Math.min(
      0.6,
      Math.max(0.15, estimatedArrivalInterval * 0.2),
    )
  }

  function canStartPlayback(now: number): boolean {
    if (receivedSegments < 1) return false
    return bufferedDurationSeconds() >= getConnectionSafetyMargin()
  }

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    const options = { ...currentTtsOptions.value }
    let playbackStarted = false
    for await (const segment of streamTTSSegments(
      stripMarkdown(message.content),
      options,
      controller.signal,
    )) {
      if (disposed) break
      receivedSegments += 1
      pendingSegments.push(segment)
      const arrivalAt = performance.now()
      if (lastArrivalAt !== null) {
        const interval = (arrivalAt - lastArrivalAt) / 1000
        estimatedArrivalInterval = estimatedArrivalInterval
          ? estimatedArrivalInterval * 0.7 + interval * 0.3
          : interval
      }
      lastArrivalAt = arrivalAt
      if (!playbackStarted) {
        ttsPhase.value = 'buffering'
        if (canStartPlayback(arrivalAt)) {
          playbackStarted = true
          flushPending()
        }
      } else {
        flushPending()
      }
    }
    if (!playbackStarted && pendingSegments.length) {
      flushPending()
    }
    await Promise.all(playbackTasks)
    if (!receivedSegments) {
      throw new Error('TTS 未返回可用音频')
    }
    if (!disposed) dispose()
  } catch (err) {
    if (!disposed) dispose()
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      console.error('TTS failed:', err)
      alert(err instanceof Error && err.message ? `朗读失败：${err.message}` : '朗读失败，请稍后重试。')
    }
  }
}

function applyVolume(): void {
  const v = getTtsVolume()
  if (ttsState.value.audio) ttsState.value.audio.volume = v
  if (activeTtsGain) {
    activeTtsGain.gain.setTargetAtTime(v, activeTtsGain.context.currentTime, 0.015)
  }
}

onMounted(() => {
  window.addEventListener('tts-volume-change', applyVolume)
  window.addEventListener('storage', applyVolume)
  window.addEventListener('tts-settings-change', refreshTtsOptions)
  window.addEventListener('tts-base-engine-change-v2', refreshTtsOptions)
  window.addEventListener('storage', refreshTtsOptions)
  refreshTtsOptions()
})

onBeforeUnmount(() => {
  window.removeEventListener('tts-volume-change', applyVolume)
  window.removeEventListener('storage', applyVolume)
  window.removeEventListener('tts-settings-change', refreshTtsOptions)
  window.removeEventListener('tts-base-engine-change-v2', refreshTtsOptions)
  window.removeEventListener('storage', refreshTtsOptions)
  stopSpeaking()
})

watch(
  () => [props.messages.length, props.messages.at(-1)?.content, props.stage],
  async () => {
    await nextTick()
    if (scroller.value) {
      scroller.value.scrollTop = scroller.value.scrollHeight
    }
  },
)

function readableStage(): string {
  if (props.stage) return props.stage
  return '正在思考...'
}

function renderMarkdown(content: string): string {
  return marked.parse(content) as string
}

async function copyMessage(message: ChatMessage): Promise<void> {
  const text = message.role === 'assistant'
    ? stripMarkdown(message.content)
    : message.content
  await navigator.clipboard.writeText(text)
  copiedId.value = message.id
  setTimeout(() => {
    if (copiedId.value === message.id) copiedId.value = null
  }, 1600)
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').replace(/```/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/^[-*_]{3,}$/gm, '')
    .replace(/>\s+/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .trim()
}
</script>

<template>
  <div ref="scroller" class="message-scroller">
    <div v-if="messages.length === 0" class="welcome">
      <div class="welcome-orbit" aria-hidden="true">
        <div class="orb">
          <span class="orb-core" />
          <span class="orb-ring ring-one" />
          <span class="orb-ring ring-two" />
        </div>
      </div>
      <p class="eyebrow">YOUR INTELLIGENT COPILOT</p>
      <h1>你好，想聊点什么？</h1>
      <p class="welcome-copy">
        支持自然语言对话、查询当前时间，也能上传知识库获取精准答案。
      </p>
      <div class="suggestions">
        <button @click="emit('suggest', '今天星期几？')">
          <span class="suggestion-glyph">🕐</span>
          <span><strong>查询当前时间</strong><small>路由到 LangGraph 时间节点</small></span>
        </button>
        <button @click="emit('suggest', '帮我总结一下知识库中的重点内容')">
          <span class="suggestion-glyph">📚</span>
          <span><strong>使用知识库</strong><small>自动上传文件、引用来源</small></span>
        </button>
        <button @click="emit('suggest', '用最简单的话解释什么是 RAG')">
          <span class="suggestion-glyph">💬</span>
          <span><strong>进行一次闲聊</strong><small>短期记忆保持上下文通顺</small></span>
        </button>
      </div>
    </div>

    <div v-else class="messages">
      <article
        v-for="message in messages"
        :key="message.id"
        class="message-row"
        :class="[`message-row--${message.role}`, { 'message-row--error': message.error }]"
      >
        <div v-if="message.role === 'assistant'" class="avatar assistant-avatar">
          <img
            v-if="logoUrl"
            :src="logoUrl"
            :alt="`${assistantName} 图标`"
          />
          <span v-else />
        </div>
        <div class="message-body">
          <div class="message-meta">
            <strong>{{ message.role === 'assistant' ? assistantName : '我' }}</strong>
            <span v-if="message.streaming" class="generating-label">
              <i />
              正在生成
            </span>
          </div>
          <div
            v-if="message.content"
            class="message-content"
            :class="[
              { 'is-streaming': message.streaming },
              message.role === 'assistant' ? 'markdown-body' : '',
            ]"
            v-html="
              message.role === 'assistant'
                ? renderMarkdown(message.content)
                : message.content
            "
          />
          <div v-else-if="message.streaming" class="message-content">
            <span class="typing">
              <i /><i /><i />
            </span>
          </div>
          <span v-if="message.streaming && message.content" class="stream-caret" />
          <div v-if="showSources && message.sources?.length" class="source-chips">
            <span class="source-label">参考</span>
            <span
              v-for="source in groupedSources(message.sources).slice(0, 4)"
              :key="source.document_id"
              class="source-chip"
              :title="`相似度: ${source.score}  片段: #${source.chunks.join(', #')}`"
            >
              {{ source.filename }}
              <small>
                {{
                  source.chunks.length === 1
                    ? `#${source.chunks[0]}`
                    : `${source.chunks.length} 个片段`
                }}
              </small>
            </span>
          </div>
          <div v-if="showSources && message.memories?.length" class="memory-chips">
            <span class="memory-label">长期记忆</span>
            <span
              v-for="memory in message.memories.slice(0, 3)"
              :key="memory.fact_id"
              class="memory-chip"
              :title="memory.content"
            >
              {{ memory.fact_type }}
            </span>
          </div>
          <div v-if="showSources && message.recalledConversations?.length" class="conversation-chips">
            <span class="memory-label">往期对话</span>
            <span
              v-for="item in message.recalledConversations.slice(0, 3)"
              :key="item.message_id"
              class="conversation-chip"
              :title="item.content"
            >
              {{ item.session_title }}
            </span>
          </div>
          <div
            v-if="!message.streaming && message.content"
            class="message-actions"
            :class="{ 'message-actions--active': ttsState.messageId === message.id }"
          >
            <button
              class="action-btn"
              :class="{ 'action-btn--copied': copiedId === message.id }"
              :aria-label="copiedId === message.id ? '已复制' : '复制消息'"
              :title="copiedId === message.id ? '已复制' : '复制消息'"
              @click="copyMessage(message)"
            >
              <svg v-if="copiedId !== message.id" viewBox="0 0 24 24">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <svg v-else viewBox="0 0 24 24">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
            <button
              v-if="message.role === 'assistant'"
              class="action-btn"
              aria-label="重新生成"
              title="重新生成"
              @click="emit('regenerate', message.id)"
            >
              <svg viewBox="0 0 24 24">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 4v5h-5" />
              </svg>
            </button>
            <button
              v-if="message.role === 'assistant'"
              class="action-btn action-btn--speak"
              :class="{ 'action-btn--speaking': ttsState.messageId === message.id }"
              :aria-label="
                ttsState.messageId === message.id
                  ? `停止朗读，已用时 ${formatTtsElapsed(ttsElapsedMs)}`
                  : '朗读消息'
              "
              :title="ttsState.messageId === message.id ? '停止朗读' : '朗读'"
              @click="toggleSpeak(message)"
            >
              <svg v-if="ttsState.messageId !== message.id" viewBox="0 0 24 24">
                <path d="M11 5 6 9H2v6h4l5 4z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <svg v-else viewBox="0 0 24 24">
                <path d="M11 5 6 9H2v6h4l5 4z" />
                <rect x="14" y="8" width="2" height="8" />
                <rect x="18" y="8" width="2" height="8" />
              </svg>
            </button>
            <div
              v-if="ttsState.messageId === message.id"
              class="tts-live-status"
              :class="`is-${ttsPhase || 'preparing'}`"
            >
              <span class="tts-live-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span class="tts-live-label">
                {{
                  ttsPhase === 'preparing'
                    ? (getTtsBaseEngine() === 'edge_tts' ? '快速生成中' : '本地生成中')
                    : (ttsPhase === 'buffering' ? '缓冲中' : '播放中')
                }}
              </span>
              <time class="tts-live-time" aria-hidden="true">
                {{ formatTtsElapsed(ttsElapsedMs) }}
              </time>
            </div>
          </div>
        </div>
        <div v-if="message.role === 'user'" class="avatar user-avatar">我</div>
      </article>

      <div v-if="busy && messages.at(-1)?.content === ''" class="agent-stage">
        <span class="stage-dot" />
        {{ readableStage() }}
      </div>
    </div>
  </div>
</template>
