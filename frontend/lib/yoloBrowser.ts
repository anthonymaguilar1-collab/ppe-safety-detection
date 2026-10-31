
import * as ort from 'onnxruntime-web';

// ─── Configuration ────────────────────────────────────────────────────────────

const MODEL_URL = '/models/best.onnx';
const INPUT_SIZE = 640;
const NUM_CLASSES = 11;
const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.70;
const MAX_DETECTIONS = 300;
const MAX_NMS_CANDIDATES = 30000;

const CLASS_NAMES = [
  'helmet',
  'gloves',
  'vest',
  'boots',
  'goggles',
  'none',
  'Person',
  'no_helmet',
  'no_goggle',
  'no_gloves',
  'no_boots',
];

const VIOLATION_CLASSES: Record<string, string[]> = {
  no_helmet: ['no_helmet', 'sin_casco', 'no-helmet'],
  no_vest: ['no_vest', 'sin_chaleco', 'no-vest'],
  no_gloves: ['no_gloves', 'sin_guantes', 'no-gloves'],
  no_boots: ['no_boots', 'sin_botas', 'no-boots'],
  no_goggles: [
    'no_goggle',
    'no_goggles',
    'sin_gafas',
    'sin_lentes',
    'no-goggle',
    'no-goggles',
  ],
};

const PPE_CLASSES: Record<string, string[]> = {
  helmet: ['helmet', 'hard_hat', 'casco', 'hardhat'],
  vest: ['vest', 'safety_vest', 'chaleco', 'reflective_vest'],
  gloves: ['gloves', 'guantes', 'glove'],
  boots: ['boots', 'botas', 'safety_boots'],
  mask: ['mask', 'mascarilla', 'face_mask'],
  goggles: ['goggles', 'goggle', 'gafas', 'safety_glasses', 'lentes'],
};

const PERSON_CLASSES = ['person', 'persona', 'worker', 'trabajador'];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrowserDetection {
  label: string;
  category: string;
  confidence: number;
  is_violation: boolean;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface BrowserDetectionResult {
  id: string;
  timestamp: string;
  image_width: number;
  image_height: number;
  persons_count: number;
  ppe_count: number;
  total_detections: number;
  detections: BrowserDetection[];
  missing_ppe: string[];
  compliance_rate: number;
  has_violations: boolean;
  annotated_url: string;
  inference_time_ms: number;
}

interface LetterboxInfo {
  scale: number;
  padX: number;
  padY: number;
  originalWidth: number;
  originalHeight: number;
}

interface Candidate {
  classId: number;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ─── Model session ────────────────────────────────────────────────────────────

let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }).catch((error) => {
      sessionPromise = null;

      throw new Error(
        `No se pudo cargar el modelo ONNX: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }

  return sessionPromise;
}

// ─── Image preprocessing ──────────────────────────────────────────────────────

// Equivalente al LetterBox de Ultralytics:
// new_shape=(640,640), auto=false, scale_fill=false,
// scaleup=true, center=true, padding_value=114.

function createLetterboxedInput(
  source: HTMLImageElement,
  canvas: HTMLCanvasElement
): { tensor: ort.Tensor; info: LetterboxInfo } {
  const originalWidth = source.naturalWidth;
  const originalHeight = source.naturalHeight;

  const scale = Math.min(
    INPUT_SIZE / originalWidth,
    INPUT_SIZE / originalHeight
  );

  const resizedWidth = Math.max(1, Math.round(originalWidth * scale));
  const resizedHeight = Math.max(1, Math.round(originalHeight * scale));

  const dw = INPUT_SIZE - resizedWidth;
  const dh = INPUT_SIZE - resizedHeight;

  // Ultralytics divide el padding entre ambos lados y aplica
  // round(d - 0.1) para calcular el margen superior e izquierdo.
  const padX = Math.round(dw / 2 - 0.1);
  const padY = Math.round(dh / 2 - 0.1);

  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;

  const ctx = canvas.getContext('2d', {
    willReadFrequently: true,
  });

  if (!ctx) {
    throw new Error('No se pudo crear el contexto del canvas.');
  }

  ctx.fillStyle = 'rgb(114, 114, 114)';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    source,
    0,
    0,
    originalWidth,
    originalHeight,
    padX,
    padY,
    resizedWidth,
    resizedHeight
  );

  const imageData = ctx.getImageData(
    0,
    0,
    INPUT_SIZE,
    INPUT_SIZE
  );

  const pixels = imageData.data;
  const planeSize = INPUT_SIZE * INPUT_SIZE;
  const tensorData = new Float32Array(3 * planeSize);

  // RGB, NCHW, float32, normalización [0,1].
  for (let i = 0; i < planeSize; i++) {
    tensorData[i] = pixels[i * 4] / 255;
    tensorData[planeSize + i] = pixels[i * 4 + 1] / 255;
    tensorData[2 * planeSize + i] = pixels[i * 4 + 2] / 255;
  }

  return {
    tensor: new ort.Tensor('float32', tensorData, [
      1,
      3,
      INPUT_SIZE,
      INPUT_SIZE,
    ]),
    info: {
      scale,
      padX,
      padY,
      originalWidth,
      originalHeight,
    },
  };
}

// ─── Detection classification ─────────────────────────────────────────────────

function classifyDetection(label: string): string {
  const normalized = label.toLowerCase().trim();

  for (const [category, aliases] of Object.entries(VIOLATION_CLASSES)) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return category;
    }
  }

  for (const [category, aliases] of Object.entries(PPE_CLASSES)) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return category;
    }
  }

  if (PERSON_CLASSES.some((person) => normalized.includes(person))) {
    return 'person';
  }

  return 'other';
}

// ─── Intersection over Union ──────────────────────────────────────────────────

function intersectionOverUnion(
  a: Candidate,
  b: Candidate
): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);

  const intersection =
    Math.max(0, x2 - x1) * Math.max(0, y2 - y1);

  const areaA =
    Math.max(0, a.x2 - a.x1) *
    Math.max(0, a.y2 - a.y1);

  const areaB =
    Math.max(0, b.x2 - b.x1) *
    Math.max(0, b.y2 - b.y1);

  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

// ─── Non-Maximum Suppression ──────────────────────────────────────────────────

function applyNMS(
  candidates: Candidate[],
  iouThreshold: number
): Candidate[] {
  // Ultralytics limita los candidatos antes de ejecutar NMS.
  const sorted = [...candidates]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_NMS_CANDIDATES);

  const selected: Candidate[] = [];

  while (
    sorted.length > 0 &&
    selected.length < MAX_DETECTIONS
  ) {
    const best = sorted.shift()!;

    selected.push(best);

    for (let i = sorted.length - 1; i >= 0; i--) {
      // NMS por clase: no suprime cajas de clases diferentes.
      if (
        sorted[i].classId === best.classId &&
        intersectionOverUnion(best, sorted[i]) > iouThreshold
      ) {
        sorted.splice(i, 1);
      }
    }
  }

  return selected;
}

// ─── Model output postprocessing ──────────────────────────────────────────────

function processOutput(
  output: ort.Tensor,
  info: LetterboxInfo,
  confidenceThreshold: number
): BrowserDetection[] {
  const dimensions = output.dims;

  if (
    dimensions.length !== 3 ||
    dimensions[0] !== 1 ||
    dimensions[1] !== NUM_CLASSES + 4
  ) {
    throw new Error(
      `Formato de salida ONNX inesperado: [${dimensions.join(', ')}]`
    );
  }

  const data = output.data as Float32Array;
  const numPredictions = dimensions[2];

  const candidates: Candidate[] = [];

  for (let i = 0; i < numPredictions; i++) {
    const x = data[i];
    const y = data[numPredictions + i];
    const width = data[2 * numPredictions + i];
    const height = data[3 * numPredictions + i];

    let bestClass = -1;
    let bestConfidence = 0;

    // multi_label=false: seleccionar únicamente la clase de mayor score.
    for (let c = 0; c < NUM_CLASSES; c++) {
      const score = data[(4 + c) * numPredictions + i];

      if (score > bestConfidence) {
        bestConfidence = score;
        bestClass = c;
      }
    }

    // Ultralytics utiliza comparación estricta >.
    if (
      bestClass < 0 ||
      bestConfidence <= confidenceThreshold
    ) {
      continue;
    }

    // Conversión de xywh a xyxy.
    candidates.push({
      classId: bestClass,
      confidence: bestConfidence,
      x1: x - width / 2,
      y1: y - height / 2,
      x2: x + width / 2,
      y2: y + height / 2,
    });
  }

  const selected = applyNMS(
    candidates,
    IOU_THRESHOLD
  );

  return selected.map((candidate) => {
    // Deshacer LetterBox y recuperar coordenadas originales.
    const x1 = Math.max(
      0,
      Math.min(
        info.originalWidth,
        (candidate.x1 - info.padX) / info.scale
      )
    );

    const y1 = Math.max(
      0,
      Math.min(
        info.originalHeight,
        (candidate.y1 - info.padY) / info.scale
      )
    );

    const x2 = Math.max(
      0,
      Math.min(
        info.originalWidth,
        (candidate.x2 - info.padX) / info.scale
      )
    );

    const y2 = Math.max(
      0,
      Math.min(
        info.originalHeight,
        (candidate.y2 - info.padY) / info.scale
      )
    );

    const label = CLASS_NAMES[candidate.classId];
    const category = classifyDetection(label);

    const normalizedLabel = label.toLowerCase();

    const isViolation =
      category.startsWith('no_') ||
      normalizedLabel.includes('no_') ||
      normalizedLabel.includes('sin_');

    return {
      label,
      category,
      confidence:
        Math.round(candidate.confidence * 1000) / 1000,
      is_violation: isViolation,
      bbox: {
        x1: Math.round(x1),
        y1: Math.round(y1),
        x2: Math.round(x2),
        y2: Math.round(y2),
      },
    };
  });
}

// ─── Compliance calculations ──────────────────────────────────────────────────

function calculateCompliance(
  detections: BrowserDetection[],
  personsCount: number,
  requiredPpe: string[]
): {
  missing: string[];
  hasViolations: boolean;
  rate: number;
} {
  const explicitViolations = detections.filter(
    (d) => d.is_violation
  ).length;

  if (personsCount === 0) {
    return {
      missing: [],
      hasViolations: explicitViolations > 0,
      rate: 100,
    };
  }

  const detectedCategories = new Set(
    detections
      .filter((d) => !d.is_violation)
      .map((d) => d.category)
  );

  const normalizedRequired = requiredPpe.map(
    (item) => item.trim().toLowerCase()
  );

  const missing = normalizedRequired.filter(
    (item) => item && !detectedCategories.has(item)
  );

  const hasViolations =
    explicitViolations > 0 || missing.length > 0;

  if (normalizedRequired.length === 0) {
    return {
      missing,
      hasViolations,
      rate: explicitViolations > 0 ? 0 : 100,
    };
  }

  const presentCount =
    normalizedRequired.length - missing.length;

  const baseRate =
    (presentCount / normalizedRequired.length) * 100;

  const rate = Math.round(
    Math.max(
      0,
      Math.min(100, baseRate - explicitViolations * 20)
    ) * 10
  ) / 10;

  return {
    missing,
    hasViolations,
    rate,
  };
}

// ─── Image annotation ─────────────────────────────────────────────────────────

function annotateImage(
  image: HTMLImageElement,
  detections: BrowserDetection[]
): string {
  const canvas = document.createElement('canvas');

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No se pudo crear la imagen anotada.');
  }

  ctx.drawImage(image, 0, 0);

  const scale = Math.max(
    1,
    Math.min(image.naturalWidth, image.naturalHeight) / 500
  );

  const fontSize = Math.max(
    12,
    Math.round(15 * scale)
  );

  const lineWidth = Math.max(
    2,
    Math.round(2 * scale)
  );

  for (const detection of detections) {
    const { x1, y1, x2, y2 } = detection.bbox;

    const color = detection.is_violation
      ? '#ef4444'
      : detection.category === 'person'
        ? '#0ea5e9'
        : '#10b981';

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.strokeRect(
      x1,
      y1,
      x2 - x1,
      y2 - y1
    );

    const text = `${detection.label} ${Math.round(
      detection.confidence * 100
    )}%`;

    ctx.font = `bold ${fontSize}px Arial`;

    const textWidth = ctx.measureText(text).width;
    const tagHeight = fontSize + 8;
    const tagY = Math.max(0, y1 - tagHeight);

    ctx.fillStyle = color;

    ctx.fillRect(
      x1,
      tagY,
      textWidth + 10,
      tagHeight
    );

    ctx.fillStyle = '#ffffff';

    ctx.fillText(
      text,
      x1 + 5,
      tagY + fontSize
    );
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}

// ─── Public image detection function ──────────────────────────────────────────

export async function detectImageBrowser(
  file: File,
  confidenceThreshold = CONFIDENCE_THRESHOLD,
  requiredPpe = ['helmet', 'vest', 'gloves']
): Promise<BrowserDetectionResult> {
  const startTime = performance.now();

  if (!file.type.startsWith('image/')) {
    throw new Error(
      'El archivo seleccionado no es una imagen.'
    );
  }

  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    image.src = imageUrl;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();

      image.onerror = () => reject(
        new Error(
          'No se pudo cargar la imagen seleccionada.'
        )
      );
    });

    const session = await getSession();

    const canvas = document.createElement('canvas');

    const { tensor, info } = createLetterboxedInput(
      image,
      canvas
    );

    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const results = await session.run({
      [inputName]: tensor,
    });

    const output = results[outputName];

    if (!output) {
      throw new Error(
        'El modelo no devolvió una salida válida.'
      );
    }

    const detections = processOutput(
      output,
      info,
      confidenceThreshold
    );

    const personsCount = detections.filter(
      (d) => d.category === 'person'
    ).length;

    const ppeCount = detections.filter(
      (d) =>
        d.category !== 'person' &&
        d.category !== 'other' &&
        !d.is_violation
    ).length;

    const compliance = calculateCompliance(
      detections,
      personsCount,
      requiredPpe
    );

    const annotatedUrl = annotateImage(
      image,
      detections
    );

    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),

      image_width: image.naturalWidth,
      image_height: image.naturalHeight,

      persons_count: personsCount,
      ppe_count: ppeCount,
      total_detections: detections.length,

      detections,

      missing_ppe: compliance.missing,
      compliance_rate: compliance.rate,
      has_violations: compliance.hasViolations,

      annotated_url: annotatedUrl,

      inference_time_ms: Math.round(
        performance.now() - startTime
      ),
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
