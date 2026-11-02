import { describe, expect, it } from "vitest";
import { parseYouTube } from "@/components/game/ambient";

describe("parseYouTube", () => {
  it("video bağlantılarını tanır", () => {
    expect(parseYouTube("https://www.youtube.com/watch?v=jfKfPfyJRdk")).toEqual({ videoId: "jfKfPfyJRdk" });
    expect(parseYouTube("youtu.be/jfKfPfyJRdk?si=abc")).toEqual({ videoId: "jfKfPfyJRdk" });
    expect(parseYouTube("https://m.youtube.com/live/jfKfPfyJRdk")).toEqual({ videoId: "jfKfPfyJRdk" });
    expect(parseYouTube("jfKfPfyJRdk")).toEqual({ videoId: "jfKfPfyJRdk" });
  });
  it("oynatma listesini tercih eder", () => {
    expect(parseYouTube("https://www.youtube.com/watch?v=jfKfPfyJRdk&list=PLabcdefghijkl123")).toEqual({ listId: "PLabcdefghijkl123" });
    expect(parseYouTube("https://music.youtube.com/playlist?list=PLabcdefghijkl123")).toEqual({ listId: "PLabcdefghijkl123" });
  });
  it("YouTube dışını reddeder", () => {
    expect(parseYouTube("https://example.com/watch?v=jfKfPfyJRdk")).toBeNull();
    expect(parseYouTube("merhaba")).toBeNull();
  });
});
