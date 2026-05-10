import { ContractAnalysis, FileData } from "../types";

/**
 * In dev, prefer same-origin `/api` (Vite proxy → FastAPI) so CORS is never an issue.
 * Override with VITE_API_URL when the UI talks to a remote API.
 */
const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  (import.meta.env.DEV ? "" : "http://127.0.0.1:8000");

function apiPath(path: string): string {
  const base = API_BASE;
  if (!base) return `/api${path}`;
  return `${base}${path}`;
}

/** Parse FastAPI / Starlette error bodies into a single message. */
async function readApiError(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const raw = (await res.json()) as {
        detail?: unknown;
        message?: string;
      };
      const d = raw?.detail;
      if (typeof d === "string" && d.trim()) return d.trim();
      if (Array.isArray(d)) {
        const parts = d
          .map((x: unknown) => {
            if (typeof x === "string") return x;
            if (x && typeof x === "object" && "msg" in x) {
              const o = x as { msg?: string; loc?: unknown[] };
              const loc = Array.isArray(o.loc) ? o.loc.filter(Boolean).join(".") : "";
              return [loc, o.msg].filter(Boolean).join(": ");
            }
            return "";
          })
          .filter(Boolean);
        if (parts.length) return parts.join("; ");
      }
      if (typeof raw?.message === "string" && raw.message.trim()) {
        return raw.message.trim();
      }
      // Google Generative Language API shape (e.g. if a proxy returns it)
      const nested = raw as { error?: { message?: string } };
      if (typeof nested?.error?.message === "string" && nested.error.message.trim()) {
        return nested.error.message.trim();
      }
    }
  } catch {
    /* fall through */
  }
  const text = await res.text().catch(() => "");
  const trimmed = text.trim();
  if (trimmed && trimmed.length < 2000) return trimmed;
  return `HTTP ${res.status} ${res.statusText}`;
}

/**
 * Upload PDF to RAG backend: chunking, embeddings, FAISS, grounded analysis.
 */
export async function analyzeContract(file: FileData): Promise<ContractAnalysis> {
  const fd = new FormData();
  if (file.file) {
    fd.append("file", file.file, file.name);
  } else {
    const bin = atob(file.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: file.type || "application/pdf",
    });
    fd.append("file", blob, file.name);
  }

  const res = await fetch(apiPath("/upload"), {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  const raw = (await res.json()) as Record<string, unknown>;

  if (raw.status === "rejected") {
    return {
      status: "rejected",
      reason: raw.reason as string | undefined,
      supported_inputs: raw.supported_inputs as string[] | undefined,
      next_step: raw.next_step as string | undefined,
    };
  }

  const analysis = raw.analysis as ContractAnalysis;
  return {
    ...analysis,
    status: "approved",
    session_id: raw.session_id as string,
  };
}

export async function askContract(
  sessionId: string,
  question: string
): Promise<string> {
  const res = await fetch(apiPath("/ask"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, question }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const raw = (await res.json()) as { answer?: string };
  return raw.answer as string;
}
