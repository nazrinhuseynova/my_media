import { api } from "../../../services/api";

export function authMessage(err, fallback) {
  if (!err?.response) return "Bağlantı alınmadı. Bir az sonra yenidən cəhd et";
  return err.response.data?.message || fallback;
}

const GUEST_ERRORS = [
  [/email mövcud deyil/i, "This email doesn't exist"],
  [/istifadəçi adı və ya şifrə/i, "Incorrect username or password"],
  [/bu istifadəçi artıq mövcuddur/i, "This username is already taken"],
  [/bu email artıq istifadə olunur/i, "This email is already in use"],
  [/admin ayrıca hesabdır/i, "Admin is a separate account and can't be opened from here"],
  [/bu üsulla daxil olmaq hazırda/i, "This sign-in method isn't available right now"],
  [/facebook ilə daxil olmaq hazırda/i, "Facebook sign-in isn't available right now"],
  [/google ilə daxil olmaq hazırda/i, "Google sign-in isn't available right now"],
  [/apple ilə daxil olmaq hazırda/i, "Apple sign-in isn't available right now"],
  [/github ilə daxil olmaq hazırda/i, "GitHub sign-in isn't available right now"],
  [/microsoft ilə daxil olmaq hazırda/i, "Microsoft sign-in isn't available right now"],
  [/facebook ilə daxil olmaq alınmadı/i, "Facebook sign-in didn't work"],
  [/google ilə daxil olmaq alınmadı/i, "Google sign-in didn't work"],
  [/apple ilə daxil olmaq alınmadı/i, "Apple sign-in didn't work"],
  [/github ilə daxil olmaq alınmadı/i, "GitHub sign-in didn't work"],
  [/microsoft ilə daxil olmaq alınmadı/i, "Microsoft sign-in didn't work"],
  [/google emaili təsdiqlənməyib/i, "Confirm your Google email, then try again"],
  [/bu hesabın emaili görünmür/i, "This account's email isn't available"],
  [/istifadəçi tapılmadı/i, "No account found"],
  [/kodu göndərmək alınmadı|kod göndərilmədi/i, "Couldn't send the code. Try again in a moment"],
  [/bağlantı alınmadı/i, "Couldn't connect. Try again in a moment"],
  [/hesab müvəqqəti bağlıdır/i, "This account is temporarily locked. Try again later"],
  [/hesab deaktivdir/i, "This account is deactivated"],
  [/kodu təsdiqləyin/i, "Enter the code sent to your email first"],
  [/qeydiyyat üçün email/i, "An email is required to sign up"],
  [/ad və soyad/i, "Enter your first and last name"],
  [/istifadəçi adı 3-20/i, "Use 3–20 characters: letters, numbers, . and _"],
  [/şifrə ən az|şifrədə kiçik hərf|şifrədə rəqəm|şifrədə böyük hərf/i, "Use at least 8 characters, with a lowercase letter and a number"],
  [/şifrə kodu yanlışdır|kod yanlışdır/i, "That code is wrong or expired"],
  [/cari şifrə yanlışdır/i, "Current password is incorrect"],
  [/məlumat qəbul olunmadı/i, "Those details weren't accepted. Check and try again"],
  [/skript yüklənmədi/i, "Couldn't load the sign-in script. Check your connection"],
  [/google token gəlmədi|google pəncərəsi açılmadı/i, "Google sign-in didn't work"],
  [/apple token gəlmədi/i, "Apple sign-in didn't work"],
  [/bu əməliyyat alınmadı/i, "That didn't work. Try again"],
];

function rawText(err) {
  if (err?.response) return String(err.response.data?.message || "");
  return String(err?.message || err?.error || "");
}

export function guestMessage(err, fallback) {
  if (!err?.response && !err?.message && !err?.error) {
    return "Couldn't connect. Try again in a moment";
  }
  const raw = rawText(err);
  if (!err?.response && /network|timeout|failed to fetch|err_network/i.test(raw)) {
    return "Couldn't connect. Try again in a moment";
  }
  if (/cancelled|popup_closed|user_cancelled/i.test(raw)) return "";
  const hit = GUEST_ERRORS.find(([pattern]) => pattern.test(raw));
  if (hit) return hit[1];
  if (raw && !/[əöğışüçƏÖĞIÜÇŞ]/.test(raw) && !/exception|stack trace|smtp|jwt |object reference|sql/i.test(raw)) {
    return raw;
  }
  return fallback;
}

export const authApi = {
  register: (body) => api.post("/api/auth/register", body),
  verifyOtp: (body) => api.post("/api/auth/verify-otp", body),
  resendOtp: (body) => api.post("/api/auth/resend-otp", body),
  forgot: (body) => api.post("/api/auth/forgot-password", body),
  reset: (body) => api.post("/api/auth/reset-password", body),
  changePassword: (body) => api.post("/api/auth/change-password", body),
  deactivate: () => api.post("/api/auth/deactivate"),
  removeAccount: () => api.delete("/api/auth/account"),
  sessions: () => api.get("/api/auth/sessions"),
  revokeSession: (id) => api.delete(`/api/auth/sessions/${id}`),
  revokeOtherSessions: () => api.post("/api/auth/sessions/revoke-others"),
};
