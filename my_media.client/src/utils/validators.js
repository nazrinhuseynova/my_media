export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isPhone(value) {
  return /^\+?[0-9]{9,15}$/.test(value.replace(/\s/g, ""));
}

export function isUsername(value) {
  return /^[a-zA-Z0-9._]{3,20}$/.test(value);
}

export function validatePassword(value) {
  if (!value || value.length < 8) return "Şifrə ən az 8 simvol olmalıdır";
  if (!/[a-z]/.test(value) || !/[0-9]/.test(value)) {
    return "Şifrədə kiçik hərf və rəqəm olmalıdır";
  }
  return "";
}

export function validateRegister(values) {
  const errors = {};
  if (!values.firstName || values.firstName.trim().length < 2) {
    errors.firstName = "Ad ən az 2 simvol olmalıdır";
  }
  if (!values.lastName || values.lastName.trim().length < 2) {
    errors.lastName = "Soyad ən az 2 simvol olmalıdır";
  }
  if (!isUsername(values.username || "")) {
    errors.username = "Username 3-20 simvol, hərf, rəqəm, . və _ ola bilər";
  }
  const contact = (values.contact || "").trim();
  if (!contact) {
    errors.contact = "Email daxil edin";
  } else if (!isEmail(contact)) {
    errors.contact = "Düzgün email yazın";
  }
  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;
  if (values.password !== values.confirmPassword) {
    errors.confirmPassword = "Şifrələr eyni deyil";
  }
  return errors;
}

export function validateLogin(values) {
  const errors = {};
  if (!(values.contact || "").trim()) errors.contact = "Email, telefon və ya username yazın";
  if (!(values.password || "").trim()) errors.password = "Şifrəni daxil edin";
  return errors;
}

export function validateOtp(code) {
  if (!/^[0-9]{6}$/.test(code || "")) return "6 rəqəmli kod daxil edin";
  return "";
}

export function validatePasswordEn(value) {
  if (!value || value.length < 8) return "Use at least 8 characters";
  if (!/[a-z]/.test(value) || !/[0-9]/.test(value)) return "Include a lowercase letter and a number";
  return "";
}

export function validateRegisterEn(values) {
  const errors = {};
  if (!values.firstName || values.firstName.trim().length < 2) errors.firstName = "First name needs at least 2 characters";
  if (!values.lastName || values.lastName.trim().length < 2) errors.lastName = "Last name needs at least 2 characters";
  if (!isUsername(values.username || "")) errors.username = "Use 3–20 characters: letters, numbers, . and _";
  const contact = (values.contact || "").trim();
  if (!contact) errors.contact = "Enter an email";
  else if (!isEmail(contact)) errors.contact = "Enter a valid email";
  const passwordError = validatePasswordEn(values.password);
  if (passwordError) errors.password = passwordError;
  if (values.password !== values.confirmPassword) errors.confirmPassword = "Passwords don't match";
  return errors;
}

export function validateLoginEn(values) {
  const errors = {};
  if (!(values.contact || "").trim()) errors.contact = "Enter an email, phone, or username";
  if (!(values.password || "").trim()) errors.password = "Enter your password";
  return errors;
}

export function validateOtpEn(code) {
  if (!/^[0-9]{6}$/.test(code || "")) return "Enter the 6-digit code";
  return "";
}

export function extractHashtags(text) {
  return Array.from(new Set((text.match(/#([a-zA-Z0-9_əöğıüçşƏÖĞIÜÇŞ]+)/g) || []).map((t) => t.slice(1).toLowerCase())));
}

export function extractMentions(text) {
  return Array.from(new Set((text.match(/@([a-zA-Z0-9._]+)/g) || []).map((t) => t.slice(1).toLowerCase())));
}
