import { useCallback } from "react";
import { postApi } from "../services/postApi";
import { usePostStore } from "../store/usePostStore";

export function useInfiniteFeed() {
  const { items, page, hasMore, setFeed, appendFeed } = usePostStore();
  const load = useCallback(async (next, replace) => {
    const data = await postApi.feed(next);
    if (replace) setFeed(data.items, data.hasMore, next);
    else appendFeed(data.items, data.hasMore, next);
  }, [appendFeed, setFeed]);
  return { items, page, hasMore, load };
}
