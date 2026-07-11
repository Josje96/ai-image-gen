// Known SiliconFlow video models. As with images, you can type any model id
// in the UI via the "custom" toggle.
//
// Video generation is asynchronous: submit a job, then poll for the result
// (see src/api/siliconflow.js). `kind` drives whether the UI shows an image
// upload: "t2v" = text-to-video, "i2v" = image-to-video (needs a source image).

export const VIDEO_SIZES = ['1280x720', '720x1280', '960x960']

export const VIDEO_MODELS = [
  {
    id: 'Wan-AI/Wan2.2-T2V-A14B',
    label: 'Wan 2.2 · Text → Video',
    kind: 't2v',
    sizes: VIDEO_SIZES,
    supportsNegativePrompt: true,
  },
  {
    id: 'Wan-AI/Wan2.2-I2V-A14B',
    label: 'Wan 2.2 · Image → Video',
    kind: 'i2v',
    sizes: VIDEO_SIZES,
    supportsNegativePrompt: true,
  },
]

export function findVideoModel(id) {
  return VIDEO_MODELS.find((m) => m.id === id)
}
