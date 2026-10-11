import http from "../lib/axios";

export const api = {
  get: (url, config) => http.get(url, config).then((r) => r.data),
  post: (url, body, config) => http.post(url, body, config).then((r) => r.data),
  patch: (url, body, config) => http.patch(url, body, config).then((r) => r.data),
  put: (url, body, config) => http.put(url, body, config).then((r) => r.data),
  delete: (url, config) => http.delete(url, config).then((r) => r.data),
};
