// Service Worker snippet for Web Share Target
// Intercepts POST to /compartilhar and stores files in IndexedDB

const DB_NAME = "share-target-db";
const STORE_NAME = "shared-files";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeFiles(files) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  // Clear previous shared files
  store.clear();
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    store.add({ name: file.name, type: file.type, data: buffer });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname === "/compartilhar" && event.request.method === "POST") {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const files = formData.getAll("files");
          
          if (files.length > 0) {
            await storeFiles(files);
          }
          
          // Redirect to the share target page (GET)
          return Response.redirect("/compartilhar", 303);
        } catch (e) {
          console.error("Share target error:", e);
          return Response.redirect("/compartilhar", 303);
        }
      })()
    );
  }
});
