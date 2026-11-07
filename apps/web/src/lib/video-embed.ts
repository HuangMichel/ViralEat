/** Build embed URLs only from canonical, allowlisted publication URLs. */
export function videoEmbedUrl(value: string | null): { url: string; platform: string } | null {
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (host === "instagram.com" || host === "www.instagram.com") {
    const match = url.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)\/?$/);
    if (match) return { platform: "Instagram", url: `https://www.instagram.com/${match[1]}/${match[2]}/embed/` };
  }
  if (host === "www.tiktok.com" || host === "tiktok.com") {
    const match = url.pathname.match(/^\/@[A-Za-z0-9._]+\/video\/(\d+)\/?$/);
    if (match) return { platform: "TikTok", url: `https://www.tiktok.com/player/v1/${match[1]}?autoplay=0` };
  }
  if (host === "www.youtube.com" || host === "youtube.com" || host === "youtu.be") {
    const id = host === "youtu.be" ? url.pathname.slice(1) : url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)\/?$/)?.[1];
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return { platform: "YouTube", url: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  return null;
}
