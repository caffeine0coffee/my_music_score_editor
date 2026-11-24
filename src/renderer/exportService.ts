import { jsPDF } from 'jspdf';
import type { Score } from '../types/score';
import {
  A4_SVG_HEIGHT,
  A4_SVG_WIDTH,
  renderScorePagesForPrint,
  renderScorePagesToCanvases,
  type ExportColorMode,
} from './printRenderer';

function sanitizeFileName(title: string): string {
  const cleaned = (title || 'score').trim().replace(/[\\/:*?"<>|]/g, '_');
  return cleaned || 'score';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Combine multiple A4 page SVGs into a single vertically stacked SVG element.
 */
function combinePagesToSingleSvg(pages: SVGSVGElement[]): SVGSVGElement {
  if (pages.length === 1) {
    return pages[0];
  }

  const totalHeight = A4_SVG_HEIGHT * pages.length;
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', String(A4_SVG_WIDTH));
  root.setAttribute('height', String(totalHeight));
  root.setAttribute('viewBox', `0 0 ${A4_SVG_WIDTH} ${totalHeight}`);

  pages.forEach((page, idx) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(0, ${idx * A4_SVG_HEIGHT})`);
    while (page.firstChild) {
      g.appendChild(page.firstChild);
    }
    root.appendChild(g);
  });

  return root;
}

/**
 * Export score as a multi-page A4 high-DPI (300dpi-class) PDF.
 * Uses VexFlow's Canvas backend so all SMuFL music glyphs (Bravura) and Japanese/CJK
 * header text render identically to the browser without missing glyphs or mojibake.
 */
export async function exportScoreToPdf(score: Score, colorMode: ExportColorMode): Promise<void> {
  const canvases = await renderScorePagesToCanvases(score, { colorMode, scale: 3 });
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  for (let i = 0; i < canvases.length; i++) {
    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }
    const dataUrl = canvases[i].toDataURL('image/png');
    pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
  }

  pdf.save(`${sanitizeFileName(score.title)}.pdf`);
}

/**
 * Export score as a vector SVG file (with embedded Bravura @font-face).
 */
export function exportScoreToSvg(score: Score, colorMode: ExportColorMode): void {
  const pages = renderScorePagesForPrint(score, { colorMode });
  const combined = combinePagesToSingleSvg(pages);
  const serializer = new XMLSerializer();
  const svgString = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(combined)}`;
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, `${sanitizeFileName(score.title)}.svg`);
}

/**
 * Export score as a high-resolution (2x) PNG image rendered natively via VexFlow Canvas.
 */
export async function exportScoreToPng(score: Score, colorMode: ExportColorMode): Promise<void> {
  const scale = 2;
  const canvases = await renderScorePagesToCanvases(score, { colorMode, scale });

  let finalCanvas: HTMLCanvasElement;
  if (canvases.length === 1) {
    finalCanvas = canvases[0];
  } else {
    finalCanvas = document.createElement('canvas');
    finalCanvas.width = A4_SVG_WIDTH * scale;
    finalCanvas.height = A4_SVG_HEIGHT * scale * canvases.length;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    canvases.forEach((c, idx) => {
      ctx.drawImage(c, 0, idx * A4_SVG_HEIGHT * scale);
    });
  }

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG'));
    }, 'image/png');
  });

  triggerDownload(pngBlob, `${sanitizeFileName(score.title)}.png`);
}
