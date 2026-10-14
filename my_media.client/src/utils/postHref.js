export function postHref(post) {
  const key = post?.slug || post?.id;
  return key ? `/p/${key}` : "/";
}
