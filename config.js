// ここだけ自分で書き換えてください
window.APP_CONFIG = {
  // Supabase の Project Settings > API にある値
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "ここにanon publicキーを貼る",

  // 食堂のメニュー(id は重複しない文字列、price は円)
  MENU: [
    { id: "a", name: "A定食", price: 500 },
    { id: "b", name: "B定食", price: 450 },
    { id: "c", name: "カレー", price: 400 },
    { id: "d", name: "うどん", price: 300 },
    { id: "e", name: "ごはん(大)", price: 100 }
  ]
};
