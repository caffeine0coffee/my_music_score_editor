import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import type { Score } from '../types/score';
import {
  A4_SVG_HEIGHT,
  A4_SVG_WIDTH,
  renderScorePagesForPrint,
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
 * Export score as a multi-page A4 vector PDF using jsPDF + svg2pdf.js.
 */
export async function exportScoreToPdf(score: Score, colorMode: ExportColorMode): Promise<void> {
  const pages = renderScorePagesForPrint(score, { colorMode });
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }
    await svg2pdf(pages[i], pdf, {
      x: 0,
      y: 0,
      width: 210,
      height: 297,
    });
  }

  pdf.save(`${sanitizeFileName(score.title)}.pdf`);
}

/**
 * Export score as a vector SVG file.
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
 * Export score as a high-resolution (2x) PNG image.
 */
export async function exportScoreToPng(score: Score, colorMode: ExportColorMode): Promise<void> {
  const pages = renderScorePagesForPrint(score, { colorMode });
  const combined = combinePagesToSingleSvg(pages);
  const totalHeight = A4_SVG_HEIGHT * pages.length;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(combined);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
      image.src = url;
    });

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = A4_SVG_WIDTH * scale;
    canvas.height = totalHeight * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, A4_SVG_WIDTH, totalHeight);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode PNG'));
      }, 'image/png');
    });

    triggerDownload(pngBlob, `${sanitizeFileName(score.title)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
