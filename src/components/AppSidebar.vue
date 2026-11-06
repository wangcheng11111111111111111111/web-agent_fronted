<script setup lang="ts">
import type { SessionSummary } from '../types'

defineProps<{
  sessions: SessionSummary[]
  activeId: string | null
  loading: boolean
  online: boolean | null
  open: boolean
  collapsed: boolean
  brandName: string
  logoUrl: string | null
}>()

const emit = defineEmits<{
  newChat: []
  select: [id: string]
  remove: [id: string]
  knowledge: []
  memory: []
  prompt: []
  toggleCollapse: []
  close: []
}>()

function formatRelative(value: string): string {
  const date = new Date(value)
  const delta = Date.now() - date.getTime()
  if (delta < 60_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)
}
</script>

<template>
  <div v-if="open" class="sidebar-scrim" @click="emit('close')" />
  <aside
    id="app-sidebar"
    class="sidebar"
    :class="{ 'sidebar--open': open, 'sidebar--collapsed': collapsed }"
  >
    <div class="brand">
      <button
        v-if="collapsed"
        class="brand-mark brand-mark--toggle"
        type="button"
        aria-label="点击 Logo 展开侧栏"
        aria-expanded="false"
        aria-controls="app-sidebar"
        title="点击 Logo 展开侧栏"
        @click="emit('toggleCollapse')"
      >
        <img v-if="logoUrl" :src="logoUrl" class="brand-image" alt="" />
        <template v-else>
          <span />
          <span />
          <span />
        </template>
      </button>
      <div v-else class="brand-mark" aria-hidden="true">
        <img v-if="logoUrl" :src="logoUrl" class="brand-image" alt="" />
        <template v-else>
          <span />
          <span />
          <span />
        </template>
      </div>
      <div class="brand-copy">
        <strong>{{ brandName }}</strong>
        <small>AI ASSISTANT</small>
      </div>
      <button
        v-if="!collapsed"
        class="sidebar-collapse-btn"
        type="button"
        aria-label="收起侧栏"
        aria-expanded="true"
        aria-controls="app-sidebar"
        title="收起侧栏"
        @click="emit('toggleCollapse')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        class="sidebar-close-btn"
        aria-label="关闭侧栏"
        title="关闭侧栏"
        @click="emit('close')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>

    <button class="new-chat-button" title="新建对话" @click="emit('newChat')">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span class="new-chat-label">新建对话</span>
    </button>

    <div class="sidebar-label">
      <span class="sidebar-label-text">最近对话</span>
      <span class="count">{{ sessions.length }}</span>
    </div>

    <div class="session-list">
      <div v-if="loading" class="session-loading">
        <span v-for="i in 3" :key="i" class="skeleton-line" />
      </div>
      <button
        v-for="session in sessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === activeId }"
        :title="session.title"
        @click="emit('select', session.id)"
      >
        <span class="session-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 5 13.5z" />
          </svg>
        </span>
        <span class="session-copy">
          <span class="session-title">{{ session.title }}</span>
          <span class="session-meta">{{ session.message_count }} 条消息 · {{ formatRelative(session.updated_at) }}</span>
        </span>
        <span
          class="delete-session"
          role="button"
          tabindex="0"
          aria-label="删除会话"
          @click.stop="emit('remove', session.id)"
          @keydown.enter.stop="emit('remove', session.id)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
          </svg>
        </span>
      </button>
      <div v-if="!loading && sessions.length === 0" class="empty-sessions">
        还没有历史对话
      </div>
    </div>

    <div class="sidebar-footer">
      <button class="knowledge-button" title="知识库" @click="emit('knowledge')">
        <span class="knowledge-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5v16M8 7h7M8 11h5" />
          </svg>
        </span>
        <span class="kb-copy">
          <strong>知识库</strong>
          <small>上传与检索文档</small>
        </span>
        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
      <button class="knowledge-button memory-button" title="长期记忆" @click="emit('memory')">
        <span class="knowledge-icon memory-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3a4 4 0 0 0-4 4v1a4 4 0 0 0-2 7.5A4 4 0 0 0 12 21m0-18a4 4 0 0 1 4 4v1a4 4 0 0 1 2 7.5A4 4 0 0 1 12 21m0-18v18" />
          </svg>
        </span>
        <span class="kb-copy">
          <strong>长期记忆</strong>
          <small>查看与删除跨会话事实</small>
        </span>
        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
      <button class="knowledge-button memory-button" title="助手设置" @click="emit('prompt')">
        <span class="knowledge-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 9.5 8 3.5 8l5 3.5L6 18l6-4 6 4-2.5-6.5 5-3.5h-6z" />
          </svg>
        </span>
        <span class="kb-copy">
          <strong>助手设置</strong>
          <small>名称、图片、性格与语气</small>
        </span>
        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
      <div class="service-line">
        <span class="status-dot" :class="{ online: online, offline: online === false }" />
        <span class="service-text">{{ online === null ? '正在连接后端' : online ? '后端服务正常' : '后端服务离线' }}</span>
        <span class="version">v1.0</span>
      </div>
    </div>
  </aside>
</template>
