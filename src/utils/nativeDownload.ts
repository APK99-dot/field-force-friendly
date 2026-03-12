import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { toast } from 'sonner';

/**
 * Universal file download that works in both web browsers and Android APK WebView.
 * On native (Android), saves to the Downloads directory using Capacitor Filesystem.
 * On web, uses the standard blob/anchor download approach.
 */
export async function downloadFile(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      // Convert blob to base64
      const base64 = await blobToBase64(blob);

      // Try to request permissions first (Android 10 and below need WRITE_EXTERNAL_STORAGE)
      try {
        await Filesystem.requestPermissions();
      } catch {
        // On Android 11+ scoped storage, permissions may not be needed
      }

      // Write file to Downloads directory
      const result = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      });

      console.log('File saved to:', result.uri);
      toast.success(`Downloaded: ${filename}`);
    } catch (err: any) {
      console.error('Native download error:', err);

      // Fallback: try external directory
      try {
        const base64 = await blobToBase64(blob);
        await Filesystem.writeFile({
          path: `Download/${filename}`,
          data: base64,
          directory: Directory.ExternalStorage,
          recursive: true,
        });
        toast.success(`Downloaded: ${filename}`);
      } catch (fallbackErr) {
        console.error('Fallback download error:', fallbackErr);
        // Last resort: try web download
        webDownload(blob, filename);
      }
    }
  } else {
    webDownload(blob, filename);
  }
}

function webDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove the data:...;base64, prefix
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper to download XLSX workbook on both web and native.
 * Call this instead of XLSX.writeFile().
 */
export async function downloadXLSX(wb: any, filename: string): Promise<void> {
  // Use static import - xlsx is already statically imported by consumers
  const XLSX = await import('xlsx');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await downloadFile(blob, filename);
}

/**
 * Helper to download jsPDF document on both web and native.
 * Call this instead of doc.save().
 */
export async function downloadPDF(doc: any, filename: string): Promise<void> {
  const blob = doc.output('blob');
  await downloadFile(blob, filename);
}

/**
 * Helper to download CSV data on both web and native.
 */
export async function downloadCSVNative(data: Record<string, any>[], filename: string): Promise<void> {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }).join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  await downloadFile(blob, filename);
}

/**
 * Download raw CSV string on both web and native.
 */
export async function downloadCSVString(csvContent: string, filename: string): Promise<void> {
  const blob = new Blob([csvContent], { type: 'text/csv' });
  await downloadFile(blob, filename);
}
