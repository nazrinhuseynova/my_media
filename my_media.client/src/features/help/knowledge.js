export const CHIPS = {
  start: "Nə edə bilərsən?",
  report: "Şikayəti necə göndərim?",
  reportPost: "Postu necə şikayət edim?",
  reportReel: "Reeli necə şikayət edim?",
  reportStory: "Hekayəni necə şikayət edim?",
  reportComment: "Şərhi necə şikayət edim?",
  reportUser: "Hesabı necə şikayət edim?",
  reportAfter: "Şikayətdən sonra nə olur?",
  settings: "Ayarlar haradadır?",
  password: "Şifrəni necə dəyişim?",
  language: "Dili necə dəyişim?",
  theme: "Temanı necə dəyişim?",
  private: "Hesabı necə gizlədim?",
  notify: "Bildirişləri necə sazlayım?",
  accounts: "Hesablar arasında necə keçim?",
  logout: "Hesabdan necə çıxım?",
  post: "Postu necə paylaşım?",
  story: "Hekayə necə işləyir?",
  reel: "Reel haradadır?",
  direct: "Mesajı necə yazım?",
  search: "Axtarış necə işləyir?",
  save: "Paylaşımı necə saxlayım?",
  block: "Birini necə bloklayım?",
  profile: "Profili necə dəyişim?",
  safety: "Hesabımı necə qoruyum?",
  freeze: "Hesabı necə dondurum?",
};

const LINKS = {
  settings: ["/settings", "Ayarlara keç"],
  notifications: ["/notifications", "Bildirişlərə keç"],
  direct: ["/direct", "Mesajlara keç"],
  reels: ["/reels", "Reels-ə keç"],
  search: ["/search", "Axtarışa keç"],
  explore: ["/explore", "Kəşfə keç"],
  saved: ["/saved", "Saxlanılanlara keç"],
  home: ["/", "Ana səhifəyə keç"],
};

function link(key) {
  const row = LINKS[key];
  return row ? { to: row[0], linkLabel: row[1] } : {};
}

export const ENTRIES = [
  {
    id: "start",
    keys: ["ne ede bilersen", "komek", "help", "salam", "nedir", "what can you", "basla"],
    text: "Şikayət, ayar, paylaşım, hekayə, reel, mesaj, axtarış və hesabın qorunması haqqında cavab verirəm. Sualı öz sözünlə yaz, ya da aşağıdakı hazır suallardan birini seç.",
    next: ["report", "settings", "post", "safety"],
  },
  {
    id: "report",
    keys: ["sikayet", "report", "sikayet et", "pozuntu", "spam", "uygunsuz", "complaint"],
    text: "Şikayət həmin kontentin özündən gedir. Postda, reeldə, başqasının şərhində, başqasının hekayəsində və profildə «Şikayət» düyməsi var. Öz kontentini və admin hesabını şikayət etmək olmur. Eyni şey üçün açıq şikayətin varsa, ikincisi növbəyə düşmür.",
    next: ["reportPost", "reportReel", "reportStory", "reportComment", "reportUser", "reportAfter"],
  },
  {
    id: "reportPost",
    keys: ["postu sikayet", "post sikayet", "paylasimi sikayet", "report post", "uygunsuz post"],
    text: "Postu aç. Öz postun deyilsə, orada «Şikayət et» görünür. Basanda şikayət «Uyğunsuz kontent» səbəbi ilə nəzarət növbəsinə gedir.",
    ...link("home"),
    next: ["reportAfter", "report"],
  },
  {
    id: "reportReel",
    keys: ["reel sikayet", "reeli sikayet", "report reel"],
    text: "Reels-də həmin videonun yanındakı şikayət düyməsinə bas. Şikayət «Uyğunsuz reel» kimi növbəyə düşür.",
    ...link("reels"),
    next: ["reportAfter", "reel"],
  },
  {
    id: "reportStory",
    keys: ["hekaye sikayet", "hekayeni sikayet", "story report", "story sikayet"],
    text: "Hekayəni aç. Bu, sənin hekayən deyilsə, yuxarıda «Şikayət» görünür. Yalnız son 24 saatın hekayəsi şikayət olunur.",
    ...link("home"),
    next: ["reportAfter", "story"],
  },
  {
    id: "reportComment",
    keys: ["serh sikayet", "serhi sikayet", "comment report", "yorum sikayet"],
    text: "Başqasının şərhinin altında «Şikayət» var. Bu, həm post şərhinə, həm də reel şərhinə aiddir. Öz şərhini şikayət etmək əvəzinə silə bilərsən.",
    next: ["reportAfter", "report"],
  },
  {
    id: "reportUser",
    keys: ["hesabi sikayet", "hesab sikayet", "profili sikayet", "report user", "adam sikayet"],
    text: "Həmin adamın profilini aç. «Şikayət et» düyməsi hesabı «Uyğunsuz hesab» səbəbi ilə növbəyə salır. Öz hesabını və admin hesabını şikayət etmək olmur.",
    next: ["reportAfter", "block"],
  },
  {
    id: "reportAfter",
    keys: ["sikayetden sonra", "sikayet ne olur", "novbe", "baxilirmi", "report status", "cavab gelirmi"],
    text: "Şikayət açıq növbəyə düşür. Nəzarət onu rədd edə, kontenti götürə və ya hesabı 7 gün, 30 gün yaxud həmişəlik bloklaya bilər. Sənə ayrıca bir izləmə səhifəsi açılmır. Eyni hədəf bağlananda onun açıq şikayətləri birlikdə bağlanır.",
    next: ["report", "block", "safety"],
  },
  {
    id: "settings",
    keys: ["ayar", "settings", "tenzimleme", "sazlama", "haradadir ayar"],
    text: "Ayarlar profil, şifrə, bildiriş, dil, hesablar, sessiyalar və hesabı bağlamaq üçündür. Telefonda «Daha çox», sonra «Ayarlar». Geniş ekranda sol menyudakı Ayarlar.",
    ...link("settings"),
    next: ["password", "language", "theme", "notify", "private"],
  },
  {
    id: "password",
    keys: ["sifre", "password", "parol", "sifreni deyis", "unutdum"],
    text: "Daxil olanda şifrəni Ayarlar bölməsində dəyişirsən: cari şifrə, yeni şifrə və təkrar. Giriş səhifəsindəsənsə, «Forgot password?» ilə koda keçirsən.",
    ...link("settings"),
    next: ["safety", "settings"],
  },
  {
    id: "language",
    keys: ["dil", "language", "azerba", "english", "dili deyis"],
    text: "Dil bu hesabda qalır. «Daha çox» və ya sol menyudakı «Dil» düyməsi siyahını açır. Növbəti girişdə sayt həmin dildə açılır.",
    next: ["settings", "theme"],
  },
  {
    id: "theme",
    keys: ["tema", "theme", "qaranliq", "aciq tema", "dark", "light"],
    text: "Açıq və qaranlıq tema «Daha çox» menyusundakı tema düyməsindədir. Geniş ekranda sol menyunun aşağısındadır. Seçim bu cihazda qalır.",
    next: ["settings", "language"],
  },
  {
    id: "private",
    keys: ["gizli", "private", "hesabi gizle", "gizli hesab", "sorgu"],
    text: "Ayarlarda «Gizli hesab»ı açanda səni izləmək üçün sorğu lazımdır. Qəbul etmədiyin adam paylaşımını görmür. Sorğular bildirişlərdə görünür.",
    ...link("settings"),
    next: ["notify", "block"],
  },
  {
    id: "notify",
    keys: ["bildiris", "notification", "xeber", "zeng", "sazla bildiris"],
    text: "Bildirişlər ayrıca səhifədədir. Hansının gələcəyini Ayarlar bölməsində seçirsən: bəyənmə, şərh, izləmə, işarə və mesaj.",
    ...link("notifications"),
    next: ["settings", "direct"],
  },
  {
    id: "accounts",
    keys: ["hesablar", "hesaba kec", "switch account", "basqa hesab", "elave et"],
    text: "Bu cihazda saxlanan hesaba «Daha çox», sonra «Hesablar» ilə keçirsən. Keçid şifrə soruşmur. Yeni hesab əlavə etmək də oradadır. Admin hesabı başqa hesabın üstünə əlavə olunmur, o, ayrı girişdir.",
    next: ["logout", "settings"],
  },
  {
    id: "logout",
    keys: ["cixis", "logout", "hesabdan cix", "sign out"],
    text: "Ayarların aşağısında «Bu hesabdan çıx» yalnız bu hesabı bağlayır. «Bütün hesablardan çıx» bu cihazdakı saxlanan hesabları da bağlayır.",
    ...link("settings"),
    next: ["accounts", "safety"],
  },
  {
    id: "post",
    keys: ["post", "paylas", "paylasim", "yarat", "sekil", "foto", "caption"],
    text: "«Paylaş» və ya «Yarat» düyməsi yeni post açır. Şəkil və ya video, mətn, yer və etiketlər ora yazılır. Lentdə reaksiya, şərh, saxlama və yenidən paylaşım var.",
    ...link("home"),
    next: ["story", "reel", "save", "reportPost"],
  },
  {
    id: "story",
    keys: ["hekaye", "story", "stories", "24 saat", "secilmis"],
    text: "Hekayə 24 saat görünür. Lentdə «Sənin hekayən» ilə əlavə edirsən. Başqasının hekayəsinə cavab yazmaq olur. Öz hekayəni «Seçilmişə yaz» ilə profilində saxlamaq olur.",
    ...link("home"),
    next: ["reportStory", "post"],
  },
  {
    id: "reel",
    keys: ["reel", "reels", "video lent", "qisa video"],
    text: "Reels qısa video lentidir. Aşağı və ya sol menyudan Reels-ə keç. Videonu bəyənmək, şərh yazmaq, saxlamaq, paylaşmaq və şikayət etmək olur.",
    ...link("reels"),
    next: ["reportReel", "post"],
  },
  {
    id: "direct",
    keys: ["mesaj", "direct", "dm", "yazis", "chat", "sohbet"],
    text: "Mesajlar birbaşa söhbətdir. «Daha çox»dakı Mesajlar, ya da sol menyudakı eyni bənd. Yalnız aktiv hesabla yazışırsan. Bildirişini Ayarlardan bağlaya bilərsən.",
    ...link("direct"),
    next: ["notify", "block"],
  },
  {
    id: "search",
    keys: ["axtar", "search", "kesf", "explore", "hashtag", "tag"],
    text: "Axtarış adam, paylaşım və teq tapır. Kəşf isə sənin lentindən kənar paylaşımları göstərir. Teqə basanda həmin teqin səhifəsi açılır.",
    ...link("search"),
    next: ["post", "profile"],
  },
  {
    id: "save",
    keys: ["saxla", "save", "bookmark", "saxlanilan", "arsiv", "qaralama", "beyenilen"],
    text: "Paylaşımın altındakı saxla düyməsi onu Saxlanılanlara qoyur. Arxiv gizlədilmiş postlardır, qaralamalar isə hələ paylaşılmayanlardır. Reaksiya verdiyin kadrlar Bəyənilənlərdə qalır. Hamısı Ayarlar bölməsinin kolleksiya hissəsindədir.",
    ...link("saved"),
    next: ["settings", "post"],
  },
  {
    id: "block",
    keys: ["blok", "block", "sessiz", "mute", "yaxin cevre", "close friend"],
    text: "Profilində «Blokla» həmin adamın səninlə əlaqəsini kəsir. «Səssiz» yazılarını lentindən yığışdırır, amma izləmə qalır. «Yaxın çevrə» yalnız seçdiyin adamlara açılan hekayə üçündür.",
    next: ["reportUser", "private"],
  },
  {
    id: "profile",
    keys: ["profil", "profile", "bio", "sekil deyis", "avatar", "istifadeci adi", "ad deyis"],
    text: "Ad, istifadəçi adı, haqqında, sayt və profil şəkli Ayarlardadır. «Yadda saxla» basanda profil yenilənir. Profil səhifəndə paylaşımların görünür.",
    ...link("settings"),
    next: ["private", "password"],
  },
  {
    id: "safety",
    keys: ["tehlukesizlik", "security", "sessiya", "cihaz", "qoru", "giris"],
    text: "Ayarlarda cari şifrəni dəyişirsən və açıq sessiyaları görürsən. Tanımadığın cihazı oradan bağla. Şifrəni başqası ilə paylaşma.",
    ...link("settings"),
    next: ["password", "logout", "freeze"],
  },
  {
    id: "freeze",
    keys: ["dondur", "hesabi sil", "delete account", "freeze", "deaktiv", "bagla hesab"],
    text: "Ayarların ən altında hesabı bağlamaq var. Dondurma girişi bağlayır, məlumat qalır. Silmə adı və profili götürür. Bu addım geri alınmır, ona görə əvvəl əmin ol.",
    ...link("settings"),
    next: ["logout", "safety"],
  },
  {
    id: "banned",
    keys: ["ban", "dayandir", "bloklanmisam", "hesab baglanib", "suspended"],
    text: "Hesab dayandırılanda girişdə bunun müddəti yazılır. Müddət bitəndə blok özü açılır. Həmişəlik blokda hesab bağlı qalır. Bu, nəzarətin şikayət əsasında verdiyi qərardır.",
    next: ["reportAfter", "safety"],
  },
];

export function starterChips(path) {
  if (path.startsWith("/settings")) return ["password", "language", "private", "notify", "safety"];
  if (path.startsWith("/direct")) return ["direct", "notify", "block"];
  if (path.startsWith("/reels")) return ["reel", "reportReel", "save"];
  if (path.startsWith("/notifications")) return ["notify", "private", "settings"];
  if (path.startsWith("/search") || path.startsWith("/explore")) return ["search", "post", "report"];
  if (path.startsWith("/profile")) return ["profile", "reportUser", "block", "private"];
  if (path.startsWith("/saved") || path.startsWith("/archive") || path.startsWith("/drafts") || path.startsWith("/liked")) return ["save", "post", "settings"];
  return ["report", "settings", "post", "story", "safety"];
}

export function chipsOf(ids) {
  return ids.filter((id) => CHIPS[id]).map((id) => ({ id, label: CHIPS[id] }));
}
