﻿﻿﻿﻿﻿﻿<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import ChatComposer from './components/ChatComposer.vue'
import KnowledgeDrawer from './components/KnowledgeDrawer.vue'
import MemoryDrawer from './components/MemoryDrawer.vue'
import MessageList from './components/MessageList.vue'
import PromptSettings from './components/PromptSettings.vue'
import {
  checkHealth,
  deleteSession,
  getBranding,
  getSession,
  listSessions,
  streamChat,
} from './services/api'
import type {
  AgentActivity,
  ChatMessage,
  SessionSummary,
  Source,
  StreamEvent,
} from './types'

const SESSION_KEY = 'nebula-ai-session-id'
const SHOW_SOURCES_KEY = 'nebula-show-sources'
const SIDEBAR_COLLAPSED_KEY = 'nebula-sidebar-collapsed'
const WEB_SEARCH_KEY = 'nebula-web-search-enabled-v2'
const SHOW_PLAN_KEY = 'nebula-show-plan'

const sessions = ref<SessionSummary[]>([])
const messages = ref<ChatMessage[]>([])
const activeSessionId = ref<string | null>(null)
const loadingSessions = ref(true)
const busy = ref(false)
const sidebarOpen = ref(false)
const sidebarCollapsed = ref(
  localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === null
    ? true
    : localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
)
const knowledgeOpen = ref(false)
const memoryOpen = ref(false)
const promptOpen = ref(false)
const backendOnline = ref<boolean | null>(null)
const agentStage = ref('')
const errorMessage = ref('')
const toastMessage = ref('')
const showSources = ref(localStorage.getItem(SHOW_SOURCES_KEY) === '1')
const showPlan = ref(localStorage.getItem(SHOW_PLAN_KEY) === '1')

function setShowSources(val: boolean): void {
  showSources.value = val
  localStorage.setItem(SHOW_SOURCES_KEY, val ? '1' : '0')
}

function setShowPlan(value: boolean): void {
  showPlan.value = value
  localStorage.setItem(SHOW_PLAN_KEY, value ? '1' : '0')
}

function toggleSidebarCollapse(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem(
    SIDEBAR_COLLAPSED_KEY,
    sidebarCollapsed.value ? '1' : '0',
  )
}

const assistantName = ref('Nebula')
const assistantLogoUrl = ref<string | null>(null)
const assistantBackgroundEnabled = ref(false)
const assistantBackgroundType = ref<'image' | 'video' | null>(null)
const assistantBackgroundUrl = ref<string | null>(null)
const backgroundVideo = ref<HTMLVideoElement | null>(null)
const videoCurrentTime = ref(0)
const videoDuration = ref(0)
const videoPaused = ref(false)
const videoMuted = ref(true)
const videoVolume = ref<number>(Number(localStorage.getItem('video-volume') ?? 0.5))
const videoControlsCollapsed = ref(true)
const videoDock = ref<HTMLElement | null>(null)
const videoDockDragging = ref(false)
const videoDockMoved = ref(false)
const videoDockOffset = ref(loadVideoDockOffset())
let videoDockPointerStart = { x: 0, y: 0 }
let videoDockOffsetStart = { x: 0, y: 0 }
let videoDockLimits = { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 }
let controller: AbortController | null = null
let toastTimer: number | undefined
let requestTimer: number | undefined
let healthTimer: number | undefined

function applyBranding(branding: {
  name: string
  logo_url: string | null
  background_enabled: boolean
  background_type: 'image' | 'video' | null
  background_url: string | null
}): void {
  assistantName.value = branding.name || 'Nebula'
  assistantLogoUrl.value = branding.logo_url
  assistantBackgroundEnabled.value = Boolean(
    branding.background_enabled && branding.background_url,
  )
  assistantBackgroundType.value = branding.background_type
  assistantBackgroundUrl.value = branding.background_url
  document.title = `${assistantName.value} AI 助手`
}

const appStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  if (
    assistantBackgroundEnabled.value &&
    assistantBackgroundType.value === 'image' &&
    assistantBackgroundUrl.value
  ) {
    style['--assistant-background-image'] =
      `url("${assistantBackgroundUrl.value}")`
  }
  return style
})

const videoProgressPercent = computed(() => {
  if (!videoDuration.value) return 0
  return Math.min(
    100,
    Math.max(0, (videoCurrentTime.value / videoDuration.value) * 100),
  )
})

const videoRingCircumference = 2 * Math.PI * 18
const videoRingOffset = computed(() =>
  videoRingCircumference * (1 - videoProgressPercent.value / 100),
)

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const remainder = String(whole % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}

function updateVideoTime(): void {
  const video = backgroundVideo.value
  if (!video) return
  videoCurrentTime.value = video.currentTime || 0
  videoDuration.value = Number.isFinite(video.duration) ? video.duration : 0
}

function seekVideo(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  const video = backgroundVideo.value
  if (!video || !Number.isFinite(value)) return
  video.currentTime = value
  videoCurrentTime.value = value
}

async function toggleVideoPlayback(): Promise<void> {
  const video = backgroundVideo.value
  if (!video) return
  if (video.paused) {
    await video.play()
  } else {
    video.pause()
  }
}

async function toggleVideoMute(): Promise<void> {
  const video = backgroundVideo.value
  if (!video) return
  video.muted = !video.muted
  videoMuted.value = video.muted
  if (!video.muted && video.paused) {
    try {
      await video.play()
    } catch {
      videoMuted.value = true
      video.muted = true
    }
  }
}

function persistVideoVolume(): void {
  localStorage.setItem('video-volume', String(videoVolume.value))
}

function applyVideoVolume(): void {
  const video = backgroundVideo.value
  if (video) video.volume = videoVolume.value
}

function onVideoVolumeChange(): void {
  const video = backgroundVideo.value
  if (!video) return
  videoMuted.value = video.muted
}

function loadVideoDockOffset(): { x: number; y: number } {
  try {
    const parsed = JSON.parse(
      localStorage.getItem('nebula-video-dock-offset') || '{}',
    ) as { x?: number; y?: number }
    return {
      x: typeof parsed.x === 'number' && Number.isFinite(parsed.x) ? parsed.x : 0,
      y: typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : 0,
    }
  } catch {
    return { x: 0, y: 0 }
  }
}

const videoDockStyle = computed<Record<string, string>>(() => ({
  transform: `translate(${videoDockOffset.value.x}px, ${videoDockOffset.value.y}px)`,
}))

function beginVideoDockDrag(event: PointerEvent): void {
  if (event.button !== 0 || !videoDock.value) return
  const panel = videoDock.value
  const parent = panel.parentElement
  if (!parent) return
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture?.(event.pointerId)
  event.stopPropagation()
  videoDockDragging.value = true
  videoDockMoved.value = false
  videoDockPointerStart = { x: event.clientX, y: event.clientY }
  videoDockOffsetStart = { ...videoDockOffset.value }
  const panelRect = panel.getBoundingClientRect()
  const parentRect = parent.getBoundingClientRect()
  videoDockLimits = {
    minX: parentRect.left + 8 - panelRect.left,
    maxX: parentRect.right - 8 - panelRect.right,
    minY: parentRect.top + 8 - panelRect.top,
    maxY: parentRect.bottom - 8 - panelRect.bottom,
  }

  const move = (moveEvent: PointerEvent): void => {
    const dx = moveEvent.clientX - videoDockPointerStart.x
    const dy = moveEvent.clientY - videoDockPointerStart.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) videoDockMoved.value = true
    videoDockOffset.value = {
      x: Math.min(
        videoDockLimits.maxX,
        Math.max(videoDockLimits.minX, videoDockOffsetStart.x + dx),
      ),
      y: Math.min(
        videoDockLimits.maxY,
        Math.max(videoDockLimits.minY, videoDockOffsetStart.y + dy),
      ),
    }
  }

  const finish = (): void => {
    videoDockDragging.value = false
    if (handle.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId)
    }
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    try {
      localStorage.setItem(
        'nebula-video-dock-offset',
        JSON.stringify(videoDockOffset.value),
      )
    } catch {
      // Position persistence is optional when local storage is unavailable.
    }
    if (videoDockMoved.value) {
      window.setTimeout(() => {
        videoDockMoved.value = false
      }, 250)
    }
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
  window.addEventListener('pointercancel', finish, { once: true })
}

function toggleVideoDockCollapsed(): void {
  if (videoDockMoved.value) {
    videoDockMoved.value = false
    return
  }
  videoControlsCollapsed.value = !videoControlsCollapsed.value
}

function friendlyError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '请求已终止'
  }
  return error instanceof Error ? error.message : '发生未知错误'
}

function showError(message: string): void {
  errorMessage.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    errorMessage.value = ''
  }, 8000)
}

function showToast(message: string): void {
  toastMessage.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastMessage.value = ''
  }, 4000)
}

function settleInterruptedPlan(message: ChatMessage | undefined): void {
  if (!message?.plan?.length) return
  for (const step of message.plan) {
    if (step.status === 'running') step.status = 'failed'
    else if (step.status === 'pending') step.status = 'skipped'
  }
}

const ACTIVITY_TITLES: Record<string, string> = {
  select_tools: '工具选择',
  load_memory: '记忆检索',
  retrieve: '知识库检索',
  web_search: '联网搜索',
  crawl: '网页读取',
  time_tool: '当前时间',
  execute_tools: '工具执行',
}

function recordActivity(
  message: ChatMessage,
  event: Extract<StreamEvent, { type: 'status' }>,
): void {
  if (
    event.stage === 'plan_task' ||
    (event.stage === 'web_search' &&
      event.message === '正在联网搜索最新信息')
  ) {
    return
  }
  const title = ACTIVITY_TITLES[event.stage] || event.stage
  const id = `${event.stage}:${event.query || 'main'}`
  const messageText = event.message || title
  const status: AgentActivity['status'] = event.error
    ? 'error'
    : /正在|读取中|搜索中/.test(messageText)
      ? 'running'
      : 'ok'
  const activity: AgentActivity = {
    id,
    stage: event.stage,
    title,
    message: messageText,
    status,
  }
  if (!message.activities) message.activities = []
  const index = message.activities.findIndex((item) => item.id === id)
  if (index >= 0) message.activities[index] = activity
  else message.activities.push(activity)
}

function settleInterruptedActivities(message: ChatMessage | undefined): void {
  for (const activity of message?.activities || []) {
    if (activity.status === 'running') activity.status = 'error'
  }
}

function removeDocumentReferences(documentId: string): void {
  for (const message of messages.value) {
    if (!message.sources?.length) continue
    const remaining = message.sources.filter(
      (source) => source.document_id !== documentId,
    )
    message.sources = remaining.length ? remaining : undefined
  }
}

async function refreshSessions(): Promise<void> {
  loadingSessions.value = true
  try {
    sessions.value = await listSessions()
  } catch (error) {
    showError(friendlyError(error))
  } finally {
    loadingSessions.value = false
  }
}

async function openSession(id: string): Promise<void> {
  if (busy.value || id === activeSessionId.value) {
    sidebarOpen.value = false
    return
  }
  try {
    const detail = await getSession(id)
    activeSessionId.value = id
    localStorage.setItem(SESSION_KEY, id)
    messages.value = detail.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
    }))
    sidebarOpen.value = false
  } catch (error) {
    showError(friendlyError(error))
    localStorage.removeItem(SESSION_KEY)
    activeSessionId.value = null
  }
}

function newChat(): void {
  controller?.abort()
  activeSessionId.value = null
  messages.value = []
  agentStage.value = ''
  sidebarOpen.value = false
  localStorage.removeItem(SESSION_KEY)
}

async function removeSession(id: string): Promise<void> {
  if (!window.confirm('确认删除该会话？所有消息将一并删除。')) return
  try {
    await deleteSession(id)
    sessions.value = sessions.value.filter((session) => session.id !== id)
    if (activeSessionId.value === id) newChat()
    showToast('会话已删除')
  } catch (error) {
    showError(friendlyError(error))
  }
}

async function sendMessage(text: string, enableWebSearch = false): Promise<void> {
  if (busy.value || !text.trim()) return
  const webSearchEnabled = enableWebSearch
    || localStorage.getItem(WEB_SEARCH_KEY) === '1'
  busy.value = true
  errorMessage.value = ''
  agentStage.value = '正在准备...'

  const userMessage: ChatMessage = {
    id: `local-user-${crypto.randomUUID()}`,
    role: 'user',
    content: text,
  }
  const assistantMessage: ChatMessage = {
    id: `local-assistant-${crypto.randomUUID()}`,
    role: 'assistant',
    content: '',
    streaming: true,
  }
  messages.value.push(userMessage, assistantMessage)
  const assistantIndex = messages.value.length - 1
  controller = new AbortController()
  let receivedEvent = false
  let completed = false

  requestTimer = window.setTimeout(() => {
    if (!completed) controller?.abort()
  }, 75_000)

  try {
    await streamChat({
      message: text,
      sessionId: activeSessionId.value ?? undefined,
      enableWebSearch: webSearchEnabled,
      showSources: showSources.value,
      signal: controller.signal,
      onEvent: (event) => {
        receivedEvent = true
        const target = messages.value[assistantIndex]
        if (!target) return
        if (event.type === 'start') {
          activeSessionId.value = event.session_id
          localStorage.setItem(SESSION_KEY, event.session_id)
        } else if (event.type === 'plan') {
          target.plan = event.steps.map((step) => ({ ...step }))
          agentStage.value = event.message || '正在按计划执行...'
        } else if (event.type === 'plan_step') {
          const plan = event.execution_plan ?? target.plan
          if (plan) {
            target.plan = plan.map((step) => ({ ...step }))
          }
          if (event.message && event.status === 'running') {
            agentStage.value = event.message
          }
        } else if (event.type === 'status') {
          recordActivity(target, event)
          if (event.stage === 'select_tools') {
            agentStage.value = event.message || '正在选择工具...'
          } else if (event.stage === 'load_memory') {
            agentStage.value = event.message || '正在获取长期记忆...'
          } else if (event.stage === 'web_search' && webSearchEnabled) {
            agentStage.value = event.message || '正在联网搜索...'
          } else {
            agentStage.value = event.message || '正在思考...'
          }
        } else if (event.type === 'delta') {
          target.content += event.content
          agentStage.value = ''
        } else if (event.type === 'error') {
          settleInterruptedPlan(target)
          settleInterruptedActivities(target)
          target.content = event.message
          target.error = true
          showError(event.message)
        } else if (event.type === 'done') {
          completed = true
          if (event.status === 'error') {
            settleInterruptedPlan(target)
            settleInterruptedActivities(target)
          }
          if (event.assistant_message_id) {
            target.id = event.assistant_message_id
          }
          if (showSources && event.sources?.length) target.sources = event.sources as Source[]
          if (event.memories?.length) target.memories = event.memories
          if (event.recalled_conversations?.length) {
            target.recalledConversations = event.recalled_conversations
          }
          if (event.status === 'ok' && activeSessionId.value) {
            localStorage.setItem(SESSION_KEY, activeSessionId.value)
          }
        }
      },
    })
    if (!receivedEvent) throw new Error('服务未返回任何事件')
  } catch (error) {
    const target = messages.value[assistantIndex]
    const isAbort = error instanceof DOMException && error.name === 'AbortError'
    const message = isAbort ? '请求已终止，请稍后重试' : friendlyError(error)
    if (target) {
      if (!target.content) target.content = message
      target.error = !isAbort
      if (!isAbort) {
        settleInterruptedPlan(target)
        settleInterruptedActivities(target)
      }
    }
    if (!isAbort) showError(message)
  } finally {
    completed = true
    window.clearTimeout(requestTimer)
    const target = messages.value[assistantIndex]
    if (target) target.streaming = false
    busy.value = false
    controller = null
    agentStage.value = ''
    await refreshSessions()
  }
}

function stopGeneration(): void {
  controller?.abort()
}

async function regenerate(messageId: string): Promise<void> {
  if (busy.value) return
  const idx = messages.value.findIndex((m) => m.id === messageId)
  if (idx === -1 || messages.value[idx].role !== 'assistant') return
  let userIdx = -1
  for (let i = idx - 1; i >= 0; i--) {
    if (messages.value[i].role === 'user') {
      userIdx = i
      break
    }
  }
  if (userIdx === -1) return
  const userText = messages.value[userIdx].content
  messages.value.splice(idx, messages.value.length - idx)
  if (activeSessionId.value) {
    showToast('正在重新生成回复...')
  }
  await sendMessage(userText)
}

onMounted(async () => {
  backendOnline.value = await checkHealth()
  try {
    applyBranding(await getBranding())
  } catch {
    // Branding is optional; keep built-in defaults when the API is unavailable.
  }
  await refreshSessions()
  const remembered = localStorage.getItem(SESSION_KEY)
  if (remembered) {
    await openSession(remembered)
  } else if (sessions.value.length) {
    await openSession(sessions.value[0].id)
  }
  healthTimer = window.setInterval(async () => {
    backendOnline.value = await checkHealth()
  }, 30_000)
})

onBeforeUnmount(() => {
  controller?.abort()
  window.clearTimeout(requestTimer)
  window.clearTimeout(toastTimer)
  window.clearInterval(healthTimer)
})
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--collapsed': sidebarCollapsed,
      'app-shell--has-image-background':
        assistantBackgroundEnabled && assistantBackgroundType === 'image',
      'app-shell--has-video-background':
        assistantBackgroundEnabled && assistantBackgroundType === 'video',
    }"
    :style="appStyle"
  >
    <AppSidebar
      :sessions="sessions"
      :active-id="activeSessionId"
      :loading="loadingSessions"
      :online="backendOnline"
      :open="sidebarOpen"
      :collapsed="sidebarCollapsed"
      :brand-name="assistantName"
      :logo-url="assistantLogoUrl"
      @new-chat="newChat"
      @select="openSession"
      @remove="removeSession"
      @knowledge="knowledgeOpen = true"
      @memory="memoryOpen = true"
      @prompt="promptOpen = true"
      @toggle-collapse="toggleSidebarCollapse"
      @close="sidebarOpen = false"
    />

    <main
      class="chat-main"
      :class="{ 'chat-main--video-background': assistantBackgroundType === 'video' }"
    >
      <video
        v-if="
          assistantBackgroundEnabled &&
          assistantBackgroundType === 'video' &&
          assistantBackgroundUrl
        "
        ref="backgroundVideo"
        class="chat-background-video"
        :src="assistantBackgroundUrl"
        autoplay
        :muted="videoMuted"
        :volume="videoVolume"
        loop
        playsinline
        preload="auto"
        aria-hidden="true"
        @loadedmetadata="updateVideoTime"
        @durationchange="updateVideoTime"
        @timeupdate="updateVideoTime"
        @play="videoPaused = false"
        @pause="videoPaused = true"
        @volumechange="onVideoVolumeChange"
      />
      <div
        v-if="
          assistantBackgroundEnabled &&
          assistantBackgroundType === 'video'
        "
        class="chat-background-video-shade"
        aria-hidden="true"
      />
      <header class="chat-header">
        <button class="icon-button mobile-menu" aria-label="打开侧边栏" @click="sidebarOpen = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <div class="chat-title">
          <span class="live-mark" />
          <div>
            <strong>{{ sessions.find((session) => session.id === activeSessionId)?.title || '新对话' }}</strong>
            <small>安全私密 · 实时响应</small>
          </div>
        </div>
        <div class="header-actions">
          <button
            class="header-knowledge"
            aria-label="打开知识库"
            title="知识库"
            @click="knowledgeOpen = true"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5v16M8 7h7M8 11h5" />
            </svg>
            <span>知识库</span>
          </button>
          <button
            class="header-knowledge header-memory"
            aria-label="打开长期记忆"
            title="长期记忆"
            @click="memoryOpen = true"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3a4 4 0 0 0-4 4v1a4 4 0 0 0-2 7.5A4 4 0 0 0 12 21V3m0 0a4 4 0 0 1 4 4v1a4 4 0 0 1 2 7.5A4 4 0 0 1 12 21" />
            </svg>
            <span>记忆</span>
          </button>
          <button
            class="header-knowledge header-prompt"
            aria-label="打开提示词设置"
            title="提示词设置"
            @click="promptOpen = true"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>提示</span>
          </button>
        </div>
      </header>

      <div class="chat-body">
        <MessageList
          :messages="messages"
          :busy="busy"
          :stage="agentStage"
          :assistant-name="assistantName"
          :logo-url="assistantLogoUrl"
          :show-sources="showSources"
          :show-plan="showPlan"
          @suggest="sendMessage"
          @regenerate="regenerate"
        />
        <div
          v-if="
            assistantBackgroundEnabled &&
            assistantBackgroundType === 'video' &&
            assistantBackgroundUrl
          "
          ref="videoDock"
          class="background-video-controls"
          :class="{
            'background-video-controls--collapsed': videoControlsCollapsed,
            'background-video-controls--dragging': videoDockDragging,
          }"
          :style="{
            ...videoDockStyle,
            '--video-progress': `${videoProgressPercent}%`,
          }"
        >
          <Transition name="video-dock-content">
            <button
              v-if="videoControlsCollapsed"
              key="collapsed"
              class="video-dock-toggle"
              :aria-label="`背景视频进度 ${Math.round(videoProgressPercent)}%，展开进度控制`"
              :title="`播放进度 ${formatVideoTime(videoCurrentTime)} / ${formatVideoTime(videoDuration)}，点击展开`"
              @pointerdown="beginVideoDockDrag"
              @click="toggleVideoDockCollapsed"
            >
              <svg viewBox="0 0 50 50" aria-hidden="true">
                <circle
                  class="video-dock-ring-fg"
                  cx="25"
                  cy="25"
                  r="18"
                  :style="{ strokeDashoffset: videoRingOffset }"
                />
                <path class="video-dock-arrow" d="m21 24 4 4 4-4" />
              </svg>
            </button>
            <div
              v-else
              key="expanded"
              class="video-controls-expanded"
            >
            <button
              class="video-control-button"
              :aria-label="videoPaused ? '播放背景视频' : '暂停背景视频'"
              :title="videoPaused ? '播放' : '暂停'"
              @click="toggleVideoPlayback"
            >
              <svg v-if="videoPaused" viewBox="0 0 24 24" aria-hidden="true">
                <path class="video-dock-play-icon" d="m8 5 11 7-11 7z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14M16 5v14" />
              </svg>
            </button>
            <div class="video-timeline">
              <span class="video-time" aria-hidden="true">
                {{ formatVideoTime(videoCurrentTime) }}
              </span>
              <input
                class="video-progress"
                type="range"
                min="0"
                :max="videoDuration || 0"
                step="0.1"
                :value="videoCurrentTime"
                :disabled="!videoDuration"
                aria-label="调整背景视频播放进度"
                :aria-valuetext="`${formatVideoTime(videoCurrentTime)} / ${formatVideoTime(videoDuration)}`"
                @input="seekVideo"
              />
              <span class="video-time" aria-hidden="true">
                {{ formatVideoTime(videoDuration) }}
              </span>
            </div>
            <button
              class="video-control-collapse"
              aria-label="收起视频控件"
              title="收起；拖动可调整位置"
              @pointerdown="beginVideoDockDrag"
              @click="toggleVideoDockCollapsed"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 15 6-6 6 6" />
              </svg>
            </button>
            </div>
          </Transition>
        </div>
        <ChatComposer
          :busy="busy"
          :show-sources="showSources"
          :show-plan="showPlan"
          @send="sendMessage"
          @update:show-sources="setShowSources"
          @update:show-plan="setShowPlan"
          @stop="stopGeneration"
        />
      </div>
    </main>

    <KnowledgeDrawer
      :open="knowledgeOpen"
      @close="knowledgeOpen = false"
      @error="showError"
      @toast="showToast"
      @deleted="removeDocumentReferences"
    />
    <MemoryDrawer
      :open="memoryOpen"
      @close="memoryOpen = false"
      @error="showError"
      @toast="showToast"
    />
    <PromptSettings
      :open="promptOpen"
      :video-enabled="assistantBackgroundEnabled && assistantBackgroundType === 'video'"
      :video-muted="videoMuted"
      :video-volume="videoVolume"
      @close="promptOpen = false"
      @error="showError"
      @toast="showToast"
      @branding-updated="applyBranding"
      @video-toggle-mute="toggleVideoMute"
      @video-volume-change="(v: number) => { videoVolume = Number(v); applyVideoVolume(); persistVideoVolume() }"
    />

    <Transition name="toast">
      <div v-if="errorMessage" class="toast toast--error" role="alert">
        <span>!</span>
        <p>{{ errorMessage }}</p>
        <button aria-label="关闭提示" @click="errorMessage = ''">×</button>
      </div>
    </Transition>
    <Transition name="toast">
      <div v-if="toastMessage" class="toast toast--success" role="status">
        <span>?</span>
        <p>{{ toastMessage }}</p>
      </div>
    </Transition>
  </div>
</template>
