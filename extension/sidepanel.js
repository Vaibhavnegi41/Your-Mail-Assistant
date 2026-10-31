// Check if the frontend server is reachable on port 3000 or 3001
const frame = document.getElementById('app-frame');
const fallback = document.getElementById('fallback');
const retryBtn = document.getElementById('retry-btn');

async function detectServer() {
  const ports = [3000, 3001];
  for (const port of ports) {
    try {
      await fetch(`http://localhost:${port}`, { method: 'HEAD', mode: 'no-cors' });
      return `http://localhost:${port}`;
    } catch (err) {}
  }
  return null;
}

async function checkServer() {
  const activeUrl = await detectServer();
  if (activeUrl && frame && fallback) {
    frame.style.display = 'block';
    fallback.style.display = 'none';
    if (!frame.src || frame.src === 'about:blank' || !frame.src.startsWith(activeUrl)) {
      frame.src = activeUrl;
    }
  } else if (!activeUrl && frame && fallback) {
    frame.style.display = 'none';
    fallback.style.display = 'flex';
  }
}

if (retryBtn) {
  retryBtn.addEventListener('click', async () => {
    const activeUrl = (await detectServer()) || 'http://localhost:3000';
    if (frame) frame.src = activeUrl;
    checkServer();
  });
}

checkServer();
