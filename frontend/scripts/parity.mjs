// Runs the browser detector under Node on raw RGBA fixtures; prints JSON results.
// Usage: node scripts/parity.mjs <fixture-dir>   (driven by backend/web_parity.py)
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as ort from 'onnxruntime-web';
import { preprocess, postprocess } from '../src/utils/detector.js';

const dir = process.argv[2];
const pub = resolve(import.meta.dirname, '../public/model');
const meta = JSON.parse(readFileSync(join(pub, 'meta.json'), 'utf8'));
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(readFileSync(join(pub, 'best.onnx')));
const results = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const { width, height } = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const image = { data: readFileSync(join(dir, f.replace('.json', '.rgba'))), width, height };
  const pre = preprocess(image, meta.imgsz);
  const { output0 } = await session.run({ images: new ort.Tensor('float32', pre.tensor, [1, 3, meta.imgsz, meta.imgsz]) });
  results[f.replace('.json', '')] = postprocess(output0.data, output0.dims[2], output0.dims[1] - 4, pre, image, meta);
}
console.log(JSON.stringify(results));
