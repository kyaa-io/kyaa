import { getGPUTier, type ModelEntry } from "detect-gpu";

/** detect-gpu's benchmark tables, bundled as lazy chunks (one per GPU family) instead of the unpkg default the CSP would block. */
const benchmarks: Record<string, () => Promise<{ default: unknown }>> = {
  "d-adreno.json": () => import("detect-gpu/dist/benchmarks/d-adreno.json"),
  "d-amd.json": () => import("detect-gpu/dist/benchmarks/d-amd.json"),
  "d-apple.json": () => import("detect-gpu/dist/benchmarks/d-apple.json"),
  "d-geforce.json": () => import("detect-gpu/dist/benchmarks/d-geforce.json"),
  "d-intel.json": () => import("detect-gpu/dist/benchmarks/d-intel.json"),
  "d-nvidia.json": () => import("detect-gpu/dist/benchmarks/d-nvidia.json"),
  "d-radeon.json": () => import("detect-gpu/dist/benchmarks/d-radeon.json"),
  "m-adreno.json": () => import("detect-gpu/dist/benchmarks/m-adreno.json"),
  "m-apple-ipad.json": () => import("detect-gpu/dist/benchmarks/m-apple-ipad.json"),
  "m-apple.json": () => import("detect-gpu/dist/benchmarks/m-apple.json"),
  "m-intel.json": () => import("detect-gpu/dist/benchmarks/m-intel.json"),
  "m-mali-t.json": () => import("detect-gpu/dist/benchmarks/m-mali-t.json"),
  "m-mali.json": () => import("detect-gpu/dist/benchmarks/m-mali.json"),
  "m-nvidia.json": () => import("detect-gpu/dist/benchmarks/m-nvidia.json"),
  "m-powervr.json": () => import("detect-gpu/dist/benchmarks/m-powervr.json"),
  "m-samsung.json": () => import("detect-gpu/dist/benchmarks/m-samsung.json"),
};

/** True when the 3D machine may run: WebGL 2 exists (dev notes 5) and the GPU is above detect-gpu tier 0 (dev notes 4). */
export async function canRunCapsuleMachine() {
  let gl: WebGL2RenderingContext | null = null;
  try { gl = document.createElement("canvas").getContext("webgl2"); } catch { gl = null; }
  if (!gl) return false;
  try {
    const result = await getGPUTier({
      glContext: gl,
      override: {
        loadBenchmarks: async (file) => {
          const load = benchmarks[file];
          if (!load) throw new Error(`CAPSULE_GPU_TABLE_MISSING:${file}`);
          const table = (await load()).default as unknown[];
          return table.slice(1) as ModelEntry[]; // the first entry is the table's version
        },
      },
    });
    return result.tier > 0;
  } catch {
    return true; // only a measured tier 0 falls back; an unreadable table keeps the 3D machine
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
