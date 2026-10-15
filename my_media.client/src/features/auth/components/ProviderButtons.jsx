import { useState } from "react";
import Button from "../../../components/ui/Button";
import { api } from "../../../services/api";

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    const found = document.getElementById(id);
    if (found?.getAttribute("data-ready") === "1") {
      resolve();
      return;
    }
    if (found) {
      found.addEventListener("load", () => resolve(), { once: true });
      found.addEventListener("error", () => reject(new Error("Skript yüklənmədi")), { once: true });
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
    script.onerror = () => reject(new Error("Skript yüklənmədi"));
    document.body.appendChild(script);
  });
}

function googleCredential(clientId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (ok, value) => {
      if (settled) return;
      settled = true;
      if (ok) resolve(value);
      else reject(value);
    };
    window.google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: "popup",
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response) => {
        if (response?.credential) done(true, response.credential);
        else done(false, new Error("Google token gəlmədi"));
      },
    });
    window.google.accounts.id.prompt((note) => {
      if (settled) return;
      const skipped = note.isNotDisplayed() || note.isSkippedMoment();
      if (!skipped) return;
      const holder = document.createElement("div");
      holder.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden";
      document.body.appendChild(holder);
      window.google.accounts.id.renderButton(holder, { type: "standard", size: "large", theme: "outline" });
      window.setTimeout(() => {
        const inner = holder.querySelector("[role='button']");
        if (!inner) {
          holder.remove();
          done(false, new Error("Google pəncərəsi açılmadı"));
          return;
        }
        const onFocus = () => {
          window.setTimeout(() => {
            window.removeEventListener("focus", onFocus);
            holder.remove();
            if (!settled) done(false, new Error("cancelled"));
          }, 500);
        };
        window.addEventListener("focus", onFocus);
        inner.click();
      }, 40);
    });
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
  if (!token) throw new Error("Apple token gəlmədi");
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
      reject(new Error("Skript yüklənmədi"));
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
      if (kind === "google") {
        await loadScript("https://accounts.google.com/gsi/client", "pulse-google-sdk");
      }
      const token = kind === "google"
        ? await googleCredential(clientId)
        : kind === "apple"
          ? await appleCredential(clientId)
          : await facebookCredential(clientId);
      await onToken(kind, token);
    } catch (err) {
      if (!cancelled(err)) onError(err?.message || failedText(kind));
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
