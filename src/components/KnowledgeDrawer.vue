<script setup lang="ts">
import { ref, watch } from 'vue'
import type { KnowledgeDocument, Source } from '../types'
import {
  deleteDocument,
  listDocuments,
  searchKnowledge,
  uploadDocument,
} from '../services/api'

const props = defineProps<{
  open: boolean
}>()
const emit = defineEmits<{
  close: []
  error: [message: string]
  toast: [message: string]
  deleted: [documentId: string]
}>()

const documents = ref<KnowledgeDocument[]>([])
const loading = ref(false)
const uploading = ref(false)
const searchQuery = ref('')
const searching = ref(false)
const results = ref<Source[]>([])
const hasSearched = ref(false)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function loadDocuments(): Promise<void> {
  loading.value = true
  try {
    documents.value = await listDocuments()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '读取知识库失败')
  } finally {
    loading.value = false
  }
}

async function handleFile(file: File | undefined): Promise<void> {
  if (!file || uploading.value) return
  uploading.value = true
  try {
    const result = await uploadDocument(file)
    emit('toast', `《${result.document.filename}》已切分为 ${result.indexed_chunks} 个片段`)
    await loadDocuments()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '上传失败')
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  void handleFile(event.dataTransfer?.files[0])
}

async function search(): Promise<void> {
  const query = searchQuery.value.trim()
  if (!query || searching.value) return
  searching.value = true
  hasSearched.value = true
  try {
    results.value = (await searchKnowledge(query)).results
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '检索失败')
    results.value = []
  } finally {
    searching.value = false
  }
}

async function remove(document: KnowledgeDocument): Promise<void> {
  if (!window.confirm(`确认从知识库删除《${document.filename}》？`)) return
  try {
    await deleteDocument(document.id)
    documents.value = documents.value.filter((item) => item.id !== document.id)
    results.value = results.value.filter((item) => item.document_id !== document.id)
    emit('deleted', document.id)
    emit('toast', '文档及其向量索引已删除')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '删除失败')
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

watch(
  () => props.open,
  (open) => {
    if (open) void loadDocuments()
  },
)
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="drawer-shell">
      <div class="drawer-scrim" @click="emit('close')" />
      <aside class="knowledge-drawer">
        <header>
          <div>
            <p class="eyebrow">RETRIEVAL AUGMENTED GENERATION</p>
            <h2>知识库</h2>
          </div>
          <button class="icon-button" aria-label="关闭知识库" @click="emit('close')">×</button>
        </header>

        <section class="upload-section">
          <label
            class="upload-zone"
            :class="{ dragging, busy: uploading }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <input
              ref="fileInput"
              type="file"
              accept=".md,.markdown,.txt,.pdf"
              :disabled="uploading"
              @change="handleFile(($event.target as HTMLInputElement).files?.[0])"
            />
            <span class="upload-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
              </svg>
            </span>
            <strong>{{ uploading ? '正在解析与建立向量索引…' : '上传知识文档' }}</strong>
            <small>拖拽文件，或点击选择 Markdown / TXT / PDF</small>
          </label>
        </section>

        <section class="drawer-section">
          <div class="section-heading">
            <h3>语义检索测试</h3>
            <span>Top K + 阈值过滤</span>
          </div>
          <form class="search-form" @submit.prevent="search">
            <input v-model="searchQuery" placeholder="输入文档中的关键词或问题" />
            <button type="submit" :disabled="searching || !searchQuery.trim()">
              {{ searching ? '检索中' : '检索' }}
            </button>
          </form>
          <div v-if="results.length" class="search-results">
            <article v-for="result in results" :key="`${result.document_id}-${result.chunk_index}`">
              <div>
                <strong>{{ result.filename }}</strong>
                <span>{{ (result.score * 100).toFixed(0) }}%</span>
              </div>
              <p>{{ result.content }}</p>
            </article>
          </div>
          <p v-else-if="hasSearched && !searching" class="search-empty">没有超过相似度阈值的片段</p>
        </section>

        <section class="drawer-section documents-section">
          <div class="section-heading">
            <h3>已索引文档</h3>
            <span>{{ documents.length }} 份</span>
          </div>
          <div v-if="loading" class="document-skeletons">
            <span v-for="i in 3" :key="i" />
          </div>
          <div v-else-if="documents.length" class="document-list">
            <article v-for="document in documents" :key="document.id">
              <span class="file-type">{{ document.filename.split('.').pop()?.toUpperCase() || 'DOC' }}</span>
              <div>
                <strong>{{ document.filename }}</strong>
                <small>{{ formatSize(document.size_bytes) }} · {{ document.chunk_count }} 个片段</small>
              </div>
              <button aria-label="删除文档" @click="remove(document)">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
                </svg>
              </button>
            </article>
          </div>
          <div v-else class="document-empty">
            <span>∅</span>
            <p>知识库还是空的。上传文档后，聊天会自动携带相关片段。</p>
          </div>
        </section>
      </aside>
    </div>
  </Transition>
</template>
