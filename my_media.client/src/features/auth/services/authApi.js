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
  [/ilə qeydiyyatdadır/i, "This email is already registered. Sign in the same way you created it."],
  [/admin ayrıca hesabdır/i, "Admin is a separate account and can't be opened from here"],
  [/facebook ilə daxil olmaq hazırda/i, "Facebook sign-in isn't available right now"],
  [/google ilə daxil olmaq hazırda/i, "Google sign-in isn't available right now"],
  [/apple ilə daxil olmaq hazırda/i, "Apple sign-in isn't available right now"],
  [/facebook ilə daxil olmaq alınmadı/i, "Facebook sign-in didn't work"],
  [/google ilə daxil olmaq alınmadı/i, "Google sign-in didn't work"],
  [/apple ilə daxil olmaq alınmadı/i, "Apple sign-in didn't work"],
  [/bu hesabın emaili görünmür/i, "This account's email isn't available"],
  [/istifadəçi tapılmadı/i, "No account found"],
  [/kodu göndərmək alınmadı|kod göndərilmədi/i, "Couldn't send the code. Try again in a moment"],
  [/bağlantı alınmadı/i, "Couldn't connect. Try again in a moment"],
  [/hesab müvəqqəti bağlıdır/i, "This account is temporarily locked. Try again later"],
  [/kodu təsdiqləyin/i, "Enter the code sent to your email first"],
  [/qeydiyyat üçün email/i, "An email is required to sign up"],
  [/ad və soyad/i, "Enter your first and last name"],
  [/istifadəçi adı 3-20/i, "Use 3–20 characters: letters, numbers, . and _"],
  [/şifrə ən az|şifrədə kiçik hərf/i, "Use at least 8 characters, with a lowercase letter and a number"],
  [/kod yanlışdır/i, "That code is wrong or expired"],
];

export function guestMessage(err, fallback) {
  const raw = !err?.response
    ? "Couldn't connect. Try again in a moment"
    : String(err.response.data?.message || "");
  const hit = GUEST_ERRORS.find(([pattern]) => pattern.test(raw));
  return hit ? hit[1] : fallback;
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
