// Generic client for image + video generation APIs.
//
// Requests go through the Vite dev proxy (`/api/provider` -> the API host)
// so the browser never talks to the API host directly and CORS is a
// non-issue. See vite.config.js.

const BASE = '/api/provider'

// Shared POST helper: sends JSON, parses JSON, throws a useful Error on !ok.
async function apiPost(path, apiKey, body, signal) {
  if (!apiKey) throw new Error('An API key is required.')

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error?.message ||
      data?.error ||
      data?.raw ||
      `Request failed with status ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }

  return data
}

/**
 * Generate one or more images (synchronous).
 *
 * @param {object} opts
 * @param {string} opts.apiKey       API key (Bearer token).
 * @param {string} opts.model        Model id.
 * @param {string} opts.prompt       Text prompt.
 * @param {string} [opts.negativePrompt]
 * @param {string} [opts.imageSize]  e.g. "1024x1024".
 * @param {number} [opts.batchSize]  Number of images (1-4).
 * @param {number} [opts.numInferenceSteps]
 * @param {number} [opts.guidanceScale]
 * @param {number} [opts.seed]       Omit for a random seed.
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{images: {url: string}[], seed?: number, timings?: object}>}
 */
export async function generateImages(opts) {
  const {
    apiKey,
    model,
    prompt,
    negativePrompt,
    imageSize,
    batchSize,
    numInferenceSteps,
    guidanceScale,
    seed,
    signal,
  } = opts

  if (!prompt || !prompt.trim()) throw new Error('A prompt is required.')

  const body = {
    model,
    prompt: prompt.trim(),
    image_size: imageSize,
    batch_size: batchSize,
  }
  if (negativePrompt && negativePrompt.trim()) body.negative_prompt = negativePrompt.trim()
  if (Number.isFinite(numInferenceSteps)) body.num_inference_steps = numInferenceSteps
  if (Number.isFinite(guidanceScale)) body.guidance_scale = guidanceScale
  if (Number.isFinite(seed)) body.seed = seed

  return apiPost('/v1/images/generations', apiKey, body, signal)
}

/**
 * Submit a video job. Video generation is asynchronous — this returns a
 * requestId you poll with getVideoStatus().
 *
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model        e.g. "Wan-AI/Wan2.2-T2V-A14B".
 * @param {string} opts.prompt
 * @param {string} [opts.negativePrompt]
 * @param {string} [opts.imageSize]  e.g. "1280x720".
 * @param {number} [opts.seed]
 * @param {string} [opts.image]      data: URL of a source image (image-to-video).
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{requestId: string}>}
 */
export async function submitVideo(opts) {
  const { apiKey, model, prompt, negativePrompt, imageSize, seed, image, signal } = opts

  if (!prompt || !prompt.trim()) throw new Error('A prompt is required.')

  const body = { model, prompt: prompt.trim() }
  if (imageSize) body.image_size = imageSize
  if (negativePrompt && negativePrompt.trim()) body.negative_prompt = negativePrompt.trim()
  if (Number.isFinite(seed)) body.seed = seed
  if (image) body.image = image

  return apiPost('/v1/video/submit', apiKey, body, signal)
}

/**
 * Poll a video job's status.
 *
 * @returns {Promise<{status: 'InQueue'|'InProgress'|'Succeed'|'Failed', reason?: string, position?: number, results?: {videos: {url: string}[], seed?: number, timings?: object}}>}
 */
export async function getVideoStatus(apiKey, requestId, signal) {
  return apiPost('/v1/video/status', apiKey, { requestId }, signal)
}

/**
 * Submit a video job and poll until it finishes. Calls onProgress with each
 * status update so the UI can show queue/progress state.
 *
 * @param {object} opts  Same as submitVideo, plus:
 * @param {(status: object) => void} [opts.onProgress]
 * @param {number} [opts.pollMs]     Poll interval (default 5000).
 * @param {number} [opts.timeoutMs]  Give up after this long (default 10 min).
 * @returns {Promise<{videos: {url: string}[], seed?: number, timings?: object}>}
 */
export async function generateVideo(opts) {
  const { apiKey, onProgress, pollMs = 5000, timeoutMs = 15 * 60 * 1000, signal } = opts

  const { requestId } = await submitVideo(opts)
  if (!requestId) throw new Error('No requestId returned by the API.')
  // Surface the id so a slow/stuck job is debuggable from the console.
  console.info('[video] submitted, requestId =', requestId)
  onProgress?.({ status: 'Submitted', requestId })

  const deadline = Date.now() + timeoutMs
  let consecutiveErrors = 0
  while (Date.now() < deadline) {
    await abortableSleep(pollMs, signal)

    let status
    try {
      status = await getVideoStatus(apiKey, requestId, signal)
      consecutiveErrors = 0
    } catch (e) {
      if (e.name === 'AbortError') throw e
      // A transient poll failure (network blip, brief 5xx) shouldn't kill a
      // multi-minute job — retry a few times before giving up.
      if (++consecutiveErrors >= 5)
        throw new Error(`Lost contact with the API while polling: ${e.message}`)
      continue
    }

    onProgress?.(status)

    if (status.status === 'Succeed') {
      const videos = status.results?.videos || []
      if (videos.length === 0) throw new Error('Job succeeded but returned no video.')
      return status.results
    }
    if (status.status === 'Failed') {
      throw new Error(status.reason || 'Video generation failed.')
    }
  }
  throw new Error(
    `Timed out after ${Math.round(timeoutMs / 60000)} min. The job (${requestId}) may still finish on the provider — check your dashboard or try again.`,
  )
}

// setTimeout that rejects promptly if the signal aborts (so Cancel is snappy).
function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}