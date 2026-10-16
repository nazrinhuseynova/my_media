import { useState } from "react";
import Button from "../../../components/ui/Button";
import { api } from "../../../services/api";
import { guestMessage } from "../services/authApi";
import { requestGoogleIdToken } from "../services/googleOAuth";

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    const found = document.getElementById(id);
    if (found?.getAttribute("data-ready") === "1") {
      resolve();
      return;
    }
    if (found) {
      found.addEventListener("load", () => resolve(), { once: true });
      found.addEventListener("error", () => reject(new Error("Couldn't load the sign-in script. Check your connection")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.setAttribute("data-ready", "1");
      resolve();
    };
    script.onerror = () => reject(new Error("Couldn't load the sign-in script. Check your connection"));
    document.body.appendChild(script);
  });
}

async function appleCredential(clientId) {
  await loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js", "pulse-apple-sdk");
  window.AppleID.auth.init({
    clientId,
    scope: "name email",
    redirectURI: window.location.origin,
    usePopup: true,
  });
  const data = await window.AppleID.auth.signIn();
  const token = data?.authorization?.id_token;
  if (!token) throw new Error("Apple sign-in didn't work");
  return token;
}

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
  if (kind === "apple") return data?.appleClientId;
  return data?.facebookAppId;
}

function missingText(kind) {
  if (kind === "google") return "Google sign-in isn't available right now";
  if (kind === "apple") return "Apple sign-in isn't available right now";
  return "Facebook sign-in isn't available right now";
}

function failedText(kind) {
  if (kind === "google") return "Google sign-in didn't work";
  if (kind === "apple") return "Apple sign-in didn't work";
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
        : kind === "apple"
          ? await appleCredential(clientId)
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
        <Button className="auth-provider" variant="ghost" type="button" disabled={busy || !!pending} onClick={() => start("apple")}>
          {pending === "apple" ? "Opening Apple..." : "Continue with Apple"}
        </Button>
      </div>
    </>
  );
}
