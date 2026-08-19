// Zero-shot label set for auto-tagging. CLIP scores an image against
// each phrase and the best few become tags.
//
// These live in their own field (`autoTags`), never merged into `tags`:
// a guess must not quietly overwrite something a person typed.
export const AUTO_TAGS = [
  ['brutalist', 'a brutalist design with heavy concrete forms'],
  ['minimal', 'a minimal design with lots of white space'],
  ['maximalist', 'a busy maximalist layout packed with elements'],
  ['typography', 'a design dominated by large expressive typography'],
  ['serif', 'text set in a serif typeface'],
  ['sans-serif', 'text set in a clean sans-serif typeface'],
  ['editorial', 'an editorial magazine spread'],
  ['poster', 'a printed poster'],
  ['packaging', 'product packaging design'],
  ['branding', 'a brand identity with a logo'],
  ['dark-ui', 'a dark mode user interface'],
  ['light-ui', 'a light user interface with white background'],
  ['dashboard', 'a data dashboard with charts'],
  ['mobile', 'a mobile phone app screen'],
  ['landing-page', 'a website landing page'],
  ['illustration', 'a hand drawn illustration'],
  ['3d', 'a three dimensional render'],
  ['photography', 'a photograph of a real scene'],
  ['gradient', 'a smooth colour gradient'],
  ['grid', 'a strict grid based layout'],
  ['collage', 'a cut and paste collage'],
  ['motion', 'a frame from a motion graphics animation'],
  ['architecture', 'a photograph of a building'],
  ['nature', 'a natural landscape'],
  ['portrait', 'a portrait of a person'],
  ['texture', 'a close up texture or material'],
  ['monochrome', 'a black and white composition'],
  ['colourful', 'a highly saturated colourful composition'],
  ['retro', 'a vintage retro design from decades past'],
  ['futuristic', 'a futuristic sci-fi aesthetic'],
]
