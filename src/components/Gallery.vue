<script setup>
defineProps({
  items: { type: Array, required: true },
  loading: Boolean,
  batchSize: { type: Number, default: 1 },
  pendingSize: { type: String, default: '' },
  statusText: { type: String, default: '' },
  mediaLabel: { type: String, default: 'images' },
})

// Turn a "WIDTHxHEIGHT" size string into a CSS aspect-ratio ("1024 / 768").
// Falls back to square when the size is missing or unparseable, so older
// results (which didn't record a size) still render sensibly.
function aspect(size) {
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(String(size || '').trim())
  return m ? `${m[1]} / ${m[2]}` : '1 / 1'
}

function download(url, index, type) {
  // SiliconFlow serves media from its own CDN so a plain anchor download works.
  const ext = type === 'video' ? 'mp4' : 'png'
  const a = document.createElement('a')
  a.href = url
  a.download = `${type || 'image'}-${Date.now()}-${index}.${ext}`
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
</script>

<template>
  <div class="gallery">
    <div v-if="loading">
      <div class="grid" :class="{ single: batchSize === 1 }">
        <div
          v-for="n in batchSize"
          :key="n"
          class="skeleton"
          :style="{ aspectRatio: aspect(pendingSize) }"
        />
      </div>
      <p v-if="statusText" class="status">{{ statusText }}</p>
    </div>

    <div v-else-if="items.length === 0" class="empty">
      <div class="empty-icon">✦</div>
      <p>Generated {{ mediaLabel }} will appear here.</p>
      <span>Enter a prompt and hit Generate.</span>
    </div>

    <div v-else class="stack">
      <section v-for="(batch, bi) in items" :key="bi" class="batch">
        <header class="batch-head">
          <span class="batch-prompt" :title="batch.prompt">{{ batch.prompt }}</span>
          <span class="batch-meta">
            {{ batch.model }}
            <template v-if="batch.seed != null"> · seed {{ batch.seed }}</template>
          </span>
        </header>
        <div
          class="grid"
          :class="{
            'grid-video': batch.type === 'video',
            single: batch.type !== 'video' && batch.images.length === 1,
          }"
        >
          <figure
            v-for="(item, ii) in batch.images"
            :key="ii"
            class="card"
            :class="{ video: batch.type === 'video' }"
          >
            <video
              v-if="batch.type === 'video'"
              :src="item.url"
              controls
              loop
              playsinline
              preload="metadata"
            />
            <img v-else :src="item.url" :alt="batch.prompt" loading="lazy" />
            <button class="dl" @click="download(item.url, ii, batch.type)" title="Download">↓</button>
          </figure>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.gallery {
  height: 100%;
}

/* Tallest an image may get, leaving room for page padding + the batch header
   so a single result fits the content area without scrolling. */
.gallery {
  --media-max-h: calc(100vh - 140px);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  justify-items: center;
}

/* A lone image isn't crammed into a 220px column — it grows to fill the
   available space (bounded by height) and centers, at its true ratio. */
.grid.single {
  display: flex;
  justify-content: center;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 26px;
}

.batch-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
}

.batch-prompt {
  font-size: 14px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-meta {
  font-size: 12px;
  color: var(--text-faint);
  white-space: nowrap;
  flex-shrink: 0;
}

.card {
  position: relative;
  margin: 0;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-input);
  border: 1px solid var(--border);
  max-width: 100%;
}

/* In the grid, cards fill their column; the image keeps its own ratio. */
.card img {
  display: block;
  width: 100%;
  height: auto;
  max-height: var(--media-max-h);
  object-fit: contain;
}

/* The single-image case: size by height so a portrait fills vertically and a
   landscape fills horizontally — always the rendered aspect ratio. */
.grid.single .card img {
  width: auto;
  max-width: 100%;
  max-height: var(--media-max-h);
}

/* Loading skeleton mirrors the single-image sizing: height-driven, centered. */
.grid.single .skeleton {
  width: auto;
  height: var(--media-max-h);
  max-width: 100%;
}

/* Videos keep their real aspect ratio instead of being square-cropped. */
.grid-video {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 480px), 1fr));
}

.card.video {
  aspect-ratio: auto;
}

.card.video video {
  width: 100%;
  height: auto;
  display: block;
}

.status {
  margin: 16px 0 0;
  font-size: 13px;
  color: var(--text-dim);
  text-align: center;
}

.dl {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(15, 17, 21, 0.75);
  backdrop-filter: blur(6px);
  color: var(--text);
  font-size: 16px;
  opacity: 0;
  transition: opacity 0.15s;
}

.card:hover .dl {
  opacity: 1;
}

.dl:hover {
  background: var(--accent);
}

.skeleton {
  aspect-ratio: 1;
  width: 100%;
  max-height: var(--media-max-h);
  border-radius: var(--radius);
  background: linear-gradient(100deg, var(--bg-input) 30%, var(--bg-elev) 50%, var(--bg-input) 70%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.empty {
  height: 100%;
  min-height: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-dim);
}

.empty-icon {
  font-size: 40px;
  color: var(--border);
  margin-bottom: 12px;
}

.empty p {
  margin: 0 0 4px;
}

.empty span {
  font-size: 13px;
  color: var(--text-faint);
}
</style>
