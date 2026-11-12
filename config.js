// ここだけ自分で書き換えてください
window.APP_CONFIG = {
  // Supabase の接続情報
  SUPABASE_URL: "https://clvklweqaradoyfqjaki.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_u2nX8tbnUkrZFsn_wMiDJw_g8dPoJxi",

  // 食券販売機と同じ並び順のメニュー
  // id は重複しない文字列、price は円、bg はラベルの色、fg は文字の色(省略可)
  MENU: [
    { id: "higawari",    name: "日替り丼",         price: 380, bg: "#f6b8cc" },
    { id: "bukkake",     name: "ぶっかけうどん",   price: 250, bg: "#4aa3e8" },
    { id: "curry",       name: "カレーライス",     price: 320, bg: "#f7c92a" },
    { id: "katsucurry",  name: "カツカレー",       price: 380, bg: "#f7c92a" },
    { id: "minicurry",   name: "ミニカレー",       price: 200, bg: "#f7c92a" },
    { id: "gohan-omori", name: "ごはん大盛券",     price: 100, bg: "#4a2f2a", fg: "#ffffff" },

    { id: "wakame",      name: "わかめうどん",     price: 180 },
    { id: "kitsune",     name: "きつねうどん",     price: 180 },
    { id: "ebi",         name: "エビかき揚げうどん", price: 250 },
    { id: "niku",        name: "肉うどん",         price: 230 },
    { id: "curry-udon",  name: "カレーうどん",     price: 250 },
    { id: "men-omori",   name: "麺大盛券",         price: 100, bg: "#e0343a", fg: "#ffffff" },

    { id: "ramen",       name: "ラーメン",         price: 250, bg: "#f7c92a" },
    { id: "chashu",      name: "チャーシュー麺",   price: 300, bg: "#f7c92a" },
    { id: "curry-ramen", name: "カレーラーメン",   price: 320, bg: "#f7c92a" },

    { id: "onigiri",     name: "おむすび1個",      price: 100 },
    { id: "miso",        name: "みそ汁",           price: 50 },

    { id: "ticket50",    name: "50円券",           price: 50 },
    { id: "ticket100",   name: "100円券",          price: 100 },
    { id: "ticket150",   name: "150円券",          price: 150 },
    { id: "ticket200",   name: "200円券",          price: 200 }
  ]
};
