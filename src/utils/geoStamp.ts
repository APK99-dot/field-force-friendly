/**
 * Burn a location + timestamp caption into a photo.
 *
 * Activity photos already carried lat/lng/address/at as database columns, but
 * that only travels with the record. Once a photo is downloaded, forwarded to a
 * client, or pasted into a report it is just an image, and the proof of where
 * and when it was taken is gone. Drawing the caption into the pixels keeps it
 * attached to the picture.
 *
 * Never throws in a way that costs the user their photo — the caller uploads
 * the unstamped image if this fails.
 */

export interface GeoStampInfo {
  at: Date;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** "11/08/2026 · 04:47 PM" — same dd/mm/yyyy the rest of the app uses. */
function formatStamp(at: Date): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const h24 = at.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return (
    `${p2(at.getDate())}/${p2(at.getMonth() + 1)}/${at.getFullYear()}` +
    ` · ${p2(h12)}:${p2(at.getMinutes())} ${ampm}`
  );
}

/** Greedy word wrap, capped at maxLines with an ellipsis on the last one. */
function wrap(
  ctx: CanvasRenderingContext2D,
  textValue: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = textValue.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);

  // Trim the final line character by character until the ellipsis fits.
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth) {
      let t = last;
      while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
        t = t.slice(0, -1);
      }
      lines[maxLines - 1] = `${t}…`;
    }
  }
  return lines;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image for stamping"));
    };
    img.src = url;
  });
}

export async function stampGeo(blob: Blob, info: GeoStampInfo): Promise<Blob> {
  const img = await loadImage(blob);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("Image has no dimensions");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(img, 0, 0, w, h);

  // Scale everything off the image width so the caption reads the same on a
  // 1280px upload as on a small one. Kept deliberately tight — a long
  // Nominatim address runs to four lines, and at any larger size the band ate
  // a quarter of the photo.
  const base = Math.max(11, Math.round(w * 0.022));
  const pad = Math.round(base * 0.6);
  const lineGap = Math.round(base * 0.34);
  const maxTextW = w - pad * 2;

  const timeLine = formatStamp(info.at);
  const coordLine =
    info.lat != null && info.lng != null
      ? `${info.lat.toFixed(5)}, ${info.lng.toFixed(5)}`
      : null;

  ctx.font = `${base}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const addressLines = info.address ? wrap(ctx, info.address, maxTextW, 2) : [];

  // Height of the caption block: the time line, the address, then coordinates.
  const rows = 1 + addressLines.length + (coordLine ? 1 : 0);
  const bandH = pad * 2 + rows * base + (rows - 1) * lineGap;
  const bandY = h - bandH;

  // A flat panel rather than a gradient: it stays legible over a blown-out sky
  // or a dark interior, both of which show up on a construction site. The
  // shadow underneath the text is belt and braces for the bright case, where
  // the panel alone leaves the smaller coordinate line looking washed out.
  ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
  ctx.fillRect(0, bandY, w, bandH);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = Math.max(2, Math.round(base * 0.18));
  let y = bandY + pad;

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${base}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(timeLine, pad, y);
  y += base + lineGap;

  ctx.font = `${base}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  for (const line of addressLines) {
    ctx.fillText(line, pad, y);
    y += base + lineGap;
  }

  if (coordLine) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.font = `${Math.round(base * 0.85)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(coordLine, pad, y);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error("Stamped encode failed"))),
      "image/jpeg",
      // Higher than the compression pass that precedes this: the caption is
      // fine text on a flat panel, which is exactly what low JPEG quality
      // smears. The image itself is already downscaled, so the cost is small.
      0.85,
    );
  });
}
