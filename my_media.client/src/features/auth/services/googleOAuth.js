const PENDING_KEY = "pulse_google_pending";
const TOKEN_KEY = "pulse_google_id_token";
const ERROR_KEY = "pulse_google_error";

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const id = "pulse-google-gis";
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
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      script.setAttribute("data-ready", "1");
      resolve();
    };
    script.onerror = () => reject(new Error("Couldn't load the sign-in script. Check your connection"));
    document.body.appendChild(script);
  });
}

/**
 * Google ID token via GIS (Authorized JavaScript origins only — no redirect_uri).
 * Shows the official Google button so the account picker can open.
 */
export async function requestGoogleIdToken(clientId) {
  await loadGis();
  return new Promise((resolve, reject) => {
    let settled = false;
    const host = document.createElement("div");
    host.setAttribute("data-pulse-google", "1");
    Object.assign(host.style, {
      position: "fixed",
      inset: "0",
      zIndex: "100000",
      background: "rgba(0,0,0,.45)",
      display: "grid",
      placeItems: "center",
      padding: "16px",
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      background: "#fff",
      color: "#111",
      padding: "20px 22px",
      borderRadius: "12px",
      textAlign: "center",
      maxWidth: "320px",
      width: "100%",
      boxShadow: "0 12px 40px rgba(0,0,0,.25)",
    });

    const title = document.createElement("p");
    title.textContent = "Continue with Google";
    Object.assign(title.style, { margin: "0 0 14px", fontSize: "15px", fontWeight: "600" });
    panel.appendChild(title);

    const btnWrap = document.createElement("div");
    btnWrap.style.display = "flex";
    btnWrap.style.justifyContent = "center";
    panel.appendChild(btnWrap);

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    Object.assign(cancel.style, {
      marginTop: "14px",
      border: "0",
      background: "transparent",
      color: "#555",
      cursor: "pointer",
      fontSize: "13px",
    });
    panel.appendChild(cancel);
    host.appendChild(panel);
    document.body.appendChild(host);

    function finish(err, token) {
      if (settled) return;
      settled = true;
      host.remove();
      if (err) reject(err);
      else resolve(token);
    }

    cancel.onclick = () => finish(new Error("cancelled"));
    host.addEventListener("click", (e) => {
      if (e.target === host) finish(new Error("cancelled"));
    });

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response?.credential) finish(null, response.credential);
        else finish(new Error("Google sign-in didn't work"));
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.renderButton(btnWrap, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: 280,
    });
  });
}

/** Call as early as possible so intro routing cannot drop the hash (legacy redirect flow). */
export function captureGoogleRedirect() {
  const hash = (window.location.hash || "").replace(/^#/, "");
  if (!hash || (!hash.includes("id_token=") && !hash.includes("error="))) return;

  const params = new URLSearchParams(hash);
  const idToken = params.get("id_token");
  const error = params.get("error");
  const path = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", path || "/login");
  sessionStorage.removeItem(PENDING_KEY);

  if (error) {
    sessionStorage.setItem(ERROR_KEY, error);
    sessionStorage.removeItem(TOKEN_KEY);
    return;
  }
  if (idToken) {
    sessionStorage.setItem(TOKEN_KEY, idToken);
    sessionStorage.removeItem(ERROR_KEY);
  }
}

export function takeGoogleLoginResult() {
  const idToken = sessionStorage.getItem(TOKEN_KEY);
  const error = sessionStorage.getItem(ERROR_KEY);
  if (idToken) sessionStorage.removeItem(TOKEN_KEY);
  if (error) sessionStorage.removeItem(ERROR_KEY);
  if (idToken) return { idToken };
  if (error) return { error };
  return null;
}
