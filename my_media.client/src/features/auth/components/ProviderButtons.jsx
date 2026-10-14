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

function cancelled(err) {
  const text = `${err?.error || ""} ${err?.message || ""}`;
  return /cancelled|popup_closed|user_cancelled/i.test(text);
}

export default function ProviderButtons({ busy, divider, onToken, onError }) {
  const [pending, setPending] = useState("");

  async function start(kind) {
    if (busy || pending) return;
    setPending(kind);
    onError("");
    try {
      const data = await api.get("/api/auth/providers");
      const clientId = kind === "google" ? data?.googleClientId : data?.appleClientId;
      if (!clientId) {
        onError(kind === "google" ? "Google ClientId appsettings-də boşdur" : "Apple ClientId appsettings-də boşdur");
        return;
      }
      if (kind === "google") {
        await loadScript("https://accounts.google.com/gsi/client", "pulse-google-sdk");
      }
      const token = kind === "google" ? await googleCredential(clientId) : await appleCredential(clientId);
      await onToken(kind, token);
    } catch (err) {
      if (!cancelled(err)) onError(err?.message || (kind === "google" ? "Google ilə daxil olmaq alınmadı" : "Apple ilə daxil olmaq alınmadı"));
    } finally {
      setPending("");
    }
  }

  return (
    <>
      {divider ? <div className="auth-or"><span>və ya</span></div> : null}
      <div className="auth-providers">
        <Button className="auth-provider" variant="ghost" type="button" disabled={busy || !!pending} onClick={() => start("google")}>
          {pending === "google" ? "Google açılır..." : "Google ilə daxil ol"}
        </Button>
        <Button className="auth-provider" variant="ghost" type="button" disabled={busy || !!pending} onClick={() => start("apple")}>
          {pending === "apple" ? "Apple açılır..." : "Apple ilə daxil ol"}
        </Button>
      </div>
    </>
  );
}
