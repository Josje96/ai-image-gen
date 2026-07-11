// Known SiliconFlow image models and the image sizes they support.
//
// This list is a convenience — you can always type any model id in the UI.
// Sizes are the officially documented options; when a model has no fixed
// list we fall back to COMMON_SIZES.

// Kolors and SD 3.5 accept a fixed enum of sizes (~1024px range).
const ENUM_SIZES = ['1024x1024', '960x1280', '768x1024', '720x1440', '720x1280']

// FLUX and Qwen accept flexible dimensions, so we can offer true 16:9 HD
// (1920x1080 / 1080x1920) alongside the standard presets. Verified working
// against the API. The "custom" field in the UI accepts anything else.
export const FLEX_SIZES = [
  '1024x1024',
  '1280x720',
  '1920x1080',
  '720x1280',
  '1080x1920',
  '960x1280',
  '768x1024',
]

export const COMMON_SIZES = FLEX_SIZES

export const MODELS = [
  {
    id: 'Kwai-Kolors/Kolors',
    label: 'Kolors (Kwai)',
    sizes: ENUM_SIZES,
    supportsNegativePrompt: true,
    defaultSteps: 25,
    defaultGuidance: 7.5,
  },
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    label: 'FLUX.1 schnell (fast)',
    sizes: FLEX_SIZES,
    supportsNegativePrompt: false,
    defaultSteps: 4,
    defaultGuidance: null,
  },
  {
    id: 'black-forest-labs/FLUX.1-dev',
    label: 'FLUX.1 dev',
    sizes: FLEX_SIZES,
    supportsNegativePrompt: false,
    defaultSteps: 20,
    defaultGuidance: null,
  },
  {
    id: 'Qwen/Qwen-Image',
    label: 'Qwen-Image',
    sizes: FLEX_SIZES,
    supportsNegativePrompt: true,
    defaultSteps: 20,
    defaultGuidance: 4,
  },
  {
    id: 'stabilityai/stable-diffusion-3-5-large',
    label: 'Stable Diffusion 3.5 Large',
    sizes: ENUM_SIZES,
    supportsNegativePrompt: true,
    defaultSteps: 28,
    defaultGuidance: 4.5,
  },
]

export function findModel(id) {
  return MODELS.find((m) => m.id === id)
}
