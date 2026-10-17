import { useState } from "react";
import Button from "../../../components/ui/Button";
import { api } from "../../../services/api";
import { guestMessage } from "../services/authApi";
import { requestGoogleIdToken } from "../services/googleOAuth";

function oauthRedirectUri() {
  return `${window.location.origin}/oauth-callback.html`;
}

function popupOAuthCode(url, provider) {
  return new Promise((resolve, reject) => {
    const popup = window.open(url, "pulse-oauth", "width=520,height=700,menubar=no,toolbar=no");
    if (!popup) {
      reject(new Error("cancelled"));
      return;
    }
    let settled = false;
    let closeAt = 0;
    function done(err, code) {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
      try { popup.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(code);
    }
    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== "pulse-oauth" || data.provider !== provider) return;
      if (data.error || !data.code) done(new Error("cancelled"));
      else done(null, data.code);
    }
    window.addEventListener("message", onMessage);
    const timer = setInterval(() => {
      if (!popup.closed) return;
      if (!closeAt) closeAt = Date.now();
      // Wait briefly so postMessage from the callback page can arrive before we treat close as cancel.
      if (Date.now() - closeAt > 800) done(new Error("cancelled"));
    }, 200);
  });
}

function githubCredential(clientId) {
  const redirectUri = oauthRedirectUri();
  const state = `github.${crypto.randomUUID().replace(/-/g, "")}`;
  const url = "https://github.com/login/oauth/authorize"
    + `?client_id=${encodeURIComponent(clientId)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + "&scope=user:email"
    + `&state=${encodeURIComponent(state)}`;
  return popupOAuthCode(url, "github");
}

function cancelled(err) {
  const text = `${err?.error || ""} ${err?.message || ""}`;
  return /cancelled|popup_closed|user_cancelled/i.test(text);
}

function providerId(data, kind) {
  if (kind === "google") return data?.googleClientId;
  return data?.githubClientId;
}

function missingText(kind) {
  if (kind === "google") return "Google sign-in isn't available right now";
  return "GitHub sign-in isn't available right now";
}

function failedText(kind) {
  if (kind === "google") return "Google sign-in didn't work";
  return "GitHub sign-in didn't work";
}

async function credentialFor(kind, clientId) {
  if (kind === "google") return requestGoogleIdToken(clientId);
  return githubCredential(clientId);
}

export default function ProviderButtons({ busy, divider, onToken, onError }) {
  const [pending, setPending] = useState("");

  async function start(kind) {
    if (busy || pending) return;
    setPending(kind);
    onError("");
    try {
      const data = await api.get("/api/auth/providers");
      const clientId = providerId(data, kind);
      if (!clientId) {
        onError(missingText(kind));
        return;
      }
      const token = await credentialFor(kind, clientId);
      await onToken(kind, token);
    } catch (err) {
      if (cancelled(err)) return;
      const message = guestMessage(err, failedText(kind));
      if (message) onError(message);
    } finally {
      setPending("");
    }
  }

  return (
    <>
      {divider ? <div className="auth-or"><span>or</span></div> : null}
      <div className="auth-providers">
        <Button className="auth-provider" variant="ghost" type="button" disabled={busy || !!pending} onClick={() => start("google")}>
          {pending === "google" ? "Opening Google..." : "Continue with Google"}
        </Button>
        <Button className="auth-provider" variant="ghost" type="button" disabled={busy || !!pending} onClick={() => start("github")}>
          {pending === "github" ? "Opening GitHub..." : "Continue with GitHub"}
        </Button>
      </div>
    </>
  );
}
