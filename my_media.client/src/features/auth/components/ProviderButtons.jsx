import { useState } from "react";
import Button from "../../../components/ui/Button";
import { api } from "../../../services/api";
import { guestMessage } from "../services/authApi";
import { requestGoogleIdToken } from "../services/googleOAuth";

let facebookReady = null;

function prepareFacebook(appId) {
  if (window.FB) {
    window.FB.init({ appId, cookie: false, xfbml: false, version: "v21.0" });
    return Promise.resolve();
  }
  if (facebookReady) return facebookReady;
  facebookReady = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: false, xfbml: false, version: "v21.0" });
      resolve();
    };
    const script = document.createElement("script");
    script.id = "pulse-facebook-sdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      facebookReady = null;
      reject(new Error("Couldn't load the sign-in script. Check your connection"));
    };
    document.body.appendChild(script);
  });
  return facebookReady;
}

function facebookCredential(appId) {
  return prepareFacebook(appId).then(() => new Promise((resolve, reject) => {
    window.FB.login((response) => {
      const token = response?.authResponse?.accessToken;
      if (token) resolve(token);
      else reject(new Error("cancelled"));
    }, { scope: "email,public_profile" });
  }));
}

function cancelled(err) {
  const text = `${err?.error || ""} ${err?.message || ""}`;
  return /cancelled|popup_closed|user_cancelled/i.test(text);
}

function providerId(data, kind) {
  if (kind === "google") return data?.googleClientId;
  return data?.facebookAppId;
}

function missingText(kind) {
  if (kind === "google") return "Google sign-in isn't available right now";
  return "Facebook sign-in isn't available right now";
}

function failedText(kind) {
  if (kind === "google") return "Google sign-in didn't work";
  return "Facebook sign-in didn't work";
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
      const token = kind === "google"
        ? await requestGoogleIdToken(clientId)
        : await facebookCredential(clientId);
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
        <Button className="auth-provider" variant="ghost" type="button" disabled={busy || !!pending} onClick={() => start("facebook")}>
          {pending === "facebook" ? "Opening Facebook..." : "Continue with Facebook"}
        </Button>
        <Button className="auth-provider" variant="ghost" type="button" disabled={busy || !!pending} onClick={() => start("google")}>
          {pending === "google" ? "Opening Google..." : "Continue with Google"}
        </Button>
      </div>
    </>
  );
}
