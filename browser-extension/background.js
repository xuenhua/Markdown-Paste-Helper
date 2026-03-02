/**
 * Background Service Worker
 * Handles cross-origin image fetching for content scripts.
 * Extensions bypass CORS restrictions in the background context.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "fetch-image") {
    fetchImageAsBase64(message.url)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ success: false, error: err.message }),
      );
    return true; // Keep channel open for async response
  }
});

async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const blob = await response.blob();
    const mimeType = blob.type || "image/png";

    // Convert blob to base64 (can't send Blob through message passing)
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    return { success: true, base64, mimeType };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
