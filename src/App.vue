<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { generateImages, generateVideo } from './api/provider.js'
import { MODELS, findModel, COMMON_SIZES } from './models.js'
import { VIDEO_MODELS, findVideoModel, VIDEO_SIZES } from './videoModels.js'
import Gallery from './components/Gallery.vue'

const LS_KEY = 'api-key'
const LS_SETTINGS = 'imagegen-settings'

// 'image' (synchronous) or 'video' (async submit + poll).
const mode = ref('image')
const isVideo = computed(() => mode.value === 'video')

// Optional: seed the key from a .env file (VITE_API_KEY).
// Handy for local dev so you don't paste it every time. A key you type in the
// UI is saved to localStorage and takes precedence on later visits.
const ENV_KEY = import.meta.env.VITE_API_KEY || ''

// --- persisted state ---
const apiKey = ref('')
const showKey = ref(false)
const keyFromEnv = ref(false)

const modelId = ref(MODELS[0].id)
const useCustomModel = ref(false)
const customModelId = ref('') // any model id from your provider
const prompt = ref('')
const negativePrompt = ref('')
const imageSize = ref(MODELS[0].sizes[0])
const batchSize = ref(1)
const steps = ref(MODELS[0].defaultSteps)
const guidance = ref(MODELS[0].defaultGuidance)
const seed = ref('') // empty string = random
const useCustomSize = ref(false)
const customSize = ref('1024x1024')

// Image-to-video source (data URL). Only used by i2v video models.
const sourceImage = ref('')

// --- runtime state ---
const loading = ref(false)
const error = ref('')
const results = ref([]) // newest first: [{ type, prompt, model, seed, images: [{url}] }]

// Video progress feedback. Videos take minutes, so we show a live elapsed timer
// and queue phase so a long-but-healthy render doesn't look frozen.
const phase = ref('') // 'queued' | 'rendering'
const queuePos = ref(null)
const elapsedSec = ref(0)
let ticker = null
let abortCtl = null

const statusText = computed(() => {
  if (!loading.value || !isVideo.value) return ''
  const mm = Math.floor(elapsedSec.value / 60)
  const ss = String(elapsedSec.value % 60).padStart(2, '0')
  const t = `${mm}:${ss}`
  if (phase.value === 'queued')
    return `Queued${queuePos.value ? ` (position ${queuePos.value})` : ''}… ${t}`
  return `Rendering video… ${t} elapsed · Wan 2.2 usually takes 3–5 min`
})

function startTicker() {
  elapsedSec.value = 0
  phase.value = 'queued'
  ticker = setInterval(() => (elapsedSec.value += 1), 1000)
}
function stopTicker() {
  if (ticker) clearInterval(ticker)
  ticker = null
  phase.value = ''
  queuePos.value = null
}

function cancel() {
  abortCtl?.abort()
}

onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})

// The preset list + lookup depend on the current mode.
const activeModels = computed(() => (isVideo.value ? VIDEO_MODELS : MODELS))
const findActive = (id) => (isVideo.value ? findVideoModel(id) : findModel(id))

// The model actually sent to the API: either a preset or a pasted custom id.
const effectiveModelId = computed(() =>
  useCustomModel.value ? customModelId.value.trim() : modelId.value,
)

// Metadata is only known for preset models. For a custom id we can't know its
// capabilities, so we allow every field (negative prompt, guidance, any size).
const model = computed(() => findActive(effectiveModelId.value))
const sizes = computed(
  () => model.value?.sizes ?? (isVideo.value ? VIDEO_SIZES : COMMON_SIZES),
)
const supportsNegative = computed(() =>
  useCustomModel.value ? true : (model.value?.supportsNegativePrompt ?? true),
)
// Guidance/steps/batch are image-only. For a custom image model we allow them.
const supportsGuidance = computed(() =>
  isVideo.value ? false : useCustomModel.value ? true : model.value?.defaultGuidance != null,
)
// i2v models need a source image; t2v (and custom video ids) don't.
const needsSourceImage = computed(() => isVideo.value && model.value?.kind === 'i2v')

// Load persisted key + settings on mount.
onMounted(() => {
  const stored = localStorage.getItem(LS_KEY) || ''
  apiKey.value = stored || ENV_KEY
  keyFromEnv.value = !stored && !!ENV_KEY
  try {
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}')
    if (s.mode === 'video' || s.mode === 'image') mode.value = s.mode
    if (s.modelId && findActive(s.modelId)) modelId.value = s.modelId
    else modelId.value = activeModels.value[0].id
    if (typeof s.prompt === 'string') prompt.value = s.prompt
    if (typeof s.negativePrompt === 'string') negativePrompt.value = s.negativePrompt
    if (s.imageSize) imageSize.value = s.imageSize
    if (s.batchSize) batchSize.value = s.batchSize
    if (s.useCustomModel) useCustomModel.value = true
    if (typeof s.customModelId === 'string') customModelId.value = s.customModelId
  } catch {
    /* ignore malformed settings */
  }
})

watch(apiKey, (v) => {
  // Don't persist a value that's just mirroring the .env key — that way editing
  // .env stays authoritative. Once the user types their own key, persist it.
  if (keyFromEnv.value && v === ENV_KEY) return
  keyFromEnv.value = false
  localStorage.setItem(LS_KEY, v)
})

watch(
  [mode, modelId, prompt, negativePrompt, imageSize, batchSize, useCustomModel, customModelId],
  () => {
    localStorage.setItem(
      LS_SETTINGS,
      JSON.stringify({
        mode: mode.value,
        modelId: modelId.value,
        prompt: prompt.value,
        negativePrompt: negativePrompt.value,
        imageSize: imageSize.value,
        batchSize: batchSize.value,
        useCustomModel: useCustomModel.value,
        customModelId: customModelId.value,
      }),
    )
  },
)

// Switching mode swaps to that mode's first preset (which resets size below).
watch(mode, () => {
  useCustomModel.value = false
  modelId.value = activeModels.value[0].id
})

// When the model changes, reset params to that model's defaults / valid size.
watch(modelId, () => {
  const m = model.value
  if (!m) return
  if (!m.sizes.includes(imageSize.value)) imageSize.value = m.sizes[0]
  if (!isVideo.value) {
    steps.value = m.defaultSteps
    guidance.value = m.defaultGuidance
  }
})

const effectiveSize = computed(() =>
  useCustomSize.value ? customSize.value.trim() : imageSize.value,
)

const canGenerate = computed(
  () =>
    !!apiKey.value &&
    !!prompt.value.trim() &&
    !!effectiveModelId.value &&
    !(needsSourceImage.value && !sourceImage.value) &&
    !loading.value,
)

function onImagePick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    sourceImage.value = reader.result // data: URL
  }
  reader.readAsDataURL(file)
}

async function generate() {
  error.value = ''
  if (!canGenerate.value) {
    if (!apiKey.value) error.value = 'Add your provider API key first.'
    else if (!prompt.value.trim()) error.value = 'Enter a prompt.'
    else if (!effectiveModelId.value) error.value = 'Enter a model id.'
    else if (needsSourceImage.value && !sourceImage.value)
      error.value = 'Upload a source image for image-to-video.'
    return
  }

  loading.value = true
  const seedNum = seed.value === '' ? undefined : Number(seed.value)
  const seedOpt = Number.isFinite(seedNum) ? seedNum : undefined

  try {
    if (isVideo.value) {
      abortCtl = new AbortController()
      startTicker()
      const results_ = await generateVideo({
        apiKey: apiKey.value,
        model: effectiveModelId.value,
        prompt: prompt.value,
        negativePrompt: supportsNegative.value ? negativePrompt.value : undefined,
        imageSize: effectiveSize.value,
        seed: seedOpt,
        image: needsSourceImage.value ? sourceImage.value : undefined,
        signal: abortCtl.signal,
        onProgress: (s) => {
          if (s.status === 'InQueue') {
            phase.value = 'queued'
            queuePos.value = s.position || null
          } else if (s.status === 'InProgress' || s.status === 'Submitted') {
            phase.value = 'rendering'
          }
        },
      })

      const videos = results_.videos || []
      results.value.unshift({
        type: 'video',
        prompt: prompt.value.trim(),
        model: effectiveModelId.value,
        seed: results_.seed ?? seedOpt ?? null,
        images: videos, // [{ url }]
      })
    } else {
      const data = await generateImages({
        apiKey: apiKey.value,
        model: effectiveModelId.value,
        prompt: prompt.value,
        negativePrompt: supportsNegative.value ? negativePrompt.value : undefined,
        imageSize: effectiveSize.value,
        batchSize: Number(batchSize.value),
        numInferenceSteps: Number(steps.value),
        guidanceScale: supportsGuidance.value ? Number(guidance.value) : undefined,
        seed: seedOpt,
      })

      const images = data.images || []
      if (images.length === 0) throw new Error('No images returned by the API.')

      results.value.unshift({
        type: 'image',
        prompt: prompt.value.trim(),
        model: effectiveModelId.value,
        seed: data.seed ?? seedOpt ?? null,
        imageSize: effectiveSize.value,
        images,
      })
    }
  } catch (e) {
    // A user-initiated cancel isn't an error worth showing.
    if (e.name !== 'AbortError') error.value = e.message || String(e)
  } finally {
    loading.value = false
    stopTicker()
    abortCtl = null
  }
}

function handlePromptKeydown(e) {
  // Cmd/Ctrl+Enter to generate.
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    generate()
  }
}
</script>

<template>
  <div class="layout">
    <!-- Sidebar / controls -->
    <aside class="sidebar">
      <div class="brand">
        <h1>AI {{ isVideo ? 'Video' : 'Image' }} Gen</h1>
        <span class="tag">any-provider harness</span>
      </div>

      <div class="modes">
        <button :class="{ active: !isVideo }" @click="mode = 'image'" type="button">Image</button>
        <button :class="{ active: isVideo }" @click="mode = 'video'" type="button">Video</button>
      </div>

      <div class="field">
        <label>API Key <span v-if="keyFromEnv" class="badge">.env</span></label>
        <div class="key-row">
          <input
            :type="showKey ? 'text' : 'password'"
            v-model="apiKey"
            placeholder="sk-..."
            autocomplete="off"
            spellcheck="false"
          />
          <button class="ghost sm" @click="showKey = !showKey" type="button">
            {{ showKey ? 'Hide' : 'Show' }}
          </button>
        </div>
        <p class="hint">
          Stored only in your browser (localStorage). Set VITE_PROVIDER_URL in
          .env to point this at your provider's API.
        </p>
      </div>

      <div class="field">
        <label>
          Model
          <button class="link" type="button" @click="useCustomModel = !useCustomModel">
            {{ useCustomModel ? 'presets' : 'custom' }}
          </button>
        </label>
        <select v-if="!useCustomModel" v-model="modelId">
          <option v-for="m in activeModels" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
        <template v-else>
          <input
            v-model="customModelId"
            :placeholder="isVideo ? 'e.g. Wan-AI/Wan2.2-T2V-A14B' : 'e.g. black-forest-labs/FLUX.1-dev'"
            spellcheck="false"
          />
          <p class="hint">Paste any {{ isVideo ? 'video' : 'image' }} model id your provider supports.</p>
        </template>
      </div>

      <div class="field" v-if="needsSourceImage">
        <label>Source Image</label>
        <input type="file" accept="image/*" @change="onImagePick" class="file" />
        <img v-if="sourceImage" :src="sourceImage" class="thumb" alt="source" />
      </div>

      <div class="field">
        <label>Prompt</label>
        <textarea
          v-model="prompt"
          placeholder="A serene island near a turquoise sea, golden hour, cinematic"
          @keydown="handlePromptKeydown"
        />
      </div>

      <div class="field" v-if="supportsNegative">
        <label>Negative Prompt</label>
        <textarea
          v-model="negativePrompt"
          class="short"
          placeholder="blurry, low quality, distorted"
        />
      </div>

      <div class="field">
        <label>
          Size
          <button class="link" type="button" @click="useCustomSize = !useCustomSize">
            {{ useCustomSize ? 'presets' : 'custom' }}
          </button>
        </label>
        <select v-if="!useCustomSize" v-model="imageSize">
          <option v-for="s in sizes" :key="s" :value="s">{{ s }}</option>
        </select>
        <input v-else v-model="customSize" placeholder="1024x1024" />
      </div>

      <div class="row" v-if="!isVideo">
        <div class="field">
          <label>Batch</label>
          <select v-model.number="batchSize">
            <option v-for="n in 4" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <div class="field">
          <label>Steps</label>
          <input type="number" v-model.number="steps" min="1" max="100" />
        </div>
      </div>

      <div class="row">
        <div class="field" v-if="supportsGuidance">
          <label>Guidance</label>
          <input type="number" v-model.number="guidance" step="0.5" min="0" max="20" />
        </div>
        <div class="field">
          <label>Seed <span class="opt">(blank = random)</span></label>
          <input type="number" v-model="seed" placeholder="random" />
        </div>
      </div>

      <button v-if="!(loading && isVideo)" class="generate" :disabled="!canGenerate" @click="generate">
        <span v-if="loading" class="spinner" />
        {{ loading ? 'Generating…' : 'Generate' }}
      </button>
      <button v-else class="generate cancel" @click="cancel">Cancel</button>
      <p v-if="loading && isVideo" class="kbd-hint">{{ statusText }}</p>
      <p v-else class="kbd-hint">⌘/Ctrl + Enter</p>

      <p v-if="error" class="error">{{ error }}</p>
    </aside>

    <!-- Results -->
    <main class="content">
      <Gallery
        :items="results"
        :loading="loading"
        :batch-size="isVideo ? 1 : Number(batchSize)"
        :pending-size="isVideo ? '' : effectiveSize"
        :status-text="statusText"
        :media-label="isVideo ? 'videos' : 'images'"
      />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 340px 1fr;
  min-height: 100vh;
}

.sidebar {
  border-right: 1px solid var(--border);
  background: var(--bg-elev);
  padding: 22px 20px 40px;
  overflow-y: auto;
  height: 100vh;
  position: sticky;
  top: 0;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}

.modes {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 22px;
}

.modes button {
  flex: 1;
  padding: 7px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-dim);
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}

.modes button.active {
  background: var(--accent);
  color: white;
}

.file {
  padding: 7px;
  font-size: 13px;
}

.thumb {
  margin-top: 10px;
  width: 100%;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  display: block;
}

.brand h1 {
  font-size: 18px;
  margin: 0;
  letter-spacing: -0.01em;
}

.tag {
  font-size: 11px;
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.field {
  margin-bottom: 16px;
  flex: 1;
}

.row {
  display: flex;
  gap: 12px;
}

.key-row {
  display: flex;
  gap: 8px;
}

.short {
  min-height: 56px;
}

.hint {
  font-size: 12px;
  color: var(--text-faint);
  margin: 6px 0 0;
}

.badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--accent-hover);
  background: rgba(76, 110, 245, 0.12);
  border: 1px solid rgba(76, 110, 245, 0.3);
  border-radius: 5px;
  padding: 1px 6px;
  margin-left: 4px;
  vertical-align: middle;
}

.opt {
  font-weight: 400;
  text-transform: none;
  color: var(--text-faint);
  letter-spacing: 0;
}

.link {
  float: right;
  background: none;
  border: none;
  color: var(--accent-hover);
  font-size: 11px;
  text-transform: lowercase;
  letter-spacing: 0;
  padding: 0;
}

.ghost {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-dim);
  border-radius: var(--radius-sm);
}

.ghost.sm {
  padding: 0 12px;
  font-size: 13px;
  white-space: nowrap;
}

.ghost:hover {
  color: var(--text);
  border-color: var(--border-focus);
}

.generate {
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: white;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  transition: background 0.15s;
}

.generate:hover:not(:disabled) {
  background: var(--accent-hover);
}

.generate:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.generate.cancel {
  background: transparent;
  border: 1px solid var(--danger);
  color: var(--danger);
}

.generate.cancel:hover {
  background: rgba(255, 107, 107, 0.12);
}

.kbd-hint {
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
  margin: 8px 0 0;
}

.spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error {
  margin-top: 14px;
  padding: 10px 12px;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: var(--radius-sm);
  color: var(--danger);
  font-size: 13px;
  word-break: break-word;
}

.content {
  padding: 26px;
  overflow-y: auto;
  height: 100vh;
}

@media (max-width: 760px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .sidebar {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  .content {
    height: auto;
  }
}
</style>
